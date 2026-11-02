import { UNISWAP_V3, robinhoodChain } from "@lastbell/shared";
import { createPublicClient, createWalletClient, http, isAddress, type Address, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { errorText, runOnce, type RunReport } from "./engine.js";
import { readStatus } from "./markets.js";
import { readContractStatus } from "./status.js";

export interface Env {
  RPC_URL: string;
  /** Set after deployment (task 8). Until then the keeper reports "not configured". */
  LASTBELL_ADDRESS?: string;
  QUOTER_ADDRESS?: string;
  /** Secret: `wrangler secret put KEEPER_PRIVATE_KEY`. Never in config or git. */
  KEEPER_PRIVATE_KEY?: string;
  /** Optional KV for the run log shown on /status. */
  STATE?: KVNamespace;
}

// KV free tier allows 1,000 writes a day; a run that did nothing is only recorded every 10 minutes.
const HEARTBEAT_MINUTES = 10;

const publicClient = (env: Env) =>
  createPublicClient({ chain: robinhoodChain, transport: http(env.RPC_URL, { retryCount: 3, retryDelay: 500 }) }) as PublicClient;

const lastbellAddress = (env: Env): Address | undefined =>
  env.LASTBELL_ADDRESS && isAddress(env.LASTBELL_ADDRESS) ? env.LASTBELL_ADDRESS : undefined;

const keeperAccount = (env: Env) =>
  env.KEEPER_PRIVATE_KEY ? privateKeyToAccount(env.KEEPER_PRIVATE_KEY as `0x${string}`) : undefined;

const json = (body: unknown, status = 200, maxAge = 0) =>
  new Response(JSON.stringify(body, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store",
    },
  });

type StoredRun = (RunReport & { ok: true }) | { ok: false; at: string; error: string } | { ok: false; at: string; configured: false; missing: string[] };

async function record(env: Env, run: StoredRun, minute: number) {
  if (!env.STATE) return;
  const eventful = "results" in run && run.results.length > 0;
  if (eventful) await env.STATE.put("last-action", JSON.stringify(run));
  if (eventful || !run.ok || minute % HEARTBEAT_MINUTES === 0) await env.STATE.put("last-run", JSON.stringify(run));
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/status") return json({ name: "lastbell-keeper", endpoints: ["/status"] });

    // Edge-cache for a few seconds so a busy dashboard can't hammer the RPC.
    const cache = caches.default;
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const address = lastbellAddress(env);
      const client = publicClient(env);
      const [chain, lastRun, lastAction] = await Promise.all([
        address ? readContractStatus(client, address, keeperAccount(env)?.address) : readStatus(client).then((s) => ({ configured: false, ...s })),
        env.STATE?.get("last-run", "json") ?? null,
        env.STATE?.get("last-action", "json") ?? null,
      ]);
      const res = json({ name: "lastbell-keeper", cron: "every minute", ...chain, lastRun, lastAction }, 200, 5);
      ctx.waitUntil(cache.put(request, res.clone()));
      return res;
    } catch (err) {
      return json({ error: errorText(err) }, 502);
    }
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const minute = new Date(controller.scheduledTime).getUTCMinutes();
    const at = new Date(controller.scheduledTime).toISOString();
    const lastbell = lastbellAddress(env);
    const account = keeperAccount(env);
    if (!lastbell || !account) {
      const missing = [!lastbell && "LASTBELL_ADDRESS", !account && "KEEPER_PRIVATE_KEY"].filter(Boolean) as string[];
      console.log(`not configured: missing ${missing.join(", ")}`);
      await record(env, { ok: false, at, configured: false, missing }, minute);
      return;
    }
    try {
      const wallet = createWalletClient({ account, chain: robinhoodChain, transport: http(env.RPC_URL) });
      const report = await runOnce(publicClient(env), wallet, {
        lastbell,
        quoter: (env.QUOTER_ADDRESS as Address | undefined) ?? UNISWAP_V3.quoterV2,
      });
      const done = report.results.map((r) => `${r.kind}#${r.orderId}:${r.ok ? "ok" : r.note}`).join(" ");
      console.log(`block ${report.block} open=${report.open} ${done || "no actions"} skipped=${JSON.stringify(report.skipped)}`);
      await record(env, { ok: true, ...report }, minute);
    } catch (err) {
      const error = errorText(err);
      console.error(`run failed: ${error}`);
      await record(env, { ok: false, at, error }, minute);
    }
  },
} satisfies ExportedHandler<Env>;
