import { marketClock } from "@lastbell/shared";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { formatCountdown, nowSeconds } from "./lib/time.js";

// Placeholder shell. The three demo screens are designed and built in task 6.
export function App() {
  const [now, setNow] = useState(nowSeconds);
  useEffect(() => {
    const id = setInterval(() => setNow(nowSeconds()), 1000);
    return () => clearInterval(id);
  }, []);
  const clock = marketClock(now);

  return (
    <main className="shell">
      <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        Lastbell
      </motion.h1>
      <p className="tagline">Stop and limit orders for Stock Tokens that only fire on a fresh price.</p>
      <motion.div className={`clock ${clock.open ? "open" : "closed"}`} layout>
        <span className="dot" />
        {clock.open
          ? `Market open · closes in ${formatCountdown((clock.nextClose ?? now) - now)}`
          : `Market closed · orders queued · opens in ${formatCountdown(clock.nextOpen - now)}`}
      </motion.div>
    </main>
  );
}
