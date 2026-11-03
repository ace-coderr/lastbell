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

## Phase 3: one tiny NVDA order (later)

After the keeper is bonded and the Worker is running: swap **0.0011 ETH → NVDA** (about 0.01 NVDA, ≈ $2.02) with the deployer. Only if Stock Tokens may be offered to you.
