const usdFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compactFmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const numFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

export const usd = (n: number) => usdFmt.format(n);
export const num = (n: number) => numFmt.format(n);
export const compact = (n: number) => compactFmt.format(n);
export const wif = (n: number) => `${n >= 100_000 ? compact(n) : numFmt.format(Math.round(n * 100) / 100)} WIF`;
export const pct = (n: number, digits = 2) => `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** "Mon 02:00" in the viewer's own time zone. */
export function localWhen(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

/** "4 min ago", "2 h ago", "3 d ago" */
export function ago(ts: number, now: number): string {
  const s = Math.max(0, now - ts);
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
