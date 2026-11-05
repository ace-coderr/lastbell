import type { MarketClock } from "@lastbell/shared";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { BellMark } from "./Bell.js";
import { StatusChip } from "./StatusChip.js";
import { External } from "./icons.js";

export type Screen = "trade" | "orders" | "flywheel";
export const SCREENS: [Screen, string][] = [
  ["trade", "Trade"],
  ["orders", "Orders"],
  ["flywheel", "Flywheel"],
];
export const REPO_URL = "https://github.com/ace-coderr/lastbell";

/**
 * Sticky bar with a soft blur: logo, four links, ONE market-status chip, ONE wallet button.
 * On a phone the links and the wallet move into a menu sheet and the bar keeps only logo, chip and menu button.
 */
export function Navbar({ screen, go, clock, now, wallet }: { screen: Screen; go: (s: Screen) => void; clock: MarketClock; now: number; wallet: (opts: { block?: boolean }) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const pick = (s: Screen) => {
    setOpen(false);
    go(s);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="nav-shell">
      <div className="wrap nav-inner">
        <a className="brand" href="#trade" onClick={() => pick("trade")} aria-label="Lastbell home">
          <BellMark ringing={clock.open} />
          lastbell
        </a>

        <nav className="nav-links" aria-label="Main">
          {SCREENS.map(([key, label]) => (
            <button key={key} className="nav-link" aria-current={screen === key ? "page" : undefined} onClick={() => pick(key)}>
              {label}
              {screen === key && <motion.span layoutId="nav-bar" className="bar" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
            </button>
          ))}
          <a className="nav-link" href={`${REPO_URL}#readme`} target="_blank" rel="noreferrer">
            Docs <External size={12} />
          </a>
        </nav>

        <div className="nav-right">
          <StatusChip clock={clock} now={now} />
          <div className="nav-wallet">{wallet({})}</div>
          <button className="menu-btn" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="menu-sheet" onClick={() => setOpen((o) => !o)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 8h16M4 16h16" />}
            </svg>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div id="menu-sheet" className="menu-sheet" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
            <div className="wrap" style={{ padding: 0 }}>
              {SCREENS.map(([key, label]) => (
                <button key={key} className="menu-link" aria-current={screen === key ? "page" : undefined} onClick={() => pick(key)} style={{ width: "100%" }}>
                  {label}
                </button>
              ))}
              <a className="menu-link" href={`${REPO_URL}#readme`} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
                Docs <External size={16} />
              </a>
              {wallet({ block: true })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
