# UI audit (before the redesign)

Measured on the live site, 5 Nov 2026.

| Area | What is weak | Evidence |
|---|---|---|
| **Favicon and brand** | There is no favicon, apple-touch icon or share image. `/favicon.ico`, `/favicon.svg`, `/apple-touch-icon.png` and `/og.png` all return the app's HTML page (200, `text/html`, 547 bytes), so browsers show a blank icon and links share as a bare URL. The page title is just "Lastbell". | `curl` of each path |
| **Navbar** | Four things compete for the bar: logo, three tabs, a long market clock sentence and a wallet button. On a phone it wraps to **three rows, 163 px tall, 19% of the screen**, and stays sticky. No link to the docs or the code. The "demo data" badge sits elsewhere and the clock repeats the time twice ("closes in 1d 15h (Sat 02:00)"). | 390 px screenshot, `.topbar` height |
| **Colour** | Brown and amber everywhere, plus a full-page day/night colour shift driven by the market clock. It reads as a generic dark theme, not a brand, and the amber/brown pair has weak contrast for small text on the brown surfaces. | `tokens.css` |
| **Structure** | The home page is only an app: a headline and a form. Nothing explains what the product does, why a keeper or $WIF matters, or where to verify it. A first-time visitor has no landing, no proof (stats), no footer, no links to the contract or the code. | Trade screen |
| **Empty states** | Orders: one line of text on an empty page ("Connect your wallet to see your orders." / "No orders yet."). No explanation of what an order is, no next step, no example. | 390 px screenshot |
| **Feedback states** | Errors are one red banner. A wallet rejection (nothing happened) looks the same as a failed transaction. Stale data (keeper snapshot, failing RPC) is invisible. A closed market is shown as a chip but "queued until open" is not explained where you place the order. | `App.tsx` |
| **Mobile** | All 7 interactive elements are below the 44 px tap target on a 390 px screen. Tickets and tables rely on horizontal squeezing. The fee, slippage and expiry chips are small. | `getBoundingClientRect` |
| **Motion** | Good bones (nav pill, order rail, burn counter), but prices never visibly tick, the "would it fire" checklist appears all at once, a fill has no moment, and loading is plain text ("Reading markets from chain…"). | Trade and Orders screens |
| **Accessibility** | Focus ring colour matches the accent but is thin; small mono labels at 11 to 12 px in a muted brown. | `base.css` |

## Direction

Dusk-ink and cream sections, coral as the one accent, lilac for secondary, mint only for live and OK. A real landing above and below the widget, a bento of numbered cells with original dot-matrix art, live stat tiles, a footer, a compact navbar (logo, links, one status chip, one wallet button), and a state for every moment the user can be in.
