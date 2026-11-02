# Funding: the smallest working version

Priced on chain on 2 Nov 2026 (ETH $2,254.69 and NVDA $202.39 from the Chainlink feeds; gas 0.02 gwei; WIF from the deep Uniswap v4 ETH/WIF pool, about 1,550 WIF per 0.001 ETH). Recheck on the swap screen before confirming.

You only ever need **ETH on Robinhood Chain**. Everything else is bought from that ETH on Uniswap.

## The total

| Need | Amount | ETH | USD |
|---|---|---|---|
| Deployer gas (deploy ≈ 0.0001 ETH, then ~20 transactions) | | 0.0006 | $1.35 |
| Keeper gas (bond, claims, fills) | | 0.0003 | $0.68 |
| **$WIF**: 5,000 for the one keeper bond + 100 for five test fees | 5,100 WIF | 0.0033 | $7.44 |
| **One tiny NVDA order**: 0.01 NVDA (≈ $2.02) plus swap fee and slippage | 0.01 NVDA | 0.0011 | $2.48 |
| **Total** | | **0.0053 ETH** | **≈ $12** |

Bond: minimum 5,000 WIF, slash 500 WIF (fixed at deploy; still 10 claims per bond). Bridging fees on the source chain are extra and depend on the route: bridge about 0.006 ETH so the swaps have a little slack.

## What can wait

Send only the first row to start. The deploy costs about $0.20 in gas, and nothing else is needed to deploy and verify the contract.

| Phase | Send / buy | ETH | Do it |
|---|---|---|---|
| **1. Deploy** | deployer gas | 0.0006 ($1.35) | now |
| **2. Keeper** | 5,100 WIF to the keeper, plus keeper gas | 0.0036 ($8.12) | **after** the contract is deployed, verified on Blockscout, and reads correctly |
| **3. One NVDA order** | 0.01 NVDA to the deployer | 0.0011 ($2.48) | after the keeper is bonded and the Worker is running |
| 4. Extras (optional) | second 0.01 NVDA for the cancel and weekend tests (0.0011 ETH); the limit buy's ~$2 USDG comes from the first order's proceeds; a cancelled order's fee returns to your prepaid balance, so no extra WIF | 0.0011 ($2.48) | only if you want those on-chain demos |

So the order is: deploy, verify, **then** spend the other $11.

## Steps

1. **Bridge** about 0.006 ETH to the deployer (`0xF282…93FA`): [Relay](https://relay.link/bridge/robinhood) or [Across](https://across.to/?to=robinhood) (seconds), or the [Arbitrum canonical bridge](https://portal.arbitrum.io/bridge?destinationChain=robinhood-chain&sourceChain=ethereum) (about 10 min).
2. Phase 1 needs no swaps, so deploy now ([DEPLOY.md](DEPLOY.md) step 5).
3. After the contract is verified, on [Uniswap](https://app.uniswap.org/swap?chain=robinhood) with the deployer wallet, swap **0.0033 ETH → WIF**. Paste `0x5173b8ea6923c2d40267890d45c46a3480954773` into the token search and check it reads **WIF / World is Flat**. If the quote is far below about 1,550 WIF per 0.001 ETH, stop: most other WIF pools are near-empty with 50 to 90% fees.
4. Send the keeper (`0x2C94…feE5`) **5,100 WIF** and **0.0003 ETH**.
5. Swap **0.0011 ETH → NVDA** (about 0.01 NVDA). Only do this if Stock Tokens may be offered to you.

When you're done, tell the assistant. It re-runs the read-only preflight before each phase.
