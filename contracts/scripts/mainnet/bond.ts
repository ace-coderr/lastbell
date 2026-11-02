// Bonds $WIF for the keeper wallet: an exact approval, then bond().
//   Dry run (default): npx tsx scripts/mainnet/bond.ts
//   Broadcast (uses KEEPER_PRIVATE_KEY from contracts/.env): BROADCAST=1 BOND_WIF=5000 npx tsx scripts/mainnet/bond.ts
import { lastbellAbi, robinhoodChain } from "@lastbell/shared";
import { createWalletClient, erc20Abi, formatUnits, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { BROADCAST, PARAMS, RPC_URL, keyFromEnv, loadDeployment, publicClient } from "./config.js";

const { lastbell } = loadDeployment();
const amount = parseUnits(process.env.BOND_WIF ?? formatUnits(PARAMS.minBond, 18), 18);
const account = privateKeyToAccount(keyFromEnv("KEEPER_PRIVATE_KEY"));
const [balance, current] = await Promise.all([
  publicClient.readContract({ address: PARAMS.wif, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }),
  publicClient.readContract({ address: lastbell, abi: lastbellAbi, functionName: "keepers", args: [account.address] }),
]);
console.log(`Keeper ${account.address}: ${formatUnits(balance, 18)} WIF in wallet, ${formatUnits(current[0], 18)} WIF bonded.`);
if (current[0] + amount < PARAMS.minBond) throw new Error(`Bond would be below the ${formatUnits(PARAMS.minBond, 18)} WIF minimum`);
if (balance < amount) throw new Error(`Wallet holds less than ${formatUnits(amount, 18)} WIF`);
if (!BROADCAST) {
  console.log(`Dry run: would approve and bond ${formatUnits(amount, 18)} WIF. Nothing was sent.`);
  process.exit(0);
}

const wallet = createWalletClient({ account, chain: robinhoodChain, transport: http(RPC_URL) });
const approve = await wallet.writeContract({ address: PARAMS.wif, abi: erc20Abi, functionName: "approve", args: [lastbell, amount] });
await publicClient.waitForTransactionReceipt({ hash: approve });
console.log(`approve ${approve}`);
const { request } = await publicClient.simulateContract({ account, address: lastbell, abi: lastbellAbi, functionName: "bond", args: [amount] });
const bond = await wallet.writeContract(request);
const r = await publicClient.waitForTransactionReceipt({ hash: bond });
if (r.status !== "success") throw new Error(`bond reverted: ${bond}`);
console.log(`bond ${bond}`);
