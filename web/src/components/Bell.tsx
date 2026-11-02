import { motion, useReducedMotion } from "motion/react";

/** The Lastbell mark. While the market is open it gives a small ring every few seconds; after hours it sleeps. */
export function BellMark({ ringing, size = 26 }: { ringing: boolean; size?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      style={{ originX: "50%", originY: "12%" }}
      animate={ringing && !reduce ? { rotate: [0, 16, -13, 9, -5, 2, 0] } : { rotate: 0 }}
      transition={ringing ? { duration: 1.1, repeat: Infinity, repeatDelay: 5, ease: "easeInOut" } : { duration: 0.4 }}
    >
      <path d="M16 3.5a1.8 1.8 0 0 1 1.8 1.8v.6c4.3.9 7.2 4.7 7.2 9.4v5.2l2.3 3.3c.4.6 0 1.4-.7 1.4H5.4c-.7 0-1.1-.8-.7-1.4L7 20.5v-5.2c0-4.7 2.9-8.5 7.2-9.4v-.6A1.8 1.8 0 0 1 16 3.5Z" fill="currentColor" />
      <motion.circle
        cx="16"
        cy="27.6"
        r="2.6"
        fill="currentColor"
        animate={ringing && !reduce ? { cx: [16, 13.5, 18.5, 15, 16] } : { cx: 16 }}
        transition={ringing ? { duration: 1.1, repeat: Infinity, repeatDelay: 5, ease: "easeInOut" } : { duration: 0.4 }}
      />
    </motion.svg>
  );
}
