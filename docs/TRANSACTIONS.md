# Mainnet transactions

Robinhood Chain (4663). Explorer: [robinhoodchain.blockscout.com](https://robinhoodchain.blockscout.com). Every live action is recorded here with its transaction.

## Deployment

> **v1 (superseded).** The contract below was deployed, verified and checked on chain before the contract audit ([AUDIT.md](AUDIT.md)) found two issues that need a contract change. It was never bonded or used and is kept only as a record (`contracts/deployments/robinhood-mainnet-v1-superseded.json`). **v2** below is the one the app, the keeper and the demo use.

### v1 (superseded)

| What | Transaction | Notes |
|---|---|---|
| Deploy Lastbell | [`0x48337546…3ef4a9`](https://robinhoodchain.blockscout.com/tx/0x4833754690a20f62c3146cb996342f2b6ce1caf31c1beeca1d891a44533ef4a9) | Block 104829652, 2026-11-03 05:56 UTC. Contract [`0xa06128A016C00Df8C50840454c81cCD3e32CF76b`](https://robinhoodchain.blockscout.com/address/0xa06128A016C00Df8C50840454c81cCD3e32CF76b). Deployer `0xF282…93FA`. Gas used 4,554,519 (about 0.00009 ETH) |
| Source verified | [Blockscout: verified, full match](https://robinhoodchain.blockscout.com/address/0xa06128A016C00Df8C50840454c81cCD3e32CF76b?tab=contract) | solc 0.8.30, optimizer 500 runs, cancun. Also verified on Sourcify as an exact match for creation and runtime code |

### v2 (audited fixes, 1,000 WIF minimum bond)

| What | Transaction | Notes |
|---|---|---|
| Deploy Lastbell v2 | [`0xbe79d958…9dd958`](https://robinhoodchain.blockscout.com/tx/0xbe79d9580ba05c6a94d2af5d5646f4d09044048e87d7cfd0650d73746a9dd958) | Block 106594457, 2026-11-05 08:22 UTC. Contract [`0x03f4Bf9214474f38D6DD6d60591419a923B4890e`](https://robinhoodchain.blockscout.com/address/0x03f4Bf9214474f38D6DD6d60591419a923B4890e). Deployer `0xF282…93FA`. Gas used 4,691,976 (about 0.000094 ETH). Minimum fee 20 WIF, minimum bond 1,000 WIF, slash 100 WIF, claim window 120 s, grace 900 s, max slippage 3%. Checked on chain: parameters, all three feeds and pools, `release(uint256)` present, no owner or admin functions; runtime code equals the audited build (41 immutable slots masked) |
| Source verified | [Blockscout: verified, full match, 42 functions](https://robinhoodchain.blockscout.com/address/0x03f4Bf9214474f38D6DD6d60591419a923B4890e?tab=contract) | solc 0.8.30, optimizer 500 runs, cancun. Sourcify: exact match for creation and runtime code (2026-11-05 08:24 UTC) |

## Keeper

| What | Transaction | Notes |
|---|---|---|
| Approve WIF | [`0x6d71358a…f7a5b7`](https://robinhoodchain.blockscout.com/tx/0x6d71358a5e68d0874e8f72f9a522c1df90f1b49e6c0fa7846b53068596f7a5b7) | Block 106603096. Keeper `0x2C94…feE5` approved Lastbell v2 for exactly 1,000 WIF (not unlimited) |
| Bond 1,000 WIF | [`0x9679c589…e0b6ab`](https://robinhoodchain.blockscout.com/tx/0x9679c589396d80931c8333df5aef64c75424068d5d006bda1c4fdf2a31e0b6ab) | Block 106603126, 2026-11-05 08:37 UTC. Gas used 100,825. Checked on chain: bond 1,000 WIF, active keeper, claim capacity 10, no fills or slashes yet |

## Orders

| # | What | Transactions | State |
|---|---|---|---|
| 0 | **Stop-loss, NVDA**: sell 0.0001 NVDA (≈ $0.02) if it falls to $205 (live price $199.29, so triggered at once), 1% slippage, 20 WIF fee. Placed from the deployer wallet through the live site | Approve NVDA (exactly 0.0001) [`0xae72ea2f…c04a2b`](https://robinhoodchain.blockscout.com/tx/0xae72ea2f534c716dc86494fa81e8d1f590806cf3acecc05b32f5512137c04a2b) · Approve WIF (exactly 20) [`0x0d2cbbbf…8cf61d`](https://robinhoodchain.blockscout.com/tx/0x0d2cbbbf9ac0e922f800680dd856ac55e576566536c6df8407231e050a8cf61d) · Place [`0xa22fa593…1f65e2`](https://robinhoodchain.blockscout.com/tx/0xa22fa59366dda3bbe07381b92a15f91819841a97394a0c1ae300e45b401f65e2) · Claim [`0x2952bf02…0f78bb`](https://robinhoodchain.blockscout.com/tx/0x2952bf0257c6277ac6743f1494111dca7470ade939ae78629d0ade467f0f78bb) · Fill [`0x8c0e99ca…4e1a90`](https://robinhoodchain.blockscout.com/tx/0x8c0e99caed66ccc09104064f5702e021c05740dd2eb9b9fcdb67c878154e1a90) | **Filled.** Placed 09:52:28 UTC, **claimed by the keeper at 09:52:47** (19 s later, on the next cron run), **filled at 09:52:48** (block 106647043). Received 0.019942 USDG against a contract minimum of 0.019730. Fee split in the fill: **10 WIF burned** (`Transfer Lastbell → 0x0`) and **10 WIF to the keeper**. Fill gas 392,244. Keeper bond intact (1,000 WIF), 0 slashes |
| 1 | **Stop-loss, NVDA, placed on a Sunday: sell 0.0001 NVDA (≈ $0.02) if it falls to $182.59** (the last NVDA price on chain is $188.24, from Friday 6 Nov 22:30 UTC, so it is not triggered), 1% slippage, 20 WIF fee, expires 15 Nov 08:53 UTC. Placed from the deployer wallet through the live site | Approve NVDA (exactly 0.0001) [`0xaee45f40…6e517c`](https://robinhoodchain.blockscout.com/tx/0xaee45f407aa6eb346ee08f3eb00771a62fd0905f86fcd11e87d4ce1d366e517c) · Approve WIF (exactly 20) [`0xcd88904c…9cb7ee`](https://robinhoodchain.blockscout.com/tx/0xcd88904c4ac78fb5a8288b619e0025398374bd639289823992bcac08619cb7ee) · Place [`0x1ea41b89…391ad0`](https://robinhoodchain.blockscout.com/tx/0x1ea41b895ec6494f285fab3a436c74e3a5404e749ad1bf49a11e0eaa39391ad0) | **Open and queued, not touched.** Approvals at 08:54:27 and 08:54:41 UTC (blocks 109107319 and 109107454, gas 63,613 and 45,961), place at 08:54:53 UTC (block 109107570, gas 297,037), all three succeeded. Checked on chain (read-only, 8 Nov 08:56 UTC): order 1 is open and unclaimed with the amount, trigger and fee above; NVDA `gate()` reads `market-closed`; the contract holds 0.0001 NVDA in escrow and 1,020 WIF (the 1,000 WIF keeper bond plus this order's 20 WIF fee); the keeper's `/status` shows 1 open order, `queued:market-closed`, bond intact. It stays queued until Monday's open and fills only if NVDA is at or below $182.59 on a fresh price |
