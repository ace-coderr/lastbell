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
| Deploy Lastbell v2 | _pending_ | |
| Source verified | _pending_ | |

## Keeper

| What | Transaction | Notes |
|---|---|---|
| Approve WIF | _pending_ | |
| Bond 1,000 WIF (keeper holds exactly 1,000) | _pending_ | |

## Orders

| # | What | Transactions | State |
|---|---|---|---|
| _pending_ | | | |
