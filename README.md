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

| What | Link |
|---|---|
| App | https://lastbell-cyk.pages.dev |
| Keeper status (public JSON) | https://lastbell-keeper.plumbline-app.workers.dev/status |
| Contract (Robinhood Chain, verified) | [`0x03f4…890e`](https://robinhoodchain.blockscout.com/address/0x03f4Bf9214474f38D6DD6d60591419a923B4890e?tab=contract) |
| Every transaction | [docs/TRANSACTIONS.md](docs/TRANSACTIONS.md) |
| Contract audit | [docs/AUDIT.md](docs/AUDIT.md) |

## Screenshots

| Trade | Orders | Flywheel |
| --- | --- | --- |
| ![Trade screen](docs/screenshots/desktop-trade.png) | ![Orders screen](docs/screenshots/desktop-orders.png) | ![Flywheel screen](docs/screenshots/desktop-flywheel.png) |

The same screens work on a phone:

<img src="docs/screenshots/phone-trade.png" alt="Trade screen on a phone" width="260">

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

Without a contract address the web app runs on demo data. Add `?demo&at=2026-11-07T15:00:00Z` to the URL to see a chosen moment, for example the weekend "queued until open" state.

Web build settings: `VITE_LASTBELL_ADDRESS` (contract), `VITE_KEEPER_URL` (keeper Worker, for `/status`) and `VITE_DEPLOY_BLOCK` (first block to search for fills).

### Local test chain (real transactions, no real funds)

Run each command in its own terminal from `contracts/`:

```bash
npx hardhat node --network hardhatLocal
```

The `hardhatLocal` network starts at the real current time. Tests use the default network, which starts at a fixed date (1 Nov 2026) so they never depend on the real clock.

```bash
npx hardhat run --network localhost scripts/local/deploy.ts
```

The deploy writes `web/.env.local` (gitignored). The app then runs against the local node and shows a "Connect wallet" button for Hardhat's test account. To move a price and run the real keeper engine once:

```bash
SYMBOL=SPY PRICE=735 npx hardhat run --network localhost scripts/local/price.ts
```

```bash
npx hardhat run --network localhost scripts/local/keeper.ts
```

Delete `web/.env.local` afterwards to go back to demo mode.

Read-only research scripts (they hit the public RPC):

```bash
npm run spike:feeds -w keeper
```

## Security

_SECURITY.md lands in task 9._

## License

MIT
