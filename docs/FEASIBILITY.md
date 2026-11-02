# Lastbell feasibility spike

Read-only investigation of Robinhood Chain mainnet. Snapshot taken at block `103775309` (Sunday 1 Nov 2026, 23:45 UTC, markets closed). Every number below came from an RPC call, the Chainlink reference data directory, Blockscout or the official docs at that time. Raw data is in [`data/feasibility-snapshot.json`](data/feasibility-snapshot.json).

## 1. Chain facts (verified)

| Fact | Value | How verified |
|---|---|---|
| Chain ID | `4663` (`0x1237`) | `eth_chainId` on `https://rpc.mainnet.chain.robinhood.com` |
| Explorer | `robinhoodchain.blockscout.com` | live; its API sits behind a Cloudflare check, so it works in a browser but not from `curl` |
| Stack | Arbitrum Orbit L2, ETH for gas | Uniswap + Robinhood docs |
| Public RPC limits | 10M blocks per `eth_getLogs`, one topic value per position for wide ranges, max 10k logs per call, no archive state, rate-limited (HTTP 429) | observed |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` | worked for batched reads |
| USDG (stablecoin) | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, 6 decimals | docs Token Contracts page + `decimals()` |
| WETH | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` | docs |

### $WIF

| | |
|---|---|
| Address | `0x5173b8ea6923c2d40267890d45c46a3480954773` |
| `name()` / `symbol()` / `decimals()` | "World is Flat" / "WIF" / 18 |
| Total supply | ~999,997,843 WIF (about 2,157 already burned out of 1B) |
| `burn(uint256)` | **present** (selector `0x42966c68` in bytecode, and in the verified ABI) |
| `burnFrom(address,uint256)` | present |
| `mint`, `owner` | **absent**: fixed supply, nobody controls the token |
| Proxy | no (EIP-1967 slot empty), so it can't be upgraded |
| Verified source | `PonsV2LauncherToken` (launchpad token with a bonding `curve()`), solc 0.8.35 |
| Market | about $0.00135 per WIF on Blockscout, 1,540 holders. **Liquidity is thin.** |

So $WIF can be burned directly by a contract holding it: Lastbell calls `burn(amount)` on fees it holds. Nobody needs special permission.

## 2. Stock Tokens and their Chainlink feeds

The docs' Token Contracts page reads ~200 canonical Stock Tokens live from the on-chain asset registry. Chainlink's Robinhood directory (`reference-data-directory.vercel.app/feeds-robinhood-mainnet.json`, linked from docs.chain.link) lists **58 feeds, 36 of them for Stock Tokens/ETFs**. Only those 36 can be used.

Facts common to all 36 feeds:

- `decimals() = 8`, heartbeat **86400 s (24 h)**, deviation threshold **0.5%**, standard `AggregatorV3Interface` via proxy.
- Feed price = underlying price × token `uiMultiplier()` (dividends/splits are already included).
- Market hours `us_equities_24/5`: Sun 20:00 ET to Fri 20:00 ET. **No updates on weekends or US market holidays.**
- `oraclePaused()` lives on the **token** contract, not on the feed. The issuer sets it around corporate actions. The docs say it's advisory, so the staleness check stays the primary guard.
- No L2 sequencer uptime feed is listed for Robinhood Chain (checked the directory and the Chainlink sequencer-feeds page).

Snapshot (all 36 `oraclePaused=false`, `tokenPaused=false`, token decimals 18):

| Token | Token address | Feed proxy | Price | Age at snapshot |
|---|---|---|---|---|
| SPY | `0x117cc2133c37B721F49dE2A7a74833232B3B4C0C` | `0x319724394D3A0e3669269846abE664Cd621f9f6A` | 758.38 | 47.8 h |
| NVDA | `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC` | `0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15` | 205.28 | 51.7 h |
| AAPL | `0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9` | `0x6B22A786bAa607d76728168703a39Ea9C99f2cD0` | 344.91 | 51.9 h |
| TSLA | `0x322F0929c4625eD5bAd873c95208D54E1c003b2d` | `0x4A1166a659A55625345e9515b32adECea5547C38` | 399.39 | 52.6 h |
| META | `0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35` | `0x7C38C00C30BEe9378381E7B6135d7283356D71b1` | 613.38 | 50.7 h |
| QQQ | `0xD5f3879160bc7c32ebb4dC785F8a4F505888de68` | `0x80901d846d5D7B030F26B480776EE3b29374C2ae` | 691.46 | 51.9 h |
| … 30 more | see snapshot JSON | | | 47 to 72 h (GLD: 4 h) |

**Every equity feed was 2 days old while its token kept trading on-chain.** This is the problem Lastbell solves, and it's measurable today.

### How often the feeds update (600 rounds sampled per feed, Aug to Oct 2026)

| Feed | Median gap | p90 gap | Max weekday gap | Weekend gap |
|---|---|---|---|---|
| NVDA | 47 min | 5.6 h | 11.6 h | ~52 h |
| TSLA | 22 min | 4.1 h | 11.7 h | ~52 to 56 h |
| AAPL | 48 min | 12.2 h | 12.0 h | ~52 to 57 h (76 h over Labor Day) |
| SPY | 13.7 h | 24.0 h | **24.0 h** (heartbeat) | ~53 to 60 h (81 h over Labor Day) |

What this means for the design:

1. **"updatedAt within heartbeat" alone doesn't stop weekend execution.** The last update is Fri ~20:00 ET, so for the first ~24 h of every weekend the price still looks fresh by the heartbeat rule.
2. **A tight age limit would also block normal weekdays.** During the session the feed only updates on 0.5% moves, so a 12 to 24 h old price on a Tuesday is normal and valid (it's within 0.5% of what the oracle network sees).
3. Chainlink pushes a round right at session open (Monday 00:00 UTC in the EDT samples). After a holiday Monday, the first update is Tuesday 00:00 UTC. So **"has the feed updated since the latest session open?"** catches holidays without any admin calendar.

**Freshness rule for the contracts (all checked on-chain, no admin):**

- `answer > 0`, `updatedAt > 0`
- `block.timestamp` is inside the 24/5 session window. US DST is computed on-chain from the fixed rule (2nd Sunday of March to 1st Sunday of November), so we never have to guess which UTC hour is 20:00 ET.
- `updatedAt >= start of the current session` (this catches holidays and feeds that didn't restart)
- `block.timestamp - updatedAt <= heartbeat + grace`
- `token.oraclePaused() == false` and `token.paused() == false`
- In MODE A, also: pool spot price within `maxDeviationBps` of the feed, and on-chain `amountOutMinimum` derived from the feed

If any check fails, the order shows **"queued until market open"**.

## 3. Uniswap liquidity against a stablecoin

Uniswap on Robinhood Chain (from Uniswap's official deployments list): v3 factory `0x1f7d7550B1b028f7571E69A784071F0205FD2EfA`, SwapRouter02 `0xCaf681a66D020601342297493863E78C959E5cb2`, QuoterV2 `0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7`, v4 PoolManager `0x8366a39CC670B4001A1121B8F6A443A643e40951`, V4Quoter `0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94`, StateView `0xF3334192D15450CdD385c8B70e03f9A6bD9E673b`.

Method: for 9 candidate tokens I scanned every v3 `PoolCreated` and v4 `Initialize` event. That gave 1,316 v3 pools and 46,897 v4 pools, mostly launchpad spam. USDG is the dominant stable quote asset (1,272 v4 + 31 v3 pools; 195 + 21 have live liquidity). I quoted every live USDG pool with the official quoters at $100 / $1k / $10k in both directions and compared against the Chainlink price. Blockscout's top-holder lists agree: the v4 PoolManager is the #1 holder of every token checked (e.g. 28k NVDA, 11k SPY), and the big v3 pools come right after.

Best pool per token (% difference from Chainlink; negative = worse than oracle):

| Token | Venue | Fee | Pool | Sell $1k | Buy $1k | Sell $10k | Buy $10k |
|---|---|---|---|---|---|---|---|
| **SPY** | v3 | 0.05% | `0xa7Bb1AC63BBaB0C44316E6c8C455213441689167` | +0.20 | -0.32 | +0.09 | -0.43 |
| SPY | v4 (no hook) | 0.05% | id `0xe5923c8a…b907` | +0.13 | -0.25 | +0.12 | -0.26 |
| **NVDA** | v3 | 0.05% | `0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3` | +0.15 | -0.27 | +0.08 | -0.34 |
| **AAPL** | v3 | 0.05% | `0xAae0d815EE56e4092a5E5C2911E676Fea50B2d6D` | -0.09 | -0.05 | -0.27 | -0.23 |
| TSLA | v3 | 0.30% | `0xf4ACdAEEB7022862A763C9B1B885e11191c889E3` | -0.33 | -0.31 | -0.50 | -0.49 |
| META | v4 (no hook) | 0.30% | id `0x5875d407…ae36` | -0.29 | -0.45 | -0.49 | -0.62 |
| AMZN | v3 | 0.30% | `0x8AC92DA74AB5F3b1d024Dc1943Ad7e15Dc4179Ef` | -0.05 | -0.57 | -0.17 | -0.69 |
| QQQ | v3 | 0.05% | `0xD60A5d14dB690B7Afad71F76B108071D7175597d` | +0.70 | -0.83 | +0.54 | -0.99 |
| GOOGL | v3 | 0.05% | `0x34D0dC122CF9A8Eb296fC5e0D3A233625D7d19b7` | +0.58 | -0.75 | +0.19 | -1.08 |
| MSTR | v4 (no hook) | 0.25% | id `0x319bac87…` | +1.81 | -2.37 | +1.68 | -2.49 |

These quotes were taken on a weekend against a 2-day-old feed, so they include weekend drift as well as slippage. The positive sell numbers (pool pays more than the oracle says) show the stale-price gap directly: a stop or limit order checking only the frozen feed would be mispriced by exactly that amount. Even so, SPY, NVDA and AAPL stay within ~0.45% of the oracle at $10k. The NVDA v3 pool alone has 7.1M token transfers.

## 4. Stock token behaviour that affects the design

Verified `Stock` implementation (beacon proxy, impl `0xb35490d6f9163DE4F80d88dc75c3516eb64C5aE2`):

- `pause()` / `paused()` / `tokenPaused()`: the issuer can freeze all transfers. Swaps, fills **and user withdrawals** revert while it's paused.
- `Blocked` error via `ACCESS_CONTROLLED_REGISTRY`: there is an issuer blocklist. If the escrow contract or a user gets blocklisted, transfers revert.
- `adminBurn(address,uint256)`: the issuer can burn tokens from any address, including our escrow.
- Beacon proxy: the issuer can upgrade token logic.
- `permit` (EIP-2612) is supported, so approve and place can happen in one transaction.

Lastbell can't defend against any of these. They go into SECURITY.md as honest limits. The escrow keeps a separate ledger per order, so one blocked or burned order can't drain the others.

## 5. Decision: **MODE A**

**Execute against fixed Uniswap v3 USDG pools, gated by the Chainlink freshness rule, the pool-vs-feed band and an on-chain min-out.**

Why not MODE B (keepers fill from their own inventory):

- Deep, oracle-tracking AMM liquidity already exists, and MODE A uses it directly.
- MODE B would need every keeper to hold Stock Token inventory. Stock Tokens can't be offered to many regions and keepers would carry price risk. That adds a counterparty and a compliance problem, and it shrinks the keeper set we want $WIF bonds to grow.
- MODE A gives a trustless outcome: the swap either meets `minOut` (computed from a fresh Chainlink price minus the user's capped slippage) or reverts. A keeper can't choose a bad price, only the moment, and only while the feed is fresh.

Scope for the build:

| Market | Pool (v3, USDG) | Fee | Why |
|---|---|---|---|
| **SPY** | `0xa7Bb1AC63BBaB0C44316E6c8C455213441689167` | 0.05% | deepest index ETF, everyone knows it |
| **NVDA** | `0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3` | 0.05% | most active pool on chain, single stock |
| **AAPL** | `0xAae0d815EE56e4092a5E5C2911E676Fea50B2d6D` | 0.05% | tightest quotes both ways |
| TSLA (backup) | `0xf4ACdAEEB7022862A763C9B1B885e11191c889E3` | 0.30% | if one of the above degrades |

Implementation notes for task 3:

- I chose v3 over v4: single-hop `exactInputSingle` through SwapRouter02, and `slot0()` gives the band check. v4 would need the unlock/callback flow and per-pool hook review for a ~0.1% gain. Each market's pool and fee are fixed at deploy, so a keeper can't redirect the route.
- Fresh-price → `minOut`: `stockAmount × price × (1 − slippageBps)` with decimals 18 → 8 → 6 handled explicitly. Slippage is capped by the contract.
- Two order types: **stop** (sell Stock → USDG when price ≤ trigger) and **limit** (buy Stock with USDG when price ≤ limit).
- Gaps we accept and will document: no sequencer uptime feed exists for this chain; the 0.5% deviation threshold means a trigger can fire up to ~0.5% late; issuer powers listed in §4; thin $WIF liquidity.

## 6. Reproducing

The spike scripts (viem, read-only) will be ported to TypeScript under `keeper/scripts/` in task 2. They reuse the same reads the keeper needs: feeds, `oraclePaused`, pool quotes.
