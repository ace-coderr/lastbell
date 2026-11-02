# Funding the deployer and keeper wallets

Everything starts with ETH on Robinhood Chain. Swaps happen on Uniswap, which supports Robinhood Chain. Routes and prices below were checked on chain on 2 Nov 2026; recheck the numbers on the swap screen before confirming.

## What each wallet needs

| Wallet | ETH (gas) | $WIF | Other |
|---|---|---|---|
| Deployer / test user | ~0.002 | ~200 | ≈ $5 of NVDA (or SPY/AAPL) for a stop-loss; ~10 USDG for a limit buy |
| Keeper | ~0.004 | 20,700 (20,000 bond + spare) | none |

**Total to bring over: about 0.03 ETH (≈ $65).** Most of it is the keeper's $WIF bond (≈ 0.0134 ETH).

## 1. Bridge ETH to Robinhood Chain

Bridge about **0.03 ETH** to the **deployer** address. The official docs list these routes:

- **Relay** (seconds): https://relay.link/bridge/robinhood
- **Across** (seconds): https://across.to/?to=robinhood
- **Arbitrum canonical bridge** (about 10 minutes, trustless): https://portal.arbitrum.io/bridge?destinationChain=robinhood-chain&sourceChain=ethereum

## 2. Swap on Uniswap (deployer wallet)

Open https://app.uniswap.org/swap?chain=robinhood, connect the deployer wallet, and check the network says Robinhood Chain.

| Buy | Pay with | Amount | Route the app should find |
|---|---|---|---|
| **WIF** | ETH | ≈ 0.014 ETH → ~21,000 WIF | Uniswap v4 ETH/WIF pool with the launchpad hook (`PonsV2MemeHook`, 0% LP fee). Measured on chain: 0.01 ETH ≈ 15,500 WIF with almost no slippage |
| **USDG** | ETH | ≈ 0.007 ETH → ~15 USDG | ETH/USDG |
| **NVDA** | USDG | ≈ 5 USDG → ~0.024 NVDA | Uniswap v3 NVDA/USDG 0.05% pool (`0xd4EB…14a3`), the deepest pool on the chain |

To find WIF, paste its address in the token search: `0x5173b8ea6923c2d40267890d45c46a3480954773`. The app may ask you to import it. Check the symbol is **WIF** and the name is **World is Flat**.

Other copies of $WIF pools exist with 50–90% fees. If the quote looks far off (much less than ~1,550 WIF per 0.001 ETH), stop.

**Stock Tokens are restricted in some regions.** Only buy NVDA, SPY or AAPL if Stock Tokens may be offered to you (see [Region notice](../README.md)).

## 3. Send the keeper its share

From the deployer, send to the **keeper** address:

- **20,700 WIF**
- **0.004 ETH** (gas for claims and fills)

## 4. Check

Tell the assistant. It re-runs the read-only preflight and confirms every balance before anything is deployed.
