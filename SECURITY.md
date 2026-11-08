# Security

Lastbell is a hackathon project. It was reviewed only by its authors, it has had **no third-party audit**, and it is not formally verified. It holds real funds on mainnet, so use small amounts. The deployed contract is [`0x03f4…890e`](https://robinhoodchain.blockscout.com/address/0x03f4Bf9214474f38D6DD6d60591419a923B4890e?tab=contract) (source verified).

## What we are protecting

| Asset | Who holds it |
| --- | --- |
| Your escrowed tokens (the stock for a stop-loss, USDG for a limit buy) | The contract, accounted per order |
| Your prepaid $WIF fee | The contract, accounted per order |
| A keeper's $WIF bond | The contract, accounted per keeper |

There is **no owner, admin, pause, upgrade or setter** in the contract. Every parameter and every market is fixed at deploy. Nobody, including us, can move your funds or change the rules.

## Threat model

| Who | What they might try | What stops it |
| --- | --- | --- |
| **A keeper** (honest, buggy or hostile) | Fill on a frozen price, fill below your minimum, send your output elsewhere, steal your escrow | The contract checks the price gate itself at claim **and** at fill, derives the minimum output from the oracle on chain, routes the swap through one fixed pool and checks your balance change itself. A keeper can only fail to act. |
| **A stale or frozen price** (weekend, holiday, corporate action, dead feed) | Trigger a stop-loss on a price that is not real | The gate: inside the 24/5 session, updated since the session opened, within its heartbeat, issuer flags clear, and the pool within 1.5% of the feed. Otherwise the order waits. |
| **A manipulated pool** | Move the pool to trigger or to fill badly | The pool must agree with the oracle (the band), and the minimum output comes from the oracle, so a fill below it reverts. |
| **An attacker creating spam orders** | Burn a keeper's bond with orders that cannot be filled, or bury the keeper in orders | Orders with a zero minimum output are rejected at placement, and a keeper releases an unfillable claim for free (audit F1). The keeper reads a bounded window of orders per run (KW1). |
| **A re-entrant token** | Call back into the contract during a transfer | Every state-changing function is `nonReentrant` and updates state before it transfers. Tested with a hostile token. |
| **A malicious website or link** | Frame the app and trick a click | `frame-ancestors 'none'` and `X-Frame-Options: DENY` (after the next deploy), exact token approvals, and a simulation before every wallet prompt. |
| **A public page leaking secrets** | Read the RPC key or the keeper key from `/status` | Every response and every stored log line is scrubbed (KW2). The keeper key is a Worker secret and never in git. |

## What is protected, and what is not

**Protected, by the contract and not by trust:**
- Your tokens leave escrow only to you (cancel, refund) or to you as swap output.
- You can cancel at any time, even when the market is closed, a keeper has your order claimed, or the feed is broken. `gate()` never reverts, so cancel always works (audit F2).
- An order never fires on a stale, paused or out-of-band price, or for less than its minimum output.
- Burned plus paid equals the fee, and your fee comes back on cancel.

**Not protected:**
- **Price risk.** A stop-loss is not a guarantee. If the pool moves more than the 1.5% band before the oracle updates, the order **waits** rather than firing on a price the oracle has not confirmed, so a fast crash can pass through your trigger. You can still cancel.
- **A keeper chooses when to fill** and could trade around its own fill inside your slippage (1% by default, 3% at most). Your worst case is bounded by the minimum output, not eliminated.
- **The token issuer.** It can pause transfers, block an address, burn tokens from any address (including the escrow) and upgrade the token. The contract cannot defend against that.
- **Oracle risk.** Prices come from Chainlink. Some feeds only update on 0.5% moves, and there is no sequencer-uptime feed on this chain.
- **A fill needs the pool.** If the pool cannot fill your size, the order stays triggered until it expires. You can cancel.
- **The holiday table ends in early 2028.** After that only weekends, the open-of-session check and the heartbeat apply.

## Audit summary

Full notes: [docs/AUDIT.md](docs/AUDIT.md) (contract) and [docs/AUDIT-KEEPER-WEB.md](docs/AUDIT-KEEPER-WEB.md) (keeper and web). Each finding has a regression test that failed before the fix.

| # | Severity | Finding | Fixed by |
| --- | --- | --- | --- |
| F1 | High (keeper economics) | Unfillable orders could drain a keeper's bond at the cost of gas | `release(id)`, zero-min-out orders rejected, the keeper never claims what it cannot fill |
| F2 | Medium (user funds, narrow) | `gate()` could revert and block `cancel()` | Issuer and pool reads are `try/catch`, so a failing read is a closed gate |
| KW1 | High (keeper availability) | The keeper read every order every run | A bounded, rotating window of 15 pages per run |
| KW2 | Low today (secrets) | An RPC URL with a key could reach the public status page through an error | Redaction of everything served or stored |
| KW3 | Medium (keeper availability) | `/status` could spend KV reads, and a KV error could break a run | One cache key, and bookkeeping that cannot break trading |
| KW4 | Medium (user protection) | No security headers (clickjacking, script origin) | CSP and friends, tested against the real build |

F1 and F2 led to a redeploy: the first contract was deployed and verified, then audited, and replaced by v2 before anyone bonded or used it ([docs/TRANSACTIONS.md](docs/TRANSACTIONS.md)).

## Honest limits

1. **This was a self-review.** The authors wrote the code and the audit. We wrote an attack test for each suspicion and ran it against the deployed code, and we checked the contract against an independent reference model with random sequences (25 seeds of 400 steps), but the same people did both. A third party would find things we did not.
2. **$WIF liquidity is thin.** $WIF is a launchpad token. On Blockscout on 1 Nov 2026 it was priced at about $0.00135 with 1,540 holders (docs/FEASIBILITY.md), and the main Uniswap pool is shallow. At that price the bond (1,000 WIF) is worth about $1.35 and the minimum fee (20 WIF) about 3 cents. So the bond is a **weak economic deterrent** today, and the slash is symbolic at this size. We chose small amounts on purpose. **The contract's safety does not depend on the bond**: it enforces the gate and the minimum output whoever calls it. What the bond and the burn add is accountability and a visible flywheel, and they will only mean something if $WIF depth grows.
3. **Everything is immutable.** A bug in the deployed contract cannot be patched. The fix is a new deployment (as happened with v1), and orders on the old one are cancelled by their owners.
4. **The region gate is a front-end gate.** It stops the site from creating orders where Stock Tokens may not be offered, using the country Cloudflare reports. It is not access control: the contract is permissionless, anyone can call it directly or use another front end, and a VPN defeats the gate. It is a good-faith notice, not a legal control.
5. **One keeper.** Today a single keeper (ours) runs the 1-minute cron. If it is down, orders wait and nothing is lost. Anyone can bond and run another.
6. **The site's headers are new.** The CSP is tested locally against the production build but only goes live on the next deploy.

## Reporting a problem

Please [open an issue](https://github.com/ace-coderr/lastbell/issues/new) on the repository. If it is sensitive, say only that you have a security report and do not post details; we will agree a private way to receive it. There is no bounty. If you find a way to lose funds, please tell us first.
