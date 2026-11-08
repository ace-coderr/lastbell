# Keeper and web audit

Scope: the keeper Worker (`keeper/src`), the web app (`web/src`, `web/server`, `web/functions`) and the dependency tree. 5 Nov 2026, by the authors. This is a self-review backed by tests, not a third-party audit. The contract audit is in [AUDIT.md](AUDIT.md).

Method: read the code as an attacker, write down what each piece trusts, reproduce the suspicion where possible, fix it, keep a test. The contract does not trust the keeper or the website, so the worst case for both is lost availability or a leaked secret, never lost user funds. Findings are rated on that basis.

## Findings

| # | Severity | Where | Finding | Fix |
|---|---|---|---|---|
| KW1 | **High** (keeper availability) | keeper | **The keeper read every order on every run.** Orders are cheap to create, so a long list makes each run slower and eventually exceeds a Worker's limit on outgoing requests, at which point the keeper stops acting at all. Nothing on chain limits the list. | A run reads at most 15 pages of 200 orders. Up to 3,000 orders are read in full every minute. Beyond that a window of pages is read and moves on each run (the cron minute picks it), so every order is still visited, with no stored state. `/status` reports `openOrders.scanComplete`. Test: [`keeper/test/scan.test.ts`](../keeper/test/scan.test.ts). |
| KW2 | Low today, High if it ever leaks (secrets) | keeper | **The RPC URL carries an API key and can end up in a public page.** I reproduced it: a viem error's full `message` quotes the RPC URL, while its `shortMessage`, `details` and `cause.message` do not. The keeper only stores `shortMessage` and `details` today, so nothing leaked, but one wrapped error or one future change would put the key on the public `/status` page. | Everything the Worker serves or stores passes through `redact()` first: the RPC URLs, the private key in every form, and the path and query of every URL. Test: [`keeper/test/redact.test.ts`](../keeper/test/redact.test.ts). |
| KW3 | Medium (keeper availability) | keeper | **`/status` could be made to spend KV reads.** The edge cache was keyed on the full URL, so `?x=1`, `?x=2`, ... each missed the cache and read KV. The cron also reads KV, and a failed KV call inside the run could throw after the keeper had already traded. | One cache entry for `/status` whatever the query string. Recording a run is wrapped so a KV outage or quota error is logged and ignored: trading never depends on bookkeeping. |
| KW4 | Medium (user protection) | web | **No security headers.** Without `frame-ancestors`, another site could frame the app and trick a click on "Place order" (clickjacking). There was also no limit on where scripts load from or where the page may connect. | Every response now carries a Content-Security-Policy (`script-src 'self'`, `frame-ancestors 'none'`, `connect-src` only the chain RPC and the keeper Worker), `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy and a locked-down permissions policy. Set in the Pages Function ([`web/server/headers.ts`](../web/server/headers.ts), test in [`web/test/headers.test.ts`](../web/test/headers.test.ts)). I loaded the production build through the real Function in Chrome with live chain data and found **no violations**. The first run did find one problem: the build inlines small fonts as `data:` URIs, so `font-src` allows `data:`. **Takes effect on the next deploy.** |
| KW5 | Low | web | **`?demo` works on the live site.** Anyone can send a link that shows sample data (for example "62 orders filled") on the real domain. | Accepted. The page carries a visible "demo data" badge, and demo mode cannot send a transaction. |
| KW6 | Low (dev tooling) | dependencies | `npm audit --omit=dev` reports one high issue, in `zod` below 4.6.6 (memory use on oversized input). | Accepted. It is pulled in only by Hardhat's own plugins in `contracts/`. It is not in the keeper Worker or the web bundle, and `npm audit fix` risks breaking the Hardhat toolchain. |

## Checked, nothing found

| Area | What was looked at | Result |
|---|---|---|
| **Keeper key** | Where `KEEPER_PRIVATE_KEY` is read and where it could be printed | A Worker secret, never in config or git. A bad key produces a message that never contains any part of it. The key can only bond, claim, fill, release and cancel: it cannot move a user's funds, and the contract re-checks every action. |
| **Keeper acting on stale data** | Every claim and fill | The contract re-checks the gate at claim and again at fill; the keeper's own plan is advisory. A buggy keeper can only fail to act. |
| **Keeper losing its bond** | A claim that cannot be filled | The keeper quotes the real pool before claiming, never claims a zero min-out, and releases any claim whose fill fails. Slash only happens if a claim is left to lapse on a fresh gate. |
| **Approvals** | Every token approval the app asks for | Exact amounts, never unlimited. Each transaction is simulated before the wallet is asked. |
| **Wrong network** | Sending while the wallet is on another chain | Order placement is disabled until the wallet is on Robinhood Chain, and a viem chain mismatch is turned into a plain message. |
| **Injection** | `dangerouslySetInnerHTML`, `innerHTML`, `eval` | None in the app. Everything from the keeper or the chain is rendered as text, and the only thing written into the HTML on the server is a two-character country code that must match `[A-Za-z0-9]{2}`. |
| **Local test wallet** | The mock wallet used for local chains | Only added when the build sets `VITE_CHAIN=local`, which no deploy does. |
| **Cached pages** | Whether one visitor's region could be served to another | The HTML is `private, no-store`. |
| **`/status` content** | What the public page exposes | Contract totals, market prices, the keeper's address and bond. No owner addresses, no keys. CORS is open on purpose so the site can read it. |

## Known limits (accepted, not fixed)

- **A crash between claim and fill with a very long order list.** The keeper claims and fills in the same run, and releases a failed claim at once. If the Worker died in between and the list were longer than 3,000 orders, the next run might not see its own claim inside the window, and the claim could lapse into a slash of 100 WIF. Not reachable at today's size.
- **One keeper, one key, one RPC provider.** If any of them is down, orders wait and owners can cancel. The keeper key is held as a Worker secret, which is as safe as the Cloudflare account that holds it.
- **Cron timing.** Cloudflare may run a cron late. The claim window is 120 seconds, which is two runs.
- **The keeper does not check that a fee is worth more than its gas.** Gas on this chain is a fraction of a cent, and the minimum fee is 20 WIF.
- **The region gate is a front-end gate.** See [SECURITY.md](../SECURITY.md).
- **Wallet flows are not tested in a real browser wallet in CI.** They were exercised end to end on a local chain and on mainnet by hand ([TRANSACTIONS.md](TRANSACTIONS.md)).

## Tests

`npm test --workspaces`: keeper 24 (plan, status, key, scan window, redaction), web 22 (adds security headers), contracts 87, shared 24. Typecheck is clean in every workspace.
