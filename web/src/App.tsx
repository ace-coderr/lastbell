import { marketClock } from "@lastbell/shared";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLastbellActions } from "./chain/actions.js";
import { useLiveFlywheel, useLiveMarkets, useLiveOrders, useMinFee } from "./chain/live.js";
import { Navbar, type Screen } from "./components/Navbar.js";
import { RegionGate } from "./components/RegionGate.js";
import { NetworkBanner, WalletButton, useConnectWallet, useWalletState } from "./components/Wallet.js";
import { Alert, Spinner } from "./components/icons.js";
import { DEMO, LOCAL } from "./config.js";
import { demoFlywheel, demoMarkets, demoOrders } from "./demo.js";
import { demoClockOffset, useNow } from "./lib/useNow.js";
import { readRegion } from "./region.js";
import type { UiOrder } from "./model.js";
import { FlywheelScreen } from "./screens/Flywheel.js";
import { OrdersScreen } from "./screens/Orders.js";
import { TradeScreen, type OrderDraft } from "./screens/Trade.js";

const screenFromHash = (): Screen => {
  const h = window.location.hash.replace("#", "");
  return h === "orders" || h === "flywheel" ? h : "trade";
};

export function App() {
  const [clockOffset] = useState(() => (DEMO ? demoClockOffset() : 0));
  const [region] = useState(readRegion);
  const canOrder = region.status === "allowed";
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

  // ---------------------------------------------------------------- data: live chain or demo
  const wallet = useWalletState();
  const live = useLiveMarkets();
  const liveOrders = useLiveOrders(wallet.address, live.markets, live.chain);
  const liveStats = useLiveFlywheel();
  const contractMinFee = useMinFee();
  const actions = useLastbellActions(live.chain);
  const { connect, connecting, error: connectError } = useConnectWallet();

  const minute = Math.floor(now / 60);
  const demoMarketList = useMemo(() => demoMarkets(minute * 60), [minute]);
  const demoStats = useMemo(() => demoFlywheel(minute * 60), [minute]);
  const [demoOrderList, setDemoOrders] = useState<UiOrder[]>(() => demoOrders(now));
  const [demoPending, setDemoPending] = useState<Record<string, boolean>>({});

  const markets = DEMO ? demoMarketList : live.markets;
  const orders = DEMO ? demoOrderList : liveOrders.orders;
  const stats = DEMO ? demoStats : liveStats;

  const place = async (d: OrderDraft) => {
    if (DEMO) {
      const id = String(Math.max(0, ...demoOrderList.map((o) => Number(o.id))) + 1);
      const o: UiOrder = { id, market: d.market.symbol, kind: d.kind, amountIn: d.amountIn, trigger: d.trigger, slippageBps: d.slippageBps, expiry: now + d.expiryDays * 86400, feeWif: d.feeWif, status: "open" };
      setDemoOrders((os) => [o, ...os]);
      return go("orders");
    }
    const id = await actions.place(d, now);
    if (id !== undefined) {
      await liveOrders.refetch();
      go("orders");
    }
  };

  const cancel = async (id: string) => {
    if (DEMO) {
      setDemoPending((p) => ({ ...p, [id]: true }));
      setTimeout(() => {
        setDemoOrders((os) => os.map((o) => (o.id === id ? { ...o, status: "cancelled" } : o)));
        setDemoPending((p) => ({ ...p, [id]: false }));
      }, 900);
      return;
    }
    if (await actions.cancel(id)) await liveOrders.refetch();
  };

  // ---------------------------------------------------------------- the ticket's main button, by wallet state
  const ticketAction = (d: OrderDraft | null): ReactNode => {
    const label = d ? (d.kind === "stop" ? "Place stop-loss" : "Place limit buy") : "Complete the order";
    if (!canOrder) {
      return (
        <button className="btn btn-primary btn-lg" disabled>
          {region.status === "blocked" ? "Not available in your region" : "Region not confirmed"}
        </button>
      );
    }
    if (DEMO) {
      return (
        <button className="btn btn-primary btn-lg" disabled={!d} onClick={() => d && place(d)}>
          {label} (demo)
        </button>
      );
    }
    if (!wallet.isConnected) {
      return (
        <div className="action-stack">
          <button className="btn btn-primary btn-lg" onClick={connect} disabled={connecting}>
            {connecting ? "Connecting…" : "Connect wallet to place"}
          </button>
          {connectError && <Notice text={connectError} />}
        </div>
      );
    }
    if (wallet.wrongNetwork) {
      return (
        <button className="btn btn-primary btn-lg" disabled>
          Switch network first
        </button>
      );
    }
    if (actions.progress) {
      const p = actions.progress;
      return (
        <div className="action-stack">
          <button className="btn btn-primary btn-lg" disabled>
            <Spinner size={14} className="spin" /> {p.label}… confirm in your wallet
          </button>
          <span className="steps">
            Step {p.index} of {p.total}
          </span>
        </div>
      );
    }
    return (
      <div className="action-stack">
        <button className="btn btn-primary btn-lg" disabled={!d || !actions.ready} onClick={() => d && place(d)}>
          {label}
        </button>
        {actions.error && <Notice text={actions.error} />}
      </div>
    );
  };

  const ordersEmpty =
    !DEMO && !wallet.isConnected ? (
      <div className="empty card card-pad">
        <p className="muted">Connect your wallet to see your orders.</p>
        <button className="btn btn-primary" onClick={connect}>
          Connect wallet
        </button>
      </div>
    ) : (
      <div className="empty card card-pad">
        <p className="muted">{liveOrders.loading ? "Loading your orders…" : "No orders yet. Place one on the Trade screen."}</p>
      </div>
    );

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Navbar screen={screen} go={go} clock={clock} now={now} wallet={(o) => (DEMO ? null : <WalletButton block={o.block} />)} />
      <div className="notice-strip">
        <div className="wrap stack">
          <RegionGate region={region} />
          {!DEMO && <NetworkBanner />}
        </div>
      </div>

      <main id="main" className="section section-dark" data-band="none">
        <div className="wrap">
          <AnimatePresence mode="wait">
            <motion.div key={screen} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
              {screen === "trade" && (
                <TradeScreen
                  markets={markets}
                  clock={clock}
                  now={now}
                  action={ticketAction}
                  minFeeWif={DEMO ? undefined : (contractMinFee ?? 50)}
                  badge={DEMO ? <span className="demo-badge">demo data</span> : LOCAL ? <span className="demo-badge">local test chain</span> : null}
                />
              )}
              {screen === "orders" && (
                <OrdersScreen
                  orders={orders}
                  markets={markets}
                  clock={clock}
                  now={now}
                  errors={DEMO ? {} : actions.orderErrors}
                  pending={DEMO ? demoPending : actions.pending}
                  onCancel={cancel}
                  empty={ordersEmpty}
                />
              )}
              {screen === "flywheel" &&
                (stats ? (
                  <FlywheelScreen stats={stats} markets={markets} now={now} />
                ) : (
                  <p className="muted loading-note">Reading the flywheel from chain…</p>
                ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <div className="banner" data-tone="error" role="alert">
      <Alert size={16} />
      <span className="grow">{text}</span>
    </div>
  );
}
