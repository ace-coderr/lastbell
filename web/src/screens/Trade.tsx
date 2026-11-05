import { QUEUE_REASON_TEXT, type MarketClock } from "@lastbell/shared";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { HeroField, BondSlashArt, BurnFlywheelArt, CustodyArt, FreshGuardArt } from "../components/dots.js";
import { Check, Flame, Moon, Shield, ArrowDown, Spinner } from "../components/icons.js";
import { TickingNumber } from "../components/Ticking.js";
import { localWhen, num, pct, usd, wif } from "../lib/format.js";
import { EXPLORER_CONTRACT_URL } from "../links.js";
import { defaultAmount } from "../lib/defaults.js";
import { formatCountdown } from "../lib/time.js";
import type { FlywheelStats, OrderKind, UiMarket } from "../model.js";

export interface OrderDraft {
  market: UiMarket;
  kind: OrderKind;
  amountIn: number;
  trigger: number;
  slippageBps: number;
  expiryDays: number;
  feeWif: number;
}

const SLIPPAGE = [50, 100, 200];
const EXPIRY = [1, 7, 30];
const BAND_BPS = 150;
/** Demo default; live mode passes the deployed contract's own minimum fee. */
export const DEFAULT_MIN_FEE_WIF = 50;

export function TradeScreen(props: {
  markets: UiMarket[];
  clock: MarketClock;
  now: number;
  action: (draft: OrderDraft | null) => ReactNode;
  badge?: ReactNode;
  /** Minimum keeper fee in WIF. Live mode reads it from the contract. */
  minFeeWif?: number;
  stats?: FlywheelStats;
}) {
  const { markets, clock, now, stats } = props;
  const [selected, setSelected] = useState(0);
  const market = markets[selected] ?? markets[0];

  return (
    <>
      <section className="section section-dark hero-section" data-band="none">
        <HeroField />
        <div className="wrap hero-wrap">
          <div className="hero">
            <p className="label hero-label">Stock Token orders · Robinhood Chain {props.badge}</p>
            <h1 className="display hero-title">
              Stop-losses that <em>sleep</em> when the market sleeps.
            </h1>
            <p className="hero-sub">Orders fire only on a fresh price the pool agrees with. Otherwise they wait, and you can cancel any time.</p>
            <div className="hero-links">
              <a className="btn btn-ghost" href="#how" onClick={jump("how")}>
                How it works
              </a>
              <a className="btn btn-ghost" href="#flywheel">
                See the flywheel
              </a>
            </div>
          </div>

          {markets.length === 0 && <MarketSkeleton />}
          <div className="trade-grid">
            <div className="market-list" role="radiogroup" aria-label="Market">
              {markets.map((m, i) => (
                <MarketCard key={m.symbol} m={m} active={i === selected} onSelect={() => setSelected(i)} now={now} />
              ))}
            </div>
            {market && <Ticket market={market} clock={clock} now={now} action={props.action} minFeeWif={props.minFeeWif ?? DEFAULT_MIN_FEE_WIF} />}
          </div>
        </div>
      </section>

      <section className="section section-light" data-band="coral" id="how">
        <div className="wrap">
          <SectionHead n="01" title="How it works" sub="Three steps. You never hand over your tokens." />
          <div className="bento bento-3 joined">
            {HOW.map(([n, title, body]) => (
              <Reveal key={n} className="cell cell-pad how-cell">
                <span className="label">{n}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-ink" data-band="lilac" id="why">
        <div className="wrap">
          <SectionHead n="02" title="Built so it cannot misfire" sub="Four rules, enforced by the contract rather than by trust." />
          <div className="bento bento-2 joined">
            {BENTO.map(({ n, title, body, art }) => (
              <Reveal key={n} className="cell cell-pad bento-cell">
                <div className="bento-art">{art}</div>
                <span className="label">{n}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-light" data-band="mint" id="proof">
        <div className="wrap proof-split">
          <div className="proof-copy">
            <span className="label">03</span>
            <h2 className="display">Live from the chain</h2>
            <p className="muted">Read from the contract and the keeper, not typed in. Every number here can be checked on the explorer.</p>
            <a className="btn btn-primary" href={EXPLORER_CONTRACT_URL} target="_blank" rel="noreferrer">
              Read the contract
            </a>
          </div>
          <StatTiles stats={stats} markets={markets} />
        </div>
      </section>
    </>
  );
}

const HOW: [string, string, string][] = [
  ["01", "Set a trigger", "Pick a Stock Token, an amount and the price that should trigger it. Prepay the keeper fee in $WIF. Your tokens are escrowed in the contract."],
  ["02", "A keeper watches", "Keepers bond $WIF and watch the price. They can only fire when the Chainlink price is fresh and the pool is within its band."],
  ["03", "It fills or it waits", "If every check passes, the swap runs with a minimum output. If not, nothing happens and you can cancel for a full refund."],
];

const BENTO: { n: string; title: string; body: string; art: ReactNode }[] = [
  { n: "01", title: "Fresh-price guard", body: "A frozen weekend price cannot trigger your order. The contract checks session hours, the oracle timestamp and the pool agreement first.", art: <FreshGuardArt /> },
  { n: "02", title: "Keeper bond and slash", body: "Keepers lock $WIF to claim orders. Claim one and let it lapse while the price is fresh, and part of the bond is slashed and burned.", art: <BondSlashArt /> },
  { n: "03", title: "Burn flywheel", body: "Every fee is split: half is burned for good, half pays the keeper that filled the order. More orders mean more burn.", art: <BurnFlywheelArt /> },
  { n: "04", title: "You keep custody", body: "No owner, no admin keys, no pause button. You can cancel and withdraw at any time, even if every keeper disappears.", art: <CustodyArt /> },
];

/** Smooth-scrolls to a section without touching the hash, which the app uses for screens. */
const jump = (id: string) => (e: { preventDefault: () => void }) => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
};

function SectionHead({ n, title, sub }: { n: string; title: string; sub: string }) {
  return (
    <div className="section-head">
      <span className="label">{n}</span>
      <h2 className="display">{title}</h2>
      <p className="muted">{sub}</p>
    </div>
  );
}

/** Fades and lifts into place when scrolled into view. */
function Reveal({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

function StatTiles({ stats, markets }: { stats?: FlywheelStats; markets: UiMarket[] }) {
  const live = markets.filter((m) => m.gate === "fresh").length;
  const tiles: { label: string; value?: number; fmt: (n: number) => string; note: string }[] = [
    { label: "Orders filled", value: stats?.fills, fmt: (n) => num(Math.round(n)), note: stats ? `of ${num(stats.orders)} placed` : "" },
    { label: "WIF burned", value: stats ? stats.burnedFromFees + stats.slashedBurned : undefined, fmt: wif, note: "fees and slashes, gone for good" },
    { label: "Keeper bond", value: stats?.bonded, fmt: wif, note: "locked as a promise to do the job" },
    { label: "Markets live", value: markets.length ? live : undefined, fmt: (n) => `${Math.round(n)} of ${markets.length}`, note: "with a fresh price right now" },
  ];
  return (
    <div className="bento bento-2 joined stat-grid">
      {tiles.map((t) => (
        <div key={t.label} className="cell cell-pad stat-tile">
          <span className="label">{t.label}</span>
          {t.value === undefined ? <span className="skeleton stat-skel" aria-label="Loading" /> : <TickingNumber className="stat-value num" value={t.value} format={t.fmt} />}
          <span className="muted stat-note">{t.note}</span>
        </div>
      ))}
    </div>
  );
}

function MarketSkeleton() {
  return (
    <div className="market-skel" aria-busy="true" aria-label="Reading markets from chain">
      {[0, 1, 2].map((i) => (
        <span key={i} className="skeleton" />
      ))}
    </div>
  );
}

function MarketCard({ m, active, onSelect, now }: { m: UiMarket; active: boolean; onSelect: () => void; now: number }) {
  const drift = ((m.poolPrice - m.price) / m.price) * 100;
  return (
    <motion.button
      layout
      role="radio"
      aria-checked={active}
      className={`market-card card ${active ? "is-active" : ""}`}
      onClick={onSelect}
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
    >
      <div className="market-head">
        <span className="ticker">{m.symbol}</span>
        <span className="muted market-name">{m.name}</span>
      </div>
      <div className="market-price num"><TickingNumber value={m.price} format={usd} /></div>
      <div className="market-meta">
        {m.gate === "fresh" ? (
          <span className="live" title={`Chainlink price updated ${Math.round((now - m.updatedAt) / 60)} min ago, inside this session`}>
            <span className="live-dot" /> fresh this session
          </span>
        ) : (
          <span className="frozen" title={QUEUE_REASON_TEXT[m.gate]}>
            <Moon size={12} /> {m.gate === "market-closed" ? "closed · price frozen" : "stale · not trusted"}
          </span>
        )}
        <span className="muted num">pool {pct(drift)}</span>
      </div>
      {active && <motion.span layoutId="market-glow" className="market-glow" />}
    </motion.button>
  );
}

function Ticket({ market, clock, now, action, minFeeWif }: { market: UiMarket; clock: MarketClock; now: number; action: (d: OrderDraft | null) => ReactNode; minFeeWif: number }) {
  const [kind, setKind] = useState<OrderKind>("stop");
  const [amount, setAmount] = useState(() => defaultAmount("stop", market.price));
  const [trigger, setTrigger] = useState("");
  const [slippageBps, setSlippage] = useState(100);
  const [expiryDays, setExpiry] = useState(7);
  const [fee, setFee] = useState(String(minFeeWif));
  useEffect(() => setFee(String(minFeeWif)), [minFeeWif]);

  // Sensible defaults whenever the market or side changes: 3% below the live price.
  useEffect(() => {
    setTrigger((market.price * 0.97).toFixed(2));
    setAmount(defaultAmount(kind, market.price));
  }, [market.symbol, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = Number(trigger);
  const a = Number(amount);
  const f = Number(fee);
  const valid = a > 0 && t > 0 && f >= minFeeWif;
  const draft: OrderDraft | null = valid ? { market, kind, amountIn: a, trigger: t, slippageBps, expiryDays, feeWif: f } : null;
  const distance = ((t - market.price) / market.price) * 100;
  const keep = 1 - slippageBps / 10_000;

  const sentence = useMemo(() => {
    if (!valid) return "Fill in an amount and a trigger price.";
    return kind === "stop"
      ? `If ${market.symbol} trades at or below ${usd(t)} during market hours, Lastbell sells your ${num(a)} ${market.symbol} for about ${usd(a * t)} USDG, never less than ${(slippageBps / 100).toFixed(1)}% under the live price.`
      : `If ${market.symbol} drops to ${usd(t)} or lower during market hours, Lastbell spends your ${usd(a)} USDG on about ${num(a / t)} ${market.symbol}, never paying more than ${usd(t)}.`;
  }, [valid, kind, market.symbol, t, a, slippageBps]);

  return (
    <motion.section layout className="ticket card card-pad" aria-label="New order">
      <div className="segmented" role="tablist">
        {(
          [
            ["stop", "Protect", "Stop-loss: sell if it falls"],
            ["limit", "Buy the dip", "Limit buy: buy if it drops"],
          ] as const
        ).map(([k, title, sub]) => (
          <button key={k} role="tab" aria-selected={kind === k} onClick={() => setKind(k)}>
            {kind === k && <motion.span layoutId="seg" className="seg-bg" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
            <strong>{title}</strong>
            <span>{sub}</span>
          </button>
        ))}
      </div>

      <div className="ticket-fields">
        <label className="field">
          <span className="label">{kind === "stop" ? "Sell" : "Spend"}</span>
          <span className="input">
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" />
            <span className="unit">{kind === "stop" ? market.symbol : "USDG"}</span>
          </span>
        </label>

        <label className="field">
          <span className="label">
            when {market.symbol} {kind === "stop" ? "falls" : "drops"} to
          </span>
          <span className="input">
            <span className="unit">$</span>
            <input inputMode="decimal" value={trigger} onChange={(e) => setTrigger(e.target.value)} aria-label="Trigger price" />
            <span className={`unit ${distance > 0 ? "warn-text" : ""}`}>{Number.isFinite(distance) ? pct(distance, 1) : ""}</span>
          </span>
          <span className="choices">
            {[-2, -5, -10].map((d) => (
              <button key={d} className="choice" aria-pressed={Math.abs(distance - d) < 0.05} onClick={() => setTrigger((market.price * (1 + d / 100)).toFixed(2))}>
                {d}%
              </button>
            ))}
          </span>
        </label>

        <div className="ticket-row">
          <div className="field">
            <span className="label">Max slippage</span>
            <span className="choices">
              {SLIPPAGE.map((s) => (
                <button key={s} className="choice" aria-pressed={slippageBps === s} onClick={() => setSlippage(s)}>
                  {(s / 100).toFixed(1)}%
                </button>
              ))}
            </span>
          </div>
          <div className="field">
            <span className="label">Expires</span>
            <span className="choices">
              {EXPIRY.map((d) => (
                <button key={d} className="choice" aria-pressed={expiryDays === d} onClick={() => setExpiry(d)}>
                  {d}d
                </button>
              ))}
            </span>
          </div>
        </div>

        <label className="field">
          <span className="label">Keeper fee, prepaid in $WIF</span>
          <span className="input">
            <input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} aria-label="Fee in WIF" />
            <span className="unit">WIF</span>
          </span>
          <FeeSplit fee={f} min={minFeeWif} />
        </label>
      </div>

      <AnimatePresence mode="popLayout">
        <motion.p key={sentence} className="sentence" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          {sentence}
        </motion.p>
      </AnimatePresence>

      <FireCheck market={market} clock={clock} now={now} trigger={valid ? t : null} />

      {!clock.open && (
        <div className="banner" data-tone="night">
          <Moon size={16} />
          <span className="grow">
            The US market is closed, so this order will be queued until it opens in {formatCountdown(clock.nextOpen - now)} ({localWhen(clock.nextOpen)}). It cannot fire on a frozen price, and you can cancel before then.
          </span>
        </div>
      )}
      {kind === "stop" && valid && distance >= 0 && (
        <div className="banner" data-tone="warn">
          <ArrowDown size={16} />
          <span className="grow">This trigger is at or above the live price, so it would fire as soon as the gate is fresh.</span>
        </div>
      )}

      <div className="ticket-action">{action(draft)}</div>
      <p className="fine muted">
        Min-out on chain: {kind === "stop" ? `${usd(a * t * keep)} USDG at the trigger` : `${num((a / t) || 0)} ${market.symbol} at your limit`}. Funds stay
        in your control: cancel any time.
      </p>
    </motion.section>
  );
}

function FeeSplit({ fee, min }: { fee: number; min: number }) {
  const ok = fee >= min;
  const half = ok ? fee / 2 : 0;
  return (
    <div className="fee-split" aria-label="Fee split">
      <div className="fee-bar">
        <motion.span className="fee-burn" animate={{ width: ok ? "50%" : "0%" }} />
        <motion.span className="fee-keeper" animate={{ width: ok ? "50%" : "0%" }} />
      </div>
      <div className="fee-legend">
        <span className="burn-text">
          <Flame size={13} /> {wif(half)} burned forever
        </span>
        <span>
          <Shield size={13} /> {wif(half)} to the keeper
        </span>
      </div>
      {!ok && <span className="error-text">Minimum fee is {min} WIF.</span>}
    </div>
  );
}

/** "Would it fire right now?": the gate, explained in four lines. */
function FireCheck({ market, clock, now, trigger }: { market: UiMarket; clock: MarketClock; now: number; trigger: number | null }) {
  const bandOk = (Math.abs(market.poolPrice - market.price) / market.price) * 10_000 <= BAND_BPS;
  const fresh = market.gate === "fresh";
  const reached = trigger !== null && market.price <= trigger;
  const rows: [boolean, string, string][] = [
    [clock.open, "US market session", clock.open ? "open" : `opens in ${formatCountdown(clock.nextOpen - now)}`],
    [fresh, "Fresh Chainlink price", fresh ? "updated this session" : QUEUE_REASON_TEXT[market.gate as Exclude<typeof market.gate, "fresh">]],
    [bandOk, "Pool agrees with oracle", `within ${(BAND_BPS / 100).toFixed(1)}%`],
    [reached, "Trigger reached", trigger ? `${usd(market.price)} vs ${usd(trigger)}` : "-"],
  ];
  const fires = rows.every((r) => r[0]);
  // The checks resolve one by one, so the gate reads as something being evaluated.
  const reduce = useReducedMotion();
  const sig = `${market.symbol}|${trigger}|${clock.open}|${fresh}`;
  const [done, setDone] = useState(rows.length);
  useEffect(() => {
    if (reduce) return setDone(rows.length);
    setDone(0);
    const id = setInterval(() => setDone((d) => (d >= rows.length ? d : d + 1)), 260);
    return () => clearInterval(id);
  }, [sig, reduce, rows.length]);
  const complete = done >= rows.length;
  return (
    <div className="firecheck">
      <div className="firecheck-head">
        <span className="label">Would it fire right now?</span>
        <span className={`firecheck-verdict ${complete ? (fires ? "yes" : "no") : "pending"}`}>{complete ? (fires ? "Yes" : "Not yet, it waits") : "Checking…"}</span>
      </div>
      <ul>
        {rows.map(([ok, title, detail], i) => (
          <motion.li key={title} layout="position" data-ok={i < done ? ok : "pending"}>
            <span className="tick">{i >= done ? <Spinner size={12} className="spin" /> : ok ? <Check size={13} /> : <Moon size={13} />}</span>
            <span>{title}</span>
            <span className="muted">{detail}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
