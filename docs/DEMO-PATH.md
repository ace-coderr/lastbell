# Demo path

Three screens, in this order, about 90 seconds. Everything below uses what is on the live site today. No video is included in the repository; this is the script for recording one.

**Before you record**
- Use a desktop window about 1280 px wide.
- For the real run, connect the wallet that placed order 0 (the deployer wallet, which owns it) on Robinhood Chain. The Orders screen only shows the connected wallet's orders.
- For a run without a wallet, add `?demo` to the address. A "demo data" badge shows, and **Place** is labelled "(demo)" and sends nothing.
- To show the weekend state, use `?demo&at=2026-11-07T15:00:00Z`.

## Screen 1: Trade (`#trade`)

The pitch: an order that only fires on a real price.

1. Open https://lastbell-cyk.pages.dev. Point at the headline, **Stop-losses that sleep when the market sleeps**, and the chip at the top right: **Market open · closes in …**.
2. Click the **NVDA** card. The amount opens on a few dollars (**0.05 NVDA**) and the trigger is filled in 3% below the price. Each card says **fresh this session**.
3. Click the **-5%** chip under the trigger. The sentence under the form rewrites itself.
4. Point at the fee bar: **half burned forever, half to the keeper**, and the line **Keeper fee, prepaid in $WIF**.
5. Point at **Would it fire right now?** and let the four checks resolve one by one: market session, fresh Chainlink price, pool agrees with oracle, trigger reached. The verdict reads **Not yet, it waits**.
6. Optional, with `&at=2026-11-07T15:00:00Z`: the banner says the order will be **queued until the market opens**, with a countdown.
7. Click **Place stop-loss**. Live: approve the token, approve $WIF, then place (three wallet prompts, exact amounts). Demo: it jumps straight to Orders.

## Screen 2: Orders (`#orders`)

The pitch: you can always see what an order is doing, and what the keeper did.

1. Click **Orders** in the navbar. Show the order card and its timeline: **Placed, Watching, Triggered, Filled**.
2. Live, order 0: the card reads **Filled**, **Sold for … USDG**, **10 WIF burned**. Click **Fill tx** to open the transaction on the explorer, then come back.
3. Point at a **Watching** card and its **Cancel** button: you keep control at all times.
4. Demo only: click **Cancel** on a watching order and watch it turn to cancelled.

## Screen 3: Flywheel (`#flywheel`)

The pitch: why $WIF matters, and the proof that it works.

1. Click **Flywheel** in the navbar. Read the four tiles: **WIF burned**, **Orders filled**, **Paid to keepers**, **Bonded by keepers**. On the live site these come from the chain (1 order filled, 10 WIF burned, 1,000 WIF bonded).
2. Scroll to **Follow one fee**: you prepay, a keeper fills, half is burned, half pays the keeper. Point at the bar under it.
3. Scroll to **Keeper status** and show the keeper's bond and the cron status, then the right-hand list, **If a keeper fails**: it is slashed, or the order simply waits and you cancel.
4. Scroll to **Execution gate, per market** to show each market's price and **fresh** state.
5. Finish on the footer: click the **Contract** link, then point at the line **Independent project. Not affiliated with…**.

## If something goes wrong

- Blank prices or an old date: reload, and check that the keeper status link in the footer answers.
- A region notice on a restricted network: choose **I understand, continue view-only**, or use `?demo`.
- Wrong network in the wallet: use **Switch to Robinhood Chain** in the strip under the navbar.
