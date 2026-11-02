import type { MarketClock as Clock } from "@lastbell/shared";
import { AnimatePresence, motion } from "motion/react";
import { localWhen } from "../lib/format.js";
import { formatCountdown } from "../lib/time.js";

/** "Market open · closes in 3d 4h" / "After hours · opens in 2h 14m (Mon 02:00)". */
export function MarketClock({ clock, now }: { clock: Clock; now: number }) {
  const target = clock.open ? (clock.nextClose ?? now) : clock.nextOpen;
  return (
    <div className={`clock ${clock.open ? "is-open" : "is-closed"}`} role="status" aria-live="polite">
      <span className="dot" />
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={clock.open ? "open" : "closed"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
          <strong>{clock.open ? "Market open" : "After hours"}</strong>
          <span className="muted">
            {" "}
            · {clock.open ? "closes" : "opens"} in <span className="num">{formatCountdown(target - now)}</span>
          </span>
          <span className="muted clock-detail"> ({localWhen(target)})</span>
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
