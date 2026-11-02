import { useEffect, useState } from "react";
import { nowSeconds } from "./time.js";

/**
 * Demo-only clock override: `?demo&at=2026-11-07T15:00:00Z` pretends it's that moment (then ticks on),
 * so the after-hours state can be shown or recorded on a weekday. Ignored outside demo mode.
 */
export function demoClockOffset(search = window.location.search): number {
  const params = new URLSearchParams(search);
  const at = params.get("at");
  if (!params.has("demo") || !at) return 0;
  const target = Date.parse(at);
  return Number.isFinite(target) ? Math.floor(target / 1000) - nowSeconds() : 0;
}

/** Unix seconds, ticking once a second. */
export function useNow(offset = 0): number {
  const [now, setNow] = useState(() => nowSeconds() + offset);
  useEffect(() => {
    const id = setInterval(() => setNow(nowSeconds() + offset), 1000);
    return () => clearInterval(id);
  }, [offset]);
  return now;
}
