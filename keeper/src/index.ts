import { robinhoodChain } from "@lastbell/shared";
import { createPublicClient, http, type PublicClient } from "viem";
import { readStatus } from "./markets.js";

export interface Env {
  RPC_URL: string;
  KEEPER_PRIVATE_KEY?: string;
}

const client = (env: Env) => createPublicClient({ chain: robinhoodChain, transport: http(env.RPC_URL) }) as PublicClient;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "no-store" },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/status") {
      try {
        return json(await readStatus(client(env)));
      } catch (err) {
        return json({ error: (err as Error).message }, 502);
      }
    }
    return json({ name: "lastbell-keeper", endpoints: ["/status"] });
  },

  // Runs every minute. Order execution lands in task 5; for now it records market state.
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const status = await readStatus(client(env));
    const summary = status.markets.map((m) => `${m.symbol}:${m.freshness.fresh ? "fresh" : m.freshness.reason}`).join(" ");
    console.log(`block ${status.block} open=${status.clock.open} ${summary}`);
  },
} satisfies ExportedHandler<Env>;
