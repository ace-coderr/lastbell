# Progress

Submissions close 12 Nov 2026, 17:30 UTC. Target submit 10 Nov. Feature freeze 9 Nov.

- [x] 1. Feasibility spike: see [FEASIBILITY.md](FEASIBILITY.md). Decision: **MODE A** (fixed Uniswap v3 USDG pools: SPY, NVDA, AAPL)
- [x] 2. Scaffold: npm workspaces (shared, contracts, keeper, web), README skeleton, CI (typecheck, test, web build). Shared market-hours + freshness gate cross-checked against the tz database; NYSE holidays 2026-2027 built in
- [ ] 3. Contracts: escrow, keeper registry + $WIF bond, prepaid fees, 50/50 burn split, freshness checks, slashing
- [ ] 4. Contract tests: unit + randomized invariant sequences
- [ ] 5. Keeper: Cloudflare Worker, 1-minute cron, public status endpoint
- [ ] 6. Web app: wallet, network handling, orders, states, market clock, bond/burn dashboard
- [ ] 7. Region notice (Pages Function)
- [ ] 8. Mainnet deploy, verify, real orders, docs/TRANSACTIONS.md
- [ ] 9. Audit + SECURITY.md
- [ ] 10. Submission pack: README, docs/DEMO-PATH.md
- [ ] 11. Final checks (10 Nov)
