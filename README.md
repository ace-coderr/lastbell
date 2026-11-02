# Lastbell

**Stop and limit orders for Stock Tokens that only fire when the price is real.**

Stock Tokens on Robinhood Chain trade around the clock. Their Chainlink feeds don't: they update 24/5 and freeze during corporate actions. A stop-loss that trusts a frozen price is exploitable. Lastbell orders execute only while the feed is fresh and the pool agrees with it. The rest of the time they show **queued until market open**.

> Work in progress for the World is Flat Hackathon. See [docs/PROGRESS.md](docs/PROGRESS.md).

## The problem

_To be written (task 10). Evidence so far: [docs/FEASIBILITY.md](docs/FEASIBILITY.md). Every equity feed was about 2 days old on a Sunday night while the tokens kept trading._

## How it works

_To be written._ Summary of the decided design (MODE A):

- Non-custodial escrow per order (stop or limit, with expiry). Users can cancel any time.
- Keepers trigger execution. The swap goes through a fixed Uniswap v3 USDG pool, with `minOut` derived on-chain from a fresh Chainlink price.
- Freshness gate: inside the 24/5 session, updated since the session opened, within heartbeat, oracle and token not paused, pool within a band of the feed.

## Why $WIF is load-bearing

_To be written._ Keepers lock a $WIF bond. Users prepay fees in $WIF. Each fee is split 50% burned and 50% to the keeper.

## Architecture

| Package | What | Runs on |
|---|---|---|
| [`contracts/`](contracts) | Solidity (Hardhat 3, viem) | Robinhood Chain |
| [`keeper/`](keeper) | Order executor + `/status` | Cloudflare Worker, 1-minute cron |
| [`web/`](web) | React app | Cloudflare Pages |
| [`shared/`](shared) | Chain config, verified addresses, market hours, freshness gate | used by keeper and web |

## Live links

_After deployment (task 8)._

## Develop

Requires Node 22+.

```bash
npm install
```

```bash
npm test
```

```bash
npm run dev -w web
```

Read-only research scripts (they hit the public RPC):

```bash
npm run spike:feeds -w keeper
```

## Security

_SECURITY.md lands in task 9._

## License

MIT
