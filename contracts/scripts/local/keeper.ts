// Local test chain only: one run of the real keeper engine (keeper/src/engine.ts) as Hardhat account #1.
//   npx hardhat run --network localhost scripts/local/keeper.ts
import { network } from "hardhat";
import { runOnce } from "../../../keeper/src/engine.js";
import { loadDeployment } from "./helpers.js";

const { viem } = await network.getOrCreate();
const d = await loadDeployment();
const [, keeper] = await viem.getWalletClients();
const report = await runOnce((await viem.getPublicClient()) as never, keeper as never, { lastbell: d.lastbell, quoter: d.router });
console.log(JSON.stringify(report, null, 2));
