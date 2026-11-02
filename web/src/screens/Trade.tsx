import { QUEUE_REASON_TEXT, type MarketClock } from "@lastbell/shared";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Flame, Moon, Shield, ArrowDown } from "../components/icons.js";
import { localWhen, num, pct, usd, wif } from "../lib/format.js";
import { formatCountdown } from "../lib/time.js";
import type { OrderKind, UiMarket } from "../model.js";

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
export const MIN_FEE_WIF = 50;

export function TradeScreen(props: {
  markets: UiMarket[];
  clock: MarketClock;
  now: number;
  action: (draft: OrderDraft | null) => ReactNode;
  badge?: ReactNode;
}) {
  const { markets, clock, now } = props;
  const [selected, setSelected] = useState(0);
  const market = markets[selected] ?? markets[0];

  return (
    <div className="trade">
      <section className="hero">
        <p className="label hero-label">
          Stock Token orders · Robinhood Chain {props.badge}
        </p>
        <h1 className="display hero-title">
          Stop-losses that <em>sleep</em> when the market sleeps.
        </h1>
        <p className="hero-sub">
          Stock Tokens trade all weekend but their prices freeze. Lastbell orders only fire on a fresh price that the pool agrees with.
          Otherwise they wait, and you can cancel any time.
        </p>
      </section>

      {markets.length === 0 && <p className="muted loading-note">Reading markets from chain…</p>}
      <div className="trade-grid">
        <div className="market-list" role="radiogroup" aria-label="Market">
          {markets.map((m, i) => (
            <MarketCard key={m.symbol} m={m} active={i === selected} onSelect={() => setSelected(i)} now={now} />
          ))}
        </div>
        {market && <Ticket market={market} clock={clock} now={now} action={props.action} />}
      </div>
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
      <div className="market-price num">{usd(m.price)}</div>
      <div className="market-meta">
        {m.gate === "fresh" ? (
          <span className="live">
            <span className="live-dot" /> live · {Math.round((now - m.updatedAt) / 60)} min old
          </span>
        ) : (
          <span className="frozen">
            <Moon size={12} /> frozen
          </span>
        )}
        <span className="muted num">pool {pct(drift)}</span>
      </div>
      {active && <motion.span layoutId="market-glow" className="market-glow" />}
    </motion.button>
  );
}

function Ticket({ market, clock, now, action }: { market: UiMarket; clock: MarketClock; now: number; action: (d: OrderDraft | null) => ReactNode }) {
  const [kind, setKind] = useState<OrderKind>("stop");
  const [amount, setAmount] = useState("2");
  const [trigger, setTrigger] = useState("");
  const [slippageBps, setSlippage] = useState(100);
  const [expiryDays, setExpiry] = useState(7);
  const [fee, setFee] = useState(String(MIN_FEE_WIF));

  // Sensible defaults whenever the market or side changes: 3% below the live price.
  useEffect(() => {
    setTrigger((market.price * 0.97).toFixed(2));
    setAmount(kind === "stop" ? "2" : "1000");
  }, [market.symbol, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = Number(trigger);
  const a = Number(amount);
  const f = Number(fee);
  const valid = a > 0 && t > 0 && f >= MIN_FEE_WIF;
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
          <FeeSplit fee={f} />
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
            Placing now is fine. It waits, and can't fire on a frozen weekend price. Earliest fill: {localWhen(clock.nextOpen)}.
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

function FeeSplit({ fee }: { fee: number }) {
  const ok = fee >= MIN_FEE_WIF;
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
      {!ok && <span className="error-text">Minimum fee is {MIN_FEE_WIF} WIF.</span>}
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
  return (
    <div className="firecheck">
      <div className="firecheck-head">
        <span className="label">Would it fire right now?</span>
        <span className={`firecheck-verdict ${fires ? "yes" : "no"}`}>{fires ? "Yes" : "Not yet, it waits"}</span>
      </div>
      <ul>
        {rows.map(([ok, title, detail], i) => (
          <motion.li key={title} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} data-ok={ok}>
            <span className="tick">{ok ? <Check size={13} /> : <Moon size={13} />}</span>
            <span>{title}</span>
            <span className="muted">{detail}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
