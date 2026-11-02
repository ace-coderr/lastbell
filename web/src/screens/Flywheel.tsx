import { QUEUE_REASON_TEXT } from "@lastbell/shared";
import { animate, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Flame, Moon, Shield } from "../components/icons.js";
import { ago, compact, shortAddress, usd, wif } from "../lib/format.js";
import type { FlywheelStats, UiMarket } from "../model.js";

export function FlywheelScreen({ stats, markets, now }: { stats: FlywheelStats; markets: UiMarket[]; now: number }) {
  const burned = stats.burnedFromFees + stats.slashedBurned;
  return (
    <div className="flywheel">
      <header className="screen-head">
        <div>
          <p className="label">The $WIF flywheel</p>
          <h1 className="display screen-title">Every fill burns $WIF. Every keeper locks it.</h1>
        </div>
      </header>

      <div className="fw-grid">
        <section className="card card-pad burn-card">
          <span className="label">$WIF burned by Lastbell</span>
          <div className="burn-number display">
            <Flame size={34} />
            <CountUp value={burned} />
          </div>
          <div className="burn-parts">
            <span>
              <span className="burn-text">{wif(stats.burnedFromFees)}</span> from fees
            </span>
            <span>
              <span className="burn-text">{wif(stats.slashedBurned)}</span> slashed from idle keepers
            </span>
          </div>
          <div className="tiles">
            <Tile label="Orders filled" value={String(stats.fills)} />
            <Tile label="Paid to keepers" value={wif(stats.paidToKeepers)} />
            <Tile label="Bonded by keepers" value={wif(stats.bonded)} />
            <Tile label="Prepaid fees" value={wif(stats.prepaid)} />
          </div>
        </section>

        <section className="card card-pad wheel-card">
          <span className="label">How the loop feeds itself</span>
          <Wheel />
        </section>
      </div>

      <div className="fw-grid two">
        <section className="card card-pad">
          <div className="section-head">
            <span className="label">Keepers</span>
            {stats.lastRun && (
              <span className={`chip`} data-state={stats.lastRun.ok ? "filled" : "error"}>
                cron {stats.lastRun.ok ? "ok" : "error"} · {ago(Math.floor(Date.parse(stats.lastRun.at) / 1000), now)}
              </span>
            )}
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Keeper</th>
                <th className="r">Bond</th>
                <th className="r">Claims</th>
                <th className="r">Fills</th>
                <th className="r">Slashed</th>
              </tr>
            </thead>
            <tbody>
              {stats.keepers.map((k) => (
                <tr key={k.address}>
                  <td className="num">
                    <Shield size={13} /> {shortAddress(k.address)}
                  </td>
                  <td className="r num">{compact(k.bondWif)}</td>
                  <td className="r num">
                    {k.activeClaims}/{k.capacity}
                  </td>
                  <td className="r num">{k.fills}</td>
                  <td className={`r num ${k.slashes ? "burn-text" : ""}`}>{k.slashes}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {stats.lastRun && <p className="fine muted">Last run: {stats.lastRun.summary}</p>}
        </section>

        <section className="card card-pad">
          <span className="label">Execution gate, per market</span>
          <ul className="gates">
            {markets.map((m) => (
              <li key={m.symbol}>
                <span className="ticker small">{m.symbol}</span>
                <span className="num">{usd(m.price)}</span>
                {m.gate === "fresh" ? (
                  <span className="chip" data-state="armed">
                    fresh · {ago(m.updatedAt, now)}
                  </span>
                ) : (
                  <span className="chip" data-state="queued" title={QUEUE_REASON_TEXT[m.gate]}>
                    <Moon size={12} /> {m.gate.replaceAll("-", " ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <span className="label">{label}</span>
      <span className="tile-value num">{value}</span>
    </div>
  );
}

function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return setShown(value);
    const controls = animate(from.current, value, { duration: 1.6, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setShown(v) });
    from.current = value;
    return () => controls.stop();
  }, [value, reduce]);
  return <span className="num burn-value">{Math.round(shown).toLocaleString("en-US")}</span>;
}

const NODES = [
  { label: "Orders", sub: "users prepay fees in $WIF", angle: -90 },
  { label: "Fills", sub: "half the fee burned", angle: 0 },
  { label: "Keepers earn", sub: "the other half", angle: 90 },
  { label: "More bond", sub: "$WIF locked = more capacity", angle: 180 },
];

/** Four-step loop with tokens travelling around it. */
function Wheel() {
  const reduce = useReducedMotion();
  const R = 108;
  const C = 150;
  const pos = (deg: number, r = R) => [C + r * Math.cos((deg * Math.PI) / 180), C + r * Math.sin((deg * Math.PI) / 180)] as const;
  return (
    <div className="wheel">
      <svg viewBox="0 0 300 300" role="img" aria-label="Orders pay $WIF fees; fills burn half and pay keepers half; keepers bond more $WIF to take more orders.">
        <circle cx={C} cy={C} r={R} className="wheel-track" />
        <motion.circle
          cx={C}
          cy={C}
          r={R}
          className="wheel-flow"
          strokeDasharray="10 16"
          animate={reduce ? undefined : { strokeDashoffset: [0, -260] }}
          transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
        />
        {!reduce &&
          [0, 1, 2].map((i) => (
            <motion.circle
              key={i}
              r={4.5}
              className="wheel-token"
              animate={{
                cx: Array.from({ length: 37 }, (_, k) => pos(-90 + k * 10)[0]),
                cy: Array.from({ length: 37 }, (_, k) => pos(-90 + k * 10)[1]),
              }}
              transition={{ duration: 6, repeat: Infinity, ease: "linear", delay: i * 2 }}
            />
          ))}
        <g className="wheel-center">
          <Flame x={C - 14} y={C - 26} width={28} height={28} />
          <text x={C} y={C + 18} textAnchor="middle">
            burn
          </text>
        </g>
        {NODES.map((n) => {
          const [x, y] = pos(n.angle);
          return <circle key={n.label} cx={x} cy={y} r={9} className="wheel-node" />;
        })}
      </svg>
      {NODES.map((n) => {
        const [x, y] = pos(n.angle, R + 6);
        return (
          <div key={n.label} className={`wheel-label a${n.angle}`} style={{ left: `${(x / 300) * 100}%`, top: `${(y / 300) * 100}%` }}>
            <strong>{n.label}</strong>
            <span>{n.sub}</span>
          </div>
        );
      })}
    </div>
  );
}
