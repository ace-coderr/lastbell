import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/**
 * A number that counts to its value when it first appears and flashes green or coral when a new price
 * arrives. Under reduced motion it just shows the value.
 */
export function TickingNumber({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : value * 0.985);
  const [flash, setFlash] = useState<{ dir: "up" | "down"; n: number } | null>(null);
  const prev = useRef<number | null>(null);

  useEffect(() => {
    const from = prev.current ?? value * 0.985;
    if (prev.current !== null && prev.current !== value) setFlash((f) => ({ dir: value > prev.current! ? "up" : "down", n: (f?.n ?? 0) + 1 }));
    prev.current = value;
    if (reduce) {
      setShown(value);
      return;
    }
    const controls = animate(from, value, { duration: 0.7, ease: [0.22, 1, 0.36, 1], onUpdate: setShown });
    return () => controls.stop();
  }, [value, reduce]);

  return (
    <span key={flash?.n ?? 0} className={`${className ?? ""} ${flash ? `tick-${flash.dir}` : ""}`} aria-label={format(value)}>
      {format(shown)}
    </span>
  );
}
