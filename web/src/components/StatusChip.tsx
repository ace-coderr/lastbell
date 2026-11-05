import type { MarketClock } from "@lastbell/shared";
import { formatCountdown } from "../lib/time.js";

/** The one market-status chip in the navbar: open or closed, with a live countdown to the next change. */
export function StatusChip({ clock, now }: { clock: MarketClock; now: number }) {
  const target = clock.open ? (clock.nextClose ?? now) : clock.nextOpen;
  const time = formatCountdown(target - now);
  return (
    <span className="status-chip" data-open={clock.open} title={clock.open ? "US market session is open" : "US market is closed: orders queue until it opens"}>
      <span className="dot" aria-hidden />
      <span className="sc-desktop">
        {clock.open ? "Market open" : "After hours"} <span className="muted">· {clock.open ? "closes in" : "opens in"}</span> <b>{time}</b>
      </span>
      <span className="sc-mobile">
        {clock.open ? "Open" : "Closed"} <span className="muted">·</span> <b>{time}</b>
      </span>
    </span>
  );
}
