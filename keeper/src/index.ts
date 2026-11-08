import { UNISWAP_V3, robinhoodChain } from "@lastbell/shared";
import { createPublicClient, createWalletClient, http, isAddress, type Address, type PublicClient } from "viem";
import { errorText, runOnce, type RunReport } from "./engine.js";
import { readKeeperKey } from "./key.js";
import { readStatus } from "./markets.js";
import { redact } from "./redact.js";
import { readContractStatus } from "./status.js";

export interface Env {
  RPC_URL: string;
  /**
   * Secret: a private RPC endpoint (for example an Alchemy URL containing an API key), set with
   * `wrangler secret put RPC_URL_PRIVATE`. Preferred over RPC_URL: the public RPC is rate-limited per IP,
   * Cloudflare egress addresses are shared, and Robinhood Chain's docs say not to use it in production.
   */
  RPC_URL_PRIVATE?: string;
  /** Lastbell contract. Until set the keeper reports "not configured". */
  LASTBELL_ADDRESS?: string;
  QUOTER_ADDRESS?: string;
  /** Secret: `wrangler secret put KEEPER_PRIVATE_KEY`. Never in config or git. */
  KEEPER_PRIVATE_KEY?: string;
  /** KV for the run log and the cached status snapshot shown on /status. */
  STATE?: KVNamespace;
}

// KV free tier allows 1,000 writes a day. A run is recorded when it did something or its outcome changed, plus a
// heartbeat every 10 minutes; the status snapshot is refreshed every 3 minutes: about 650 writes a day at most.
const HEARTBEAT_MINUTES = 10;
const STATUS_REFRESH_MINUTES = 3;
/** A cached snapshot younger than this is served without touching the RPC at all. */
const SNAPSHOT_FRESH_SECONDS = 300;

const rpcUrl = (env: Env) => env.RPC_URL_PRIVATE || env.RPC_URL;

// Every read goes through Multicall3, so a whole snapshot is a handful of requests instead of ~25.
const publicClient = (env: Env) =>
  createPublicClient({
    chain: robinhoodChain,
    transport: http(rpcUrl(env), { retryCount: 2, retryDelay: 2000 }),
    batch: { multicall: true },
  }) as PublicClient;

const lastbellAddress = (env: Env): Address | undefined =>
  env.LASTBELL_ADDRESS && isAddress(env.LASTBELL_ADDRESS) ? env.LASTBELL_ADDRESS : undefined;

const keeperKey = (env: Env) => readKeeperKey(env.KEEPER_PRIVATE_KEY);
const keeperAccount = (env: Env) => {
  const k = keeperKey(env);
  return k && "account" in k ? k.account : undefined;
};

// Everything the Worker serves or stores is scrubbed of the RPC URL, the key and URL paths first (see redact.ts).
let secrets: (string | undefined)[] = [];
const useSecrets = (env: Env) => (secrets = [env.RPC_URL_PRIVATE, env.RPC_URL, env.KEEPER_PRIVATE_KEY]);
const scrub = (text: string) => redact(text, secrets);

const json = (body: unknown, status = 200, maxAge = 0) =>
  new Response(scrub(JSON.stringify(body, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2)), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store",
    },
  });

type StoredRun = (RunReport & { ok: true }) | { ok: false; at: string; error: string } | { ok: false; at: string; configured: false; missing: string[] };

const signature = (run: StoredRun) => JSON.stringify({ ok: run.ok, error: "error" in run ? run.error : null, missing: "missing" in run ? run.missing : null });

/** Bookkeeping must never get in the way of trading: a KV outage or quota error is logged and ignored. */
async function safeRecord(env: Env, run: StoredRun, minute: number) {
  try {
    await record(env, run, minute);
  } catch (err) {
    console.error(`could not record run: ${scrub(errorText(err))}`);
  }
}

async function record(env: Env, run: StoredRun, minute: number) {
  if (!env.STATE) return;
  const eventful = "results" in run && run.results.length > 0;
  if (eventful) await env.STATE.put("last-action", scrub(JSON.stringify(run)));
  const previous = (await env.STATE.get("last-run", "json")) as StoredRun | null;
  const changed = !previous || signature(previous) !== signature(run);
  if (eventful || changed || minute % HEARTBEAT_MINUTES === 0) await env.STATE.put("last-run", scrub(JSON.stringify(run)));
}

interface Snapshot {
  savedAt: number;
  chain: Record<string, unknown>;
}

async function liveStatus(env: Env): Promise<Record<string, unknown>> {
  const address = lastbellAddress(env);
  const client = publicClient(env);
  return address
    ? await readContractStatus(client, address, keeperAccount(env)?.address)
    : { configured: false, ...(await readStatus(client)) };
}

async function refreshSnapshot(env: Env) {
  if (!env.STATE) return;
  try {
    const chain = await liveStatus(env);
    await env.STATE.put("status", JSON.stringify({ savedAt: Math.floor(Date.now() / 1000), chain } satisfies Snapshot));
  } catch (err) {
    console.error(`status snapshot failed: ${errorText(err)}`);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    useSecrets(env);
    const url = new URL(request.url);
    if (url.pathname !== "/status") return json({ name: "lastbell-keeper", endpoints: ["/status"] });

    // One cache entry for /status whatever the query string, so ?x=1, ?x=2 ... cannot dodge the cache and spend KV reads.
    const cache = caches.default;
    const cacheKey = new Request(`${url.origin}/status`);
    const edge = await cache.match(cacheKey);
    if (edge) return edge;

    const [lastRun, lastAction, snapshot] = await Promise.all([
      env.STATE?.get("last-run", "json") ?? null,
      env.STATE?.get("last-action", "json") ?? null,
      (env.STATE?.get("status", "json") ?? null) as Promise<Snapshot | null>,
    ]);
    const age = snapshot ? Math.floor(Date.now() / 1000) - snapshot.savedAt : null;
    const head = { name: "lastbell-keeper", cron: "every minute" };

    // Normal case: serve the snapshot the cron saved. No RPC call at all.
    if (snapshot && age !== null && age < SNAPSHOT_FRESH_SECONDS) {
      const res = json({ ...head, ...snapshot.chain, source: "snapshot", snapshotAgeSeconds: age, lastRun, lastAction }, 200, 20);
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
      return res;
    }
    try {
      const res = json({ ...head, ...(await liveStatus(env)), source: "live", lastRun, lastAction }, 200, 20);
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
      return res;
    } catch (err) {
      const e = err as { details?: string; status?: number; cause?: { message?: string } };
      const details = e.details ?? e.cause?.message;
      // The RPC is failing: an old snapshot is still more useful than an error, as long as it says it is old.
      if (snapshot) return json({ ...head, ...snapshot.chain, source: "stale-snapshot", stale: true, snapshotAgeSeconds: age, rpcError: details ?? errorText(err), lastRun, lastAction }, 200);
      return json({ error: errorText(err), status: e.status, details, lastRun, lastAction }, 502);
    }
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    useSecrets(env);
    const minute = new Date(controller.scheduledTime).getUTCMinutes();
    const at = new Date(controller.scheduledTime).toISOString();
    const lastbell = lastbellAddress(env);
    const key = keeperKey(env);
    const account = key && "account" in key ? key.account : undefined;
    const wantSnapshot = minute % STATUS_REFRESH_MINUTES === 0;

    if (!lastbell || !account) {
      const missing = [!lastbell && "LASTBELL_ADDRESS", !account && (key && "problem" in key ? key.problem : "KEEPER_PRIVATE_KEY")].filter(Boolean) as string[];
      console.log(`not configured: missing ${missing.join(", ")}`);
      await safeRecord(env, { ok: false, at, configured: false, missing }, minute);
      if (wantSnapshot) await refreshSnapshot(env);
      return;
    }
    let acted = false;
    try {
      const wallet = createWalletClient({ account, chain: robinhoodChain, transport: http(rpcUrl(env)) });
      const report = await runOnce(publicClient(env), wallet, {
        lastbell,
        quoter: (env.QUOTER_ADDRESS as Address | undefined) ?? UNISWAP_V3.quoterV2,
      }, Math.floor(controller.scheduledTime / 60_000));
      const done = report.results.map((r) => `${r.kind}#${r.orderId}:${r.ok ? "ok" : r.note}`).join(" ");
      console.log(`block ${report.block} open=${report.open} ${done || "no actions"} skipped=${JSON.stringify(report.skipped)}`);
      await safeRecord(env, { ok: true, ...report }, minute);
      acted = report.results.length > 0;
    } catch (err) {
      const e = err as { details?: string };
      const error = `${errorText(err)}${e.details ? `: ${e.details}` : ""}`;
      console.error(`run failed: ${error}`);
      await safeRecord(env, { ok: false, at, error }, minute);
    }
    // The snapshot is refreshed after trading, so a slow or rate-limited status read never delays an execution.
    // After a run that claimed, filled or refunded something, refresh at once so /status shows the new totals.
    if (wantSnapshot || acted) await refreshSnapshot(env);
  },
} satisfies ExportedHandler<Env>;
