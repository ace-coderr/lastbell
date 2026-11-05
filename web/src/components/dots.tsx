import type { ReactNode } from "react";

/*
 * Original dot-matrix illustrations. Each is a grid of circles on a 10 px pitch, drawn from code, with CSS-only
 * motion (staggered per-dot animation delays) that stops under prefers-reduced-motion.
 */

const P = 10; // pitch
type Tone = "coral" | "lilac" | "mint" | "muted";
const fill = (t: Tone) => (t === "muted" ? "var(--muted)" : `var(--${t})`);

function Dot({ c, r, tone, cls, delay = 0, o = 1 }: { c: number; r: number; tone: Tone; cls?: string; delay?: number; o?: number }) {
  return <circle className={cls} cx={c * P + P / 2} cy={r * P + P / 2} r={tone === "muted" ? 0.9 : 2.3} fill={fill(tone)} opacity={o} style={{ animationDelay: `${delay}s` }} />;
}

function Frame({ cols, rows, label, children }: { cols: number; rows: number; label: string; children: ReactNode }) {
  const faint: ReactNode[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) faint.push(<Dot key={`${c}-${r}`} c={c} r={r} tone="muted" o={0.28} />);
  return (
    <svg className="dm" viewBox={`0 0 ${cols * P} ${rows * P}`} role="img" aria-label={label}>
      {faint}
      {children}
    </svg>
  );
}

/** 01: a price line that is frozen on the left and fresh on the right, with a gate that opens between them. */
export function FreshGuardArt() {
  const cols = 24;
  const rows = 12;
  const line = Array.from({ length: cols }, (_, c) => ({ c, r: 6 + Math.round(2.4 * Math.sin(c / 2.9)) }));
  return (
    <Frame cols={cols} rows={rows} label="A price line frozen on the left and fresh on the right, with a gate between them">
      {line.map(({ c, r }) => (
        <Dot key={c} c={c} r={r} tone={c < 14 ? "lilac" : "mint"} cls="dm-wave" delay={c * 0.12} o={c < 14 ? 0.55 : 1} />
      ))}
      {Array.from({ length: 10 }, (_, i) => (
        <Dot key={`g${i}`} c={14} r={1 + i} tone="coral" cls="dm-gate" delay={i * 0.08} />
      ))}
      <Dot c={13} r={0} tone="lilac" cls="dm-blink" />
      <Dot c={15} r={0} tone="mint" cls="dm-blink" delay={0.6} />
    </Frame>
  );
}

/** 02: a stack of bonded dots, one of which is slashed and burns away. */
export function BondSlashArt() {
  const cols = 24;
  const rows = 12;
  const stack: ReactNode[] = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) stack.push(<Dot key={`s${c}-${r}`} c={8 + c} r={5 + r} tone="lilac" cls="dm-wave" delay={(c + r) * 0.1} o={0.85} />);
  return (
    <Frame cols={cols} rows={rows} label="A stack of bonded dots with one slashed dot burning away">
      {stack}
      {[0, 1, 2].map((i) => (
        <Dot key={`f${i}`} c={9 + i} r={4} tone="coral" cls="dm-rise" delay={i * 0.35} />
      ))}
      <Dot c={10} r={3} tone="coral" cls="dm-rise" delay={0.2} />
      <Dot c={10} r={2} tone="coral" cls="dm-rise" delay={0.5} o={0.7} />
      {[5, 6, 7].map((r) => (
        <Dot key={`k${r}`} c={17} r={r} tone="mint" cls="dm-blink" delay={r * 0.2} />
      ))}
      {[5, 6, 7].map((r) => (
        <Dot key={`k2${r}`} c={4} r={r} tone="mint" cls="dm-blink" delay={r * 0.25} o={0.7} />
      ))}
    </Frame>
  );
}

/** 03: a ring of tokens turning, with sparks leaving it as they burn. */
export function BurnFlywheelArt() {
  const cols = 24;
  const rows = 12;
  const cx = 11.5;
  const cy = 5.5;
  const ring = Array.from({ length: 22 }, (_, i) => {
    const a = (i / 22) * Math.PI * 2;
    return { c: Math.round(cx + Math.cos(a) * 8.6), r: Math.round(cy + Math.sin(a) * 4.6), i };
  });
  return (
    <Frame cols={cols} rows={rows} label="A ring of tokens turning, with sparks rising as they burn">
      <g className="dm-spin" style={{ transformOrigin: `${cx * P + P / 2}px ${cy * P + P / 2}px` }}>
        {ring.map(({ c, r, i }) => (
          <Dot key={i} c={c} r={r} tone={i % 5 === 0 ? "coral" : "lilac"} o={i % 5 === 0 ? 1 : 0.7} />
        ))}
      </g>
      {[[11, 5], [12, 5], [11, 6], [12, 6], [11, 4], [12, 7]].map(([c, r], i) => (
        <Dot key={`n${i}`} c={c!} r={r!} tone="coral" cls="dm-blink" delay={i * 0.18} />
      ))}
      {[3, 20, 7].map((c, i) => (
        <Dot key={`p${i}`} c={c} r={2} tone="coral" cls="dm-rise" delay={i * 0.8} />
      ))}
    </Frame>
  );
}

/** 04: a vault of dots with a key inside and an arrow showing it can always come back out. */
export function CustodyArt() {
  const cols = 24;
  const rows = 12;
  const box: ReactNode[] = [];
  for (let c = 4; c <= 15; c++) {
    box.push(<Dot key={`t${c}`} c={c} r={1} tone="lilac" o={0.8} />, <Dot key={`b${c}`} c={c} r={10} tone="lilac" o={0.8} />);
  }
  for (let r = 2; r <= 9; r++) {
    box.push(<Dot key={`l${r}`} c={4} r={r} tone="lilac" o={0.8} />, <Dot key={`r${r}`} c={15} r={r} tone="lilac" o={0.8} />);
  }
  return (
    <Frame cols={cols} rows={rows} label="A vault with a key inside and an arrow showing the owner can always withdraw">
      {box}
      {[[7, 5], [8, 4], [9, 4], [8, 6], [9, 6], [10, 5], [11, 5], [12, 5], [12, 6]].map(([c, r], i) => (
        <Dot key={`k${i}`} c={c!} r={r!} tone="coral" cls="dm-wave" delay={i * 0.12} />
      ))}
      {[16, 17, 18, 19].map((c, i) => (
        <Dot key={`a${c}`} c={c} r={5} tone="mint" cls="dm-flow" delay={i * 0.22} />
      ))}
      <Dot c={19} r={4} tone="mint" cls="dm-flow" delay={0.7} />
      <Dot c={19} r={6} tone="mint" cls="dm-flow" delay={0.7} />
      <Dot c={21} r={5} tone="lilac" cls="dm-blink" />
    </Frame>
  );
}
