# Funding: phase 2 (keeper) and phase 3

Phase 1 is done: Lastbell is deployed ([TRANSACTIONS.md](TRANSACTIONS.md)). The bond size (minimum 5,000 WIF, slash 500 WIF) is `immutable` in the deployed contract and there is no owner, so it cannot be changed; see "Option B" below for what a smaller bond would take.

Priced on chain on 3 Nov 2026: ETH $2,242.71 (Chainlink), gas 0.0201 gwei, WIF from the deep Uniswap v4 ETH/WIF pool (5,100 WIF costs 0.00328 ETH). Recheck the quote on the swap screen before confirming.

You only ever need **ETH on Robinhood Chain**. Everything else is bought from that ETH on Uniswap.

## Phase 2: bond the keeper (keep the 5,000 WIF bond)

The deployer wallet (`0xF282…93FA`) already holds **0.000517 ETH**; the keeper (`0x2C94…feE5`) holds nothing.

| Step | What | Amount |
|---|---|---|
| 1 | **Bridge** to the deployer | **0.0032 ETH** (≈ $7.18) |
| 2 | **Swap** ETH → WIF on Uniswap with the deployer wallet | **0.0033 ETH** → about 5,130 WIF |
| 3 | **Send the keeper** | **5,000 WIF** (exactly the bond) and **0.0002 ETH** (gas; ≈ $0.45) |
| 4 | Deployer keeps | about 130 WIF (fees for up to 6 test orders at 20 WIF) and about 0.0002 ETH of gas |

Check: 0.000517 + 0.0032 − 0.0033 − 0.0002 ≈ 0.0002 ETH left on the deployer, enough for dozens of its own transactions (one costs about $0.002).

Test order fees are paid by the wallet that places the order (the deployer), not by the keeper. The keeper earns half of each fee back.

Paste `0x5173b8ea6923c2d40267890d45c46a3480954773` into the token search and check it reads **WIF / World is Flat**. If the quote is far below about 1,550 WIF per 0.001 ETH, stop: most other WIF pools are near-empty with 50 to 90% fees.

Bridge routes: [Relay](https://relay.link/bridge/robinhood) or [Across](https://across.to/?to=robinhood) (seconds), or the [Arbitrum canonical bridge](https://portal.arbitrum.io/bridge?destinationChain=robinhood-chain&sourceChain=ethereum) (about 10 min). Source-chain bridge fees are extra and depend on the route.

## Phase 3: one tiny NVDA order (later)

After the keeper is bonded and the Worker is running: swap **0.0011 ETH → NVDA** (about 0.01 NVDA, ≈ $2.02) with the deployer. Bridge 0.0011 ETH more, or use what is left. Only if Stock Tokens may be offered to you.

## Option B: a 1,000 WIF bond (needs a second deployment)

Deploy a second Lastbell with minimum bond **1,000 WIF** and slash **100 WIF** (same 10 claims per bond). Nothing is bonded or ordered yet, so this is the only clean moment to do it.

| Step | What | Amount |
|---|---|---|
| 1 | Bridge to the deployer | **0.0007 ETH** (≈ $1.57) |
| 2 | Redeploy (gas) | ≈ 0.00009 ETH from the deployer |
| 3 | Swap ETH → WIF | **0.00072 ETH** → about 1,120 WIF |
| 4 | Send the keeper | **1,000 WIF** and **0.0002 ETH** |

It saves about **$5.4** (0.0025 ETH less to bring over, minus the $0.21 redeploy). The costs: a second contract address on the explorer (the first would be recorded as superseded), re-verification, and an update of every address in the docs, the Worker and the site.
