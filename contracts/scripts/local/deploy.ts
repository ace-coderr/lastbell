// Local test chain only: deploys Lastbell with mock tokens, feeds and pools to `hardhat node`,
// funds Hardhat's default accounts and points the web app at it (web/.env.local, gitignored).
//
//   npx hardhat node
//   npx hardhat run --network localhost scripts/local/deploy.ts
import { mkdir, writeFile } from "node:fs/promises";
import { network } from "hardhat";
import { parseUnits } from "viem";
import { LOCAL_FILE, STATE_FILE, sqrtPriceFor, type LocalDeployment } from "./helpers.js";

const { viem } = await network.getOrCreate();
const publicClient = await viem.getPublicClient();
const [user, keeper] = await viem.getWalletClients();
const now = (await publicClient.getBlock()).timestamp;

const wif = await viem.deployContract("MockBurnableToken", ["World is Flat", "WIF", 18]);
const usdg = await viem.deployContract("MockBurnableToken", ["Global Dollar", "USDG", 6]);
const router = await viem.deployContract("MockSwapRouter");

const PRICES: [string, string][] = [
  ["SPY", "763.69"],
  ["NVDA", "207.65"],
  ["AAPL", "339.91"],
];
const markets: LocalDeployment["markets"] = [];
const configs = [];
for (const [symbol, price] of PRICES) {
  const token = await viem.deployContract("MockStockToken", [`${symbol} (local)`, symbol]);
  const p8 = parseUnits(price, 8);
  const feed = await viem.deployContract("MockAggregator", [8, p8, now]);
  const stockIsToken0 = BigInt(token.address) < BigInt(usdg.address);
  const pool = await viem.deployContract("MockUniswapV3Pool", [token.address, usdg.address, 500, sqrtPriceFor(p8, stockIsToken0)]);
  await router.write.register([pool.address]);
  markets.push({ symbol, token: token.address, feed: feed.address, pool: pool.address, stockIsToken0 });
  configs.push({ token: token.address, feed: feed.address, pool: pool.address, heartbeat: 86400, maxDeviationBps: 150 });
  await token.write.mint([user.account.address, parseUnits("100", 18)]);
}

const lastbell = await viem.deployContract("Lastbell", [
  {
    wif: wif.address,
    quote: usdg.address,
    router: router.address,
    minFee: parseUnits("50", 18),
    minBond: parseUnits("100000", 18),
    slashAmount: parseUnits("10000", 18),
    claimWindow: 120,
    graceSeconds: 900,
    maxSlippageBps: 300,
  },
  configs,
]);

await wif.write.mint([user.account.address, parseUnits("1000000", 18)]);
await usdg.write.mint([user.account.address, parseUnits("100000", 6)]);
await wif.write.mint([keeper.account.address, parseUnits("1000000", 18)]);
await wif.write.approve([lastbell.address, parseUnits("300000", 18)], { account: keeper.account });
await lastbell.write.bond([parseUnits("300000", 18)], { account: keeper.account });

const state: LocalDeployment = { lastbell: lastbell.address, router: router.address, markets };
await mkdir(new URL(".", STATE_FILE), { recursive: true });
await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
await writeFile(LOCAL_FILE, `# Written by contracts/scripts/local/deploy.ts. Local test chain only.\nVITE_CHAIN=local\nVITE_LASTBELL_ADDRESS=${lastbell.address}\nVITE_DEPLOY_BLOCK=0\n`);
console.log(`Lastbell ${lastbell.address}; user ${user.account.address}; keeper ${keeper.account.address} bonded 300k WIF`);
