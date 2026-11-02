import { robinhoodChain } from "@lastbell/shared";
import { createPublicClient, http } from "viem";

// The public RPC rate-limits bursts (HTTP 429); retry with backoff and batch through multicall.
export const client = createPublicClient({
  chain: robinhoodChain,
  transport: http(process.env.ROBINHOOD_RPC_URL ?? robinhoodChain.rpcUrls.default.http[0], { retryCount: 10, retryDelay: 1500 }),
  batch: { multicall: { batchSize: 4096 } },
});

export const CHAINLINK_DIRECTORY = "https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json";
