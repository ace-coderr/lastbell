import { marketClock } from "@lastbell/shared";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BellMark } from "./components/Bell.js";
import { MarketClock } from "./components/MarketClock.js";
import { demoFlywheel, demoMarkets, demoOrders } from "./demo.js";
import { demoClockOffset, useNow } from "./lib/useNow.js";
import type { UiOrder } from "./model.js";
import { FlywheelScreen } from "./screens/Flywheel.js";
import { OrdersScreen } from "./screens/Orders.js";
import { TradeScreen, type OrderDraft } from "./screens/Trade.js";

type Screen = "trade" | "orders" | "flywheel";
const SCREENS: [Screen, string][] = [
  ["trade", "Trade"],
  ["orders", "Orders"],
  ["flywheel", "Flywheel"],
];

const screenFromHash = (): Screen => {
  const h = window.location.hash.replace("#", "");
  return h === "orders" || h === "flywheel" ? h : "trade";
};

export function App() {
  const [clockOffset] = useState(() => demoClockOffset());
  const now = useNow(clockOffset);
  const clock = marketClock(now);
  const [screen, setScreen] = useState<Screen>(screenFromHash);
  const go = (s: Screen) => {
    window.location.hash = s;
    setScreen(s);
  };
  useEffect(() => {
    const onHash = () => setScreen(screenFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // The room dims after hours.
  useEffect(() => {
    document.documentElement.dataset.session = clock.open ? "open" : "closed";
  }, [clock.open]);

  // Demo data (the live chain source replaces this once a contract address is configured).
  const minute = Math.floor(now / 60);
  const markets = useMemo(() => demoMarkets(minute * 60), [minute]);
  const [orders, setOrders] = useState<UiOrder[]>(() => demoOrders(now));
  const stats = useMemo(() => demoFlywheel(minute * 60), [minute]);
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const place = (d: OrderDraft) => {
    const id = String(Math.max(0, ...orders.map((o) => Number(o.id))) + 1);
    setOrders((os) => [
      { id, market: d.market.symbol, kind: d.kind, amountIn: d.amountIn, trigger: d.trigger, slippageBps: d.slippageBps, expiry: now + d.expiryDays * 86400, feeWif: d.feeWif, status: "open" },
      ...os,
    ]);
    go("orders");
  };
  const cancel = (id: string) => {
    setPending((p) => ({ ...p, [id]: true }));
    setTimeout(() => {
      setOrders((os) => os.map((o) => (o.id === id ? { ...o, status: "cancelled" } : o)));
      setPending((p) => ({ ...p, [id]: false }));
    }, 900);
  };

  const ticketAction = (d: OrderDraft | null): ReactNode => (
    <button className="btn btn-primary btn-lg" disabled={!d} onClick={() => d && place(d)}>
      {d ? (d.kind === "stop" ? "Place stop-loss" : "Place limit buy") : "Complete the order"}
    </button>
  );

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="page">
        <header className="topbar">
          <a className="brand" href="#trade" onClick={() => go("trade")}>
            <BellMark ringing={clock.open} />
            lastbell
          </a>
          <nav className="nav" aria-label="Screens">
            {SCREENS.map(([key, label]) => (
              <button key={key} aria-current={screen === key ? "page" : undefined} onClick={() => go(key)}>
                {screen === key && <motion.span layoutId="nav-pill" className="nav-pill" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                {label}
              </button>
            ))}
          </nav>
          <div className="topbar-right">
            <MarketClock clock={clock} now={now} />
            <button className="btn btn-ghost">Connect wallet</button>
          </div>
        </header>

        <main id="main">
          <AnimatePresence mode="wait">
            <motion.div key={screen} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
              {screen === "trade" && <TradeScreen markets={markets} clock={clock} now={now} action={ticketAction} badge={<span className="demo-badge">demo data</span>} />}
              {screen === "orders" && (
                <OrdersScreen
                  orders={orders}
                  markets={markets}
                  clock={clock}
                  now={now}
                  errors={{}}
                  pending={pending}
                  onCancel={cancel}
                  empty={<p className="muted">No orders yet.</p>}
                />
              )}
              {screen === "flywheel" && <FlywheelScreen stats={stats} markets={markets} now={now} />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </>
  );
}
