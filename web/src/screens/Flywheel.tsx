import { QUEUE_REASON_TEXT } from "@lastbell/shared";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { BondSlashArt, BurnFlywheelArt } from "../components/dots.js";
import { Flame, Moon, Shield } from "../components/icons.js";
import { TickingNumber } from "../components/Ticking.js";
import { SOURCE } from "../lib/sources.js";
import { ago, compact, num, shortAddress, usd, wif } from "../lib/format.js";
import type { FlywheelStats, UiMarket } from "../model.js";

/**
 * The flywheel, told in order: orders pay fees, fees split, half burns and half pays the keeper,
 * keepers are bonded, and a keeper that fails is slashed.
 */
export function FlywheelScreen({ stats, markets, now }: { stats: FlywheelStats; markets: UiMarket[]; now: number }) {
  const burned = stats.burnedFromFees + stats.slashedBurned;
  const fees = stats.burnedFromFees + stats.paidToKeepers;
  const burnShare = fees > 0 ? (stats.burnedFromFees / fees) * 100 : 50;

  return (
    <>
      <section className="section section-dark" data-band="none">
        <div className="wrap">
          <header className="screen-head fw-head">
            <p className="label">The $WIF flywheel</p>
            <h1 className="display screen-title">Every fill burns $WIF. Every keeper locks it.</h1>
            <p className="hero-sub">Follow one fee from the moment you place an order to the moment it is gone.</p>
          </header>

          <div className="bento bento-2 joined fw-tiles">
            <Tile label="WIF burned" icon={<Flame size={14} />}>
              <TickingNumber className="stat-value num burn-text" value={burned} format={(n) => Math.round(n).toLocaleString("en-US")} />
              <span className="muted stat-note">
                $WIF burned: {wif(stats.burnedFromFees)} from fees, {wif(stats.slashedBurned)} slashed
              </span>
              <span className="stat-src">{SOURCE.burned()}</span>
            </Tile>
            <Tile label="Orders filled">
              <TickingNumber className="stat-value num" value={stats.fills} format={(n) => num(Math.round(n))} />
              <span className="muted stat-note">orders filled, of {num(stats.orders)} placed</span>
              <span className="stat-src">{SOURCE.fills()}</span>
            </Tile>
            <Tile label="Paid to keepers">
              <TickingNumber className="stat-value num" value={stats.paidToKeepers} format={wif} />
              <span className="muted stat-note">$WIF paid to keepers, their half of each fee</span>
              <span className="stat-src">{SOURCE.paid()}</span>
            </Tile>
            <Tile label="Bonded by keepers" icon={<Shield size={14} />}>
              <TickingNumber className="stat-value num" value={stats.bonded} format={wif} />
              <span className="muted stat-note">$WIF locked by keepers; {wif(stats.prepaid)} of prepaid fees not yet earned</span>
              <span className="stat-src">{SOURCE.bondedAndHeld()}</span>
            </Tile>
          </div>
        </div>
      </section>

      <section className="section section-light" data-band="coral">
        <div className="wrap">
          <div className="section-head">
            <span className="label">01</span>
            <h2 className="display">Follow one fee</h2>
            <p className="muted">From your wallet to the burn address in four steps.</p>
          </div>
          <ol className="fw-flow">
            {FLOW.map(([n, title, body], i) => (
              <li key={n} className="cell cell-pad reveal">
                <span className="label">{n}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ol>

          <div className="fw-split" aria-label="Where fees have gone">
            <div className="fw-split-head">
              <span className="label">Where fees have gone, all time</span>
              <span className="num">{wif(fees)}</span>
            </div>
            <div className="fee-bar">
              <motion.span className="fee-burn" initial={{ width: 0 }} whileInView={{ width: `${burnShare}%` }} viewport={{ once: true }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
              <motion.span className="fee-keeper" initial={{ width: 0 }} whileInView={{ width: `${100 - burnShare}%` }} viewport={{ once: true }} transition={{ duration: 0.9, delay: 0.1, ease: [0.22, 1, 0.36, 1] }} />
            </div>
            <div className="fee-legend">
              <span className="burn-text">
                <Flame size={13} /> {wif(stats.burnedFromFees)} burned
              </span>
              <span>
                <Shield size={13} /> {wif(stats.paidToKeepers)} to keepers
              </span>
            </div>
            <span className="stat-src">{SOURCE.feeSplit()}</span>
          </div>
        </div>
      </section>

      <section className="section section-ink" data-band="lilac">
        <div className="wrap">
          <div className="section-head">
            <span className="label">02</span>
            <h2 className="display">Keepers and what happens when one fails</h2>
            <p className="muted">A keeper that does its job earns. A keeper that does not loses bond.</p>
          </div>

          <div className="bento bento-2 joined">
            <div className="cell cell-pad fw-keepers">
              <div className="fw-cell-head">
                <span className="label">Keeper status</span>
                {stats.lastRun && (
                  <span className="chip" data-state={stats.lastRun.ok ? "filled" : "error"}>
                    cron {stats.lastRun.ok ? "ok" : "error"} · {ago(Math.floor(Date.parse(stats.lastRun.at) / 1000), now)}
                  </span>
                )}
              </div>
              {stats.keepers.length === 0 ? (
                <p className="muted">No keeper has bonded yet. Orders wait until one does, and you can cancel any time.</p>
              ) : (
                <div className="table-wrap">
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
                </div>
              )}
              <span className="stat-src">{SOURCE.keepers()}. Cron status: the keeper's public /status page, latest run.</span>
              {stats.lastRun && <p className="fine muted">Last run: {stats.lastRun.summary}</p>}
            </div>

            <div className="cell cell-pad fw-fail">
              <div className="bento-art">
                <BondSlashArt />
              </div>
              <span className="label">If a keeper fails</span>
              <ul>
                <li>
                  <b>It claims and goes silent.</b> After the claim window, anyone can clear the claim and part of the bond is slashed and burned.
                </li>
                <li>
                  <b>The price was never fresh.</b> Nothing is slashed. The gate stops the fill and the order simply waits.
                </li>
                <li>
                  <b>Every keeper disappears.</b> Your order never fires, and you cancel for a full refund of funds and fee.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-light" data-band="mint">
        <div className="wrap">
          <div className="section-head">
            <span className="label">03</span>
            <h2 className="display">Execution gate, per market</h2>
            <p className="muted">The checks a keeper must pass before it can fill, right now.</p>
          </div>
          <div className="fw-gates">
            <div className="cell cell-pad">
              <span className="stat-src stat-src-top">{SOURCE.gates()}</span>
              <ul className="gates">
                {markets.map((m) => (
                  <li key={m.symbol}>
                    <span className="ticker small">{m.symbol}</span>
                    <TickingNumber className="num" value={m.price} format={usd} />
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
            </div>
            <div className="cell cell-pad fw-art">
              <BurnFlywheelArt />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

const FLOW: [string, string, string][] = [
  ["01", "You prepay a fee", "When you place an order you prepay the keeper fee in $WIF. It sits in the contract, not with anyone."],
  ["02", "A keeper fills it", "A bonded keeper claims the order and fills it once the price is fresh and the pool agrees."],
  ["03", "Half is burned", "Half of the fee is destroyed for good, which shrinks the $WIF supply with every fill."],
  ["04", "Half pays the keeper", "The other half goes to the keeper, which funds the next bond and the next fill."],
];

function Tile({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="cell cell-pad stat-tile">
      <span className="label">
        {icon} {label}
      </span>
      {children}
    </div>
  );
}
