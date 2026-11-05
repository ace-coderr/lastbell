import { motion, useReducedMotion } from "motion/react";

/** The same silhouette as favicon.svg (64 x 64 grid). */
export const BELL_PATH = "M32 13C22.5 13 17 20.5 17 30.5V39.5L11.5 46.5H52.5L47 39.5V30.5C47 20.5 41.5 13 32 13Z";

/** The Lastbell mark. While the market is open it gives a small ring every few seconds; after hours it sleeps. */
export function BellMark({ ringing, size = 28 }: { ringing: boolean; size?: number }) {
  const reduce = useReducedMotion();
  const ring = { duration: 1.1, repeat: Infinity, repeatDelay: 5, ease: "easeInOut" as const };
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
      style={{ originX: "50%", originY: "15%" }}
      animate={ringing && !reduce ? { rotate: [0, 14, -11, 8, -4, 2, 0] } : { rotate: 0 }}
      transition={ringing ? ring : { duration: 0.4 }}
    >
      <path d={BELL_PATH} fill="var(--coral)" />
      <circle cx="32" cy="9.5" r="3.2" fill="var(--lilac)" />
      <motion.circle
        cy="52.2"
        r="4.6"
        fill="var(--lilac)"
        animate={ringing && !reduce ? { cx: [32, 27, 37, 30, 32] } : { cx: 32 }}
        transition={ringing ? ring : { duration: 0.4 }}
      />
    </motion.svg>
  );
}
