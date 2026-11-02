import { defineChain } from "viem";
import { robinhood } from "viem/chains";

export const OFFICIAL_RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
export const EXPLORER_URL = "https://robinhoodchain.blockscout.com";

// viem's built-in definition also lists a third-party RPC; we only talk to the official one.
export const robinhoodChain = defineChain({
  ...robinhood,
  rpcUrls: { default: { http: [OFFICIAL_RPC_URL] } },
});

export const CHAIN_ID = robinhoodChain.id; // 4663, verified via eth_chainId

export const explorerTx = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const explorerAddress = (address: string) => `${EXPLORER_URL}/address/${address}`;
