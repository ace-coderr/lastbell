import { EXPLORER_URL, QUEUE_REASON_TEXT, type MarketClock } from "@lastbell/shared";
import { AnimatePresence, motion } from "motion/react";
import { StateChip, type ChipState } from "../components/StateChip.js";
import { External, Flame, Moon } from "../components/icons.js";
import { localWhen, num, usd, wif } from "../lib/format.js";
import { formatCountdown } from "../lib/time.js";
import { stateOf, type UiMarket, type UiOrder } from "../model.js";

const STEPS = ["Placed", "Watching", "Triggered", "Filled"];

function stepOf(s: ChipState): number {
  switch (s.kind) {
    case "armed":
    case "queued":
      return 1;
    case "executing":
      return 2;
    case "filled":
      return 3;
    default:
      return 0;
  }
}

export function OrdersScreen(props: {
  orders: UiOrder[];
  markets: UiMarket[];
  clock: MarketClock;
  now: number;
  errors: Record<string, string>;
  pending: Record<string, boolean>;
  onCancel: (id: string) => void;
  empty: React.ReactNode;
}) {
  const { orders, markets, now } = props;
  const withState = orders.map((o) => {
    const m = markets.find((x) => x.symbol === o.market);
    const err = props.errors[o.id];
    const state: ChipState = err ? { kind: "error", message: err } : stateOf(o, m, now);
    return { o, m, state };
  });
  const counts = withState.reduce<Record<string, number>>((acc, { state }) => ((acc[state.kind] = (acc[state.kind] ?? 0) + 1), acc), {});

  return (
    <div className="orders">
      <header className="screen-head fw-head">
        <div>
          <p className="label">Your orders</p>
          <h1 className="display screen-title">What each order is doing, right now.</h1>
        </div>
        <div className="counts">
          {(["armed", "queued", "executing", "filled", "expired"] as const).map((k) =>
            counts[k] ? (
              <span key={k} className="chip" data-state={k}>
                {counts[k]} {k}
              </span>
            ) : null,
          )}
        </div>
      </header>

      {orders.length === 0 ? (
        props.empty
      ) : (
        <motion.ul layout className="order-list">
          <AnimatePresence initial={false}>
            {withState.map(({ o, m, state }) => (
              <OrderCard key={o.id} o={o} m={m} state={state} clock={props.clock} now={now} pending={!!props.pending[o.id]} onCancel={() => props.onCancel(o.id)} />
            ))}
          </AnimatePresence>
        </motion.ul>
      )}
    </div>
  );
}

function OrderCard({ o, m, state, clock, now, pending, onCancel }: { o: UiOrder; m?: UiMarket; state: ChipState; clock: MarketClock; now: number; pending: boolean; onCancel: () => void }) {
  const step = stepOf(state);
  const asleep = state.kind === "queued";
  const ended = state.kind === "expired" || state.kind === "cancelled";
  const canCancel = o.status === "open";
  const title =
    o.kind === "stop"
      ? `Sell ${num(o.amountIn)} ${o.market} if it falls to ${usd(o.trigger)}`
      : `Buy ${o.market} with ${usd(o.amountIn)} if it drops to ${usd(o.trigger)}`;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
      className={`order cell cell-pad ${asleep ? "is-asleep" : ""} ${ended ? "is-ended" : ""}`}
      data-state={state.kind}
    >
      <div className="order-top">
        <div className="order-ident">
          <span className="ticker small">{o.market}</span>
          <span className="label">{o.kind === "stop" ? "Stop-loss" : "Limit buy"} · #{o.id}</span>
        </div>
        <StateChip state={state} />
      </div>

      <h3 className="order-title">{title}</h3>

      <div className={`rail ${asleep ? "asleep" : ""} ${ended ? "ended" : ""}`} aria-hidden>
        {STEPS.map((label, i) => (
          <div key={label} className={`rail-step ${i <= step && !ended ? "done" : ""} ${i === step && !ended ? "current" : ""}`}>
            <span className="rail-dot">{i === step && state.kind === "executing" && <motion.span className="rail-pulse" animate={{ scale: [1, 2.2], opacity: [0.6, 0] }} transition={{ duration: 1.4, repeat: Infinity }} />}</span>
            <span className="rail-label">{label}</span>
          </div>
        ))}
        <motion.span className="rail-fill" initial={false} animate={{ width: ended ? "0%" : `${step * 25}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
      </div>

      <div className="order-detail">
        <Detail state={state} o={o} m={m} clock={clock} now={now} />
        <div className="order-actions">
          {canCancel && state.kind !== "expired" && (
            <button className="btn btn-danger" onClick={onCancel} disabled={pending}>
              {pending ? "Cancelling…" : "Cancel"}
            </button>
          )}
          {canCancel && state.kind === "expired" && (
            <button className="btn btn-ghost" onClick={onCancel} disabled={pending}>
              {pending ? "Refunding…" : "Refund now"}
            </button>
          )}
          {o.fillTx && (
            <a className="btn btn-ghost" href={`${EXPLORER_URL}/tx/${o.fillTx}`} target="_blank" rel="noreferrer">
              Fill tx <External size={13} />
            </a>
          )}
        </div>
      </div>
    </motion.li>
  );
}

function Detail({ state, o, m, clock, now }: { state: ChipState; o: UiOrder; m?: UiMarket; clock: MarketClock; now: number }) {
  switch (state.kind) {
    case "queued":
      return (
        <p className="order-note night-text">
          <Moon size={14} /> {state.reason === "market-closed" ? `Asleep until the market opens: ${localWhen(clock.nextOpen)} (in ${formatCountdown(clock.nextOpen - now)}).` : QUEUE_REASON_TEXT[state.reason]}
          {m && m.price <= o.trigger && <strong> Trigger already crossed, so it fills at the open.</strong>}
        </p>
      );
    case "armed":
      return (
        <p className="order-note">
          Watching: {o.market} is {usd(m?.price ?? 0)}, {m ? Math.abs(((m.price - o.trigger) / m.price) * 100).toFixed(1) : "-"}% above your trigger. Expires in {formatCountdown(o.expiry - now)}.
        </p>
      );
    case "executing":
      return <p className="order-note brass-text">Trigger hit on a fresh price. A bonded keeper is filling it through the pool.</p>;
    case "filled":
      return (
        <p className="order-note filled-text">
          {o.kind === "stop" ? `Sold for ${usd(o.amountOut ?? 0)} USDG.` : `Bought ${num(o.amountOut ?? 0)} ${o.market}.`}{" "}
          <span className="burn-text">
            <Flame size={13} /> {wif(o.feeWif / 2)} burned
          </span>
        </p>
      );
    case "expired":
      return <p className="order-note muted">Expired without triggering. Your funds and fee are refundable now.</p>;
    case "cancelled":
      return <p className="order-note muted">Cancelled. Funds returned; the fee is back in your prepaid balance.</p>;
    case "error":
      return <p className="order-note error-text">{state.message}</p>;
  }
}
