# Progress

Submissions close 12 Nov 2026, 17:30 UTC. Target submit 10 Nov. Feature freeze 9 Nov.

- [x] 1. Feasibility spike: see [FEASIBILITY.md](FEASIBILITY.md). Decision: **MODE A** (fixed Uniswap v3 USDG pools: SPY, NVDA, AAPL)
- [x] 2. Scaffold: npm workspaces (shared, contracts, keeper, web), README skeleton, CI (typecheck, test, web build). Shared market-hours + freshness gate cross-checked against the tz database; NYSE holidays 2026-2027 built in
- [x] 3. Contracts: escrow, keeper registry + $WIF bond, prepaid fees, 50/50 burn split, freshness checks, slashing. See [CONTRACTS.md](CONTRACTS.md). No owner; 18.5 KB runtime; smoke tests + on-chain market hours cross-check pass
- [x] 4. Contract tests: 52 unit tests + seeded random sequences checked against an independent reference model (funds never lost, no execution on stale/paused feed, fees add up, no unbond with a live claim). Stress: 25 × 400 steps
- [x] 5. Keeper: Cloudflare Worker, 1-minute cron, public `/status`. Pre-claim quote check, KV run log. See [KEEPER.md](KEEPER.md). Deploy pending task 8 (needs your Cloudflare login + keeper key)
- [x] 6. Web app: three screens (Trade, Orders, Flywheel) with day/night market mood; wallet + wrong-network switch; exact approvals, place, cancel/refund with plain-English errors; armed / queued / executing / filled / expired / error states; live market clock; burn + keeper dashboard. Seeded demo mode. Verified with real transactions on a local chain (place → keeper fill → filled; error; cancel)
- [ ] 7. Region notice (Pages Function)
- [ ] 8. Mainnet deploy, verify, real orders, docs/TRANSACTIONS.md
- [ ] 9. Audit + SECURITY.md
- [ ] 10. Submission pack: README, docs/DEMO-PATH.md
- [ ] 11. Final checks (10 Nov)
