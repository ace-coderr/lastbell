/** The largest "round" quantity worth at most this many dollars, so the form opens on a few-dollar example. */
const TARGET_USD = 12;
const STEPS = [1, 0.5, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001, 0.0005, 0.0001];

/** Default amount for a new order: a tiny quantity of the token (stop-loss) or a few USDG (limit buy). */
export function defaultAmount(kind: "stop" | "limit", price: number): string {
  if (kind === "limit") return "10";
  if (!(price > 0)) return "0.01";
  const pick = STEPS.find((s) => s * price <= TARGET_USD) ?? STEPS[STEPS.length - 1]!;
  return String(pick);
}
