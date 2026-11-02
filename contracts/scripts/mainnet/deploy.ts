// Deploys Lastbell to Robinhood Chain mainnet.
//   Dry run (default, no key needed): npx tsx scripts/mainnet/deploy.ts
//   Broadcast (uses DEPLOYER_PRIVATE_KEY from contracts/.env): BROADCAST=1 npx tsx scripts/mainnet/deploy.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { createWalletClient, encodeDeployData, formatEther, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhoodChain } from "@lastbell/shared";
import { BROADCAST, DEPLOYMENT_FILE, MARKET_CONFIGS, PARAMS, RPC_URL, artifact, keyFromEnv, publicClient, type Deployment } from "./config.js";

const chainId = await publicClient.getChainId();
if (chainId !== 4663) throw new Error(`Connected to chain ${chainId}, expected 4663`);

// Every address must be a contract before anything is sent.
const addrs: [string, Address][] = [
  ["WIF", PARAMS.wif],
  ["USDG", PARAMS.quote],
  ["SwapRouter02", PARAMS.router],
  ...MARKET_CONFIGS.flatMap((m, i): [string, Address][] => [
    [`market ${i} token`, m.token],
    [`market ${i} feed`, m.feed],
    [`market ${i} pool`, m.pool],
  ]),
];
for (const [name, a] of addrs) {
  const code = await publicClient.getCode({ address: a });
  if (!code || code === "0x") throw new Error(`${name} ${a} has no code`);
}

const { abi, bytecode } = artifact();
const data = encodeDeployData({ abi, bytecode, args: [PARAMS, MARKET_CONFIGS] } as never);
const from: Address = BROADCAST ? privateKeyToAccount(keyFromEnv("DEPLOYER_PRIVATE_KEY")).address : "0x000000000000000000000000000000000000dEaD";

// Runs the constructor against the real tokens, feeds and pools; reverts here if any of them mismatch.
const gas = await publicClient.estimateGas({ account: from, data });
const gasPrice = await publicClient.getGasPrice();
console.log(`Constructor OK against mainnet. Gas ${gas}, ≈ ${formatEther(gas * gasPrice)} ETH at current price.`);
console.log(`Params: minFee 20 WIF · minBond 20,000 WIF · slash 2,000 WIF · claim window ${PARAMS.claimWindow}s · grace ${PARAMS.graceSeconds}s · max slippage ${PARAMS.maxSlippageBps / 100}%`);
console.log(`Markets: SPY, NVDA, AAPL (band 1.5%)`);

if (!BROADCAST) {
  console.log("\nDry run only. Nothing was sent.");
  process.exit(0);
}

const account = privateKeyToAccount(keyFromEnv("DEPLOYER_PRIVATE_KEY"));
const balance = await publicClient.getBalance({ address: account.address });
if (balance < (gas * gasPrice * 3n) / 2n) throw new Error(`Deployer ${account.address} has ${formatEther(balance)} ETH, not enough for gas`);
const wallet = createWalletClient({ account, chain: robinhoodChain, transport: http(RPC_URL) });
const hash = await wallet.sendTransaction({ data, gas: (gas * 12n) / 10n });
console.log(`Sent ${hash}, waiting…`);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`Deployment failed: ${hash}`);

const deployment: Deployment = {
  chainId,
  lastbell: receipt.contractAddress,
  deployer: account.address,
  txHash: hash,
  block: receipt.blockNumber.toString(),
  deployedAt: new Date().toISOString(),
  params: Object.fromEntries(Object.entries(PARAMS).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v])),
  markets: (["SPY", "NVDA", "AAPL"] as const).map((symbol, i) => ({ symbol, token: MARKET_CONFIGS[i]!.token, feed: MARKET_CONFIGS[i]!.feed, pool: MARKET_CONFIGS[i]!.pool })),
};
mkdirSync(new URL(".", DEPLOYMENT_FILE), { recursive: true });
writeFileSync(DEPLOYMENT_FILE, JSON.stringify(deployment, null, 2) + "\n");
console.log(`\nLastbell deployed at ${deployment.lastbell} in block ${deployment.block}.`);
console.log(`Recorded in contracts/deployments/robinhood-mainnet.json`);
