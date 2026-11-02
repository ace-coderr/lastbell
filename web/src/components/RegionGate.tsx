import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Region } from "../region.js";
import { Shield } from "./icons.js";

const ACK_KEY = "lastbell:region-ack";

function acknowledged(): boolean {
  try {
    return sessionStorage.getItem(ACK_KEY) === "1";
  } catch {
    return false;
  }
}

function headline(r: Region): string {
  return r.status === "blocked" ? `Lastbell isn't available in ${r.place ?? "your region"}` : "We couldn't confirm your region";
}

function body(r: Region): string {
  return r.status === "blocked"
    ? "Stock Tokens may not be offered here, so placing orders is turned off."
    : "Stock Tokens can't be offered in some regions, and we couldn't tell where you are (for example over Tor or a private relay), so placing orders is turned off.";
}

const KEEP = "You can still see prices and the flywheel, and you can always cancel or refund any order you already hold.";

/** Blocking notice on first visit, then a persistent banner. Order creation is disabled by the caller. */
export function RegionGate({ region }: { region: Region }) {
  const restricted = region.status !== "allowed";
  const [open, setOpen] = useState(() => restricted && !acknowledged());
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) button.current?.focus();
  }, [open]);
  if (!restricted) return null;

  const close = () => {
    try {
      sessionStorage.setItem(ACK_KEY, "1");
    } catch {
      // private mode: the notice simply shows again next visit
    }
    setOpen(false);
  };

  return (
    <>
      <div className="banner region-banner" data-tone="warn" role="status">
        <Shield size={16} />
        <span className="grow">
          <strong>{headline(region)}.</strong> New orders are off. Cancelling and refunds still work.
        </span>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div className="region-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              className="region-dialog card card-pad"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="region-title"
              aria-describedby="region-body"
              initial={{ y: 16, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 8, opacity: 0 }}
              onKeyDown={(e) => e.key === "Escape" && close()}
            >
              <Shield size={28} />
              <h2 id="region-title" className="display">
                {headline(region)}
              </h2>
              <p id="region-body">
                {body(region)} {KEEP}
              </p>
              <button ref={button} className="btn btn-primary" onClick={close}>
                I understand, continue view-only
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
