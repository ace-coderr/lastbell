# Funding the redeploy and the keeper

The contract audit ([AUDIT.md](AUDIT.md)) found two issues that need a contract change, so Lastbell is redeployed **once**, at a **1,000 WIF** minimum bond (slash 100 WIF, still 10 claims per bond). The first deployment is kept as a superseded record ([TRANSACTIONS.md](TRANSACTIONS.md)); nothing was ever bonded or ordered on it.

Priced on chain on 3 Nov 2026: ETH $2,242.71 (Chainlink), gas 0.0201 gwei, WIF from the deep Uniswap v4 ETH/WIF pool (1,100 WIF costs 0.000707 ETH). Recheck the quote on the swap screen before confirming.

You only ever need **ETH on Robinhood Chain**. Everything else is bought from that ETH on Uniswap.

## Where the wallets stand

| Wallet | Address | Holds |
|---|---|---|
| Deployer / test user | `0xF282…93FA` | 0.000517 ETH |
| Keeper | `0x2C94…feE5` | nothing |

## Steps

| Step | What | Amount |
|---|---|---|
| 1 | **Redeploy** (the owner runs it; see [DEPLOY.md](DEPLOY.md)) | about 0.000095 ETH of gas, from what the deployer already holds |
| 2 | **Bridge** to the deployer | **0.0007 ETH** (≈ $1.57) |
| 3 | **Swap** ETH → WIF on Uniswap with the deployer wallet | **0.00072 ETH** → about 1,120 WIF |
| 4 | **Send the keeper** | **1,000 WIF** (exactly the bond) and **0.0002 ETH** (gas, ≈ $0.45) |
| 5 | Deployer keeps | about 120 WIF (fees for up to 6 test orders at 20 WIF) and about 0.0002 ETH of gas |

Check: 0.000517 + 0.0007 − 0.000095 (deploy) − 0.00072 (swap) − 0.0002 (keeper) ≈ 0.0002 ETH left on the deployer, enough for dozens of its own transactions (one costs about $0.002).

Do step 1 first. It needs only the ETH the deployer already holds, and nothing has to be bridged or bought until the new contract is deployed and verified.

Test order fees are paid by the wallet that places the order (the deployer), not by the keeper. The keeper earns half of each fee back.

Paste `0x5173b8ea6923c2d40267890d45c46a3480954773` into the token search and check it reads **WIF / World is Flat**. If the quote is far below about 1,550 WIF per 0.001 ETH, stop: most other WIF pools are near-empty with 50 to 90% fees.

Bridge routes: [Relay](https://relay.link/bridge/robinhood) or [Across](https://across.to/?to=robinhood) (seconds), or the [Arbitrum canonical bridge](https://portal.arbitrum.io/bridge?destinationChain=robinhood-chain&sourceChain=ethereum) (about 10 min). Source-chain fees are extra and, on an amount this small, can exceed the amount itself: pick the cheapest route.

## Phase 3: the smallest demo order

Measured on chain on 5 Nov 2026 (NVDA oracle $198.29, pool $199.02, ETH $2,418.84). The contract rejects an order only if its minimum output at its own trigger price rounds to zero, and the real pool fills far below a cent, so the floor is not what limits you; readable numbers and gas are.

| NVDA | Value | Contract min-out at 1% slippage | Real pool pays | Fills? |
|---|---|---|---|---|
| 0.000001 | $0.0002 | 0.000196 USDG | 0.000198 | yes, but the site shows "$0.00" |
| 0.0001 | $0.02 | 0.019629 | 0.019891 | yes |
| **0.001** | **$0.20** | **0.196303** | **0.198916** | **yes (recommended)** |
| 0.002 | $0.40 | 0.392606 | 0.397833 | yes |
| 0.01 | $1.98 | 1.963033 | 1.989168 | yes |
| 0.00000001 | $0.000002 | 0 | 0.000001 | no: min-out rounds to 0 at the oracle price, so the keeper never claims it |

**Smallest working demo: 0.001 NVDA (about $0.20).** Buy about **0.0012 NVDA with 0.0001 ETH** on Uniswap (the 0.0002 NVDA spare covers swap fees), place a stop-loss for 0.001 NVDA with a trigger a little above the live price and the default 20 WIF fee. The site reads the 20 WIF minimum fee from the contract. About 0.0003 ETH is left for gas, which covers the swap, the approvals, the order and a cancel several times over.
