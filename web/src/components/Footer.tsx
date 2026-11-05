import { BellMark } from "./Bell.js";
import { External } from "./icons.js";
import { CONTRACT_ADDRESS, DISCLAIMER, EXPLORER_CONTRACT_URL, KEEPER_STATUS_URL, REPO_URL } from "../links.js";
import { shortAddress } from "../lib/format.js";

export function Footer() {
  const links: [string, string, string][] = [
    ["01", "Contract", EXPLORER_CONTRACT_URL],
    ["02", "GitHub", REPO_URL],
    ["03", "Keeper status", KEEPER_STATUS_URL],
    ["04", "Docs", `${REPO_URL}#readme`],
  ];
  return (
    <footer className="section section-dark footer" data-band="split">
      <div className="wrap">
        <div className="footer-grid">
          <div className="footer-brand">
            <span className="brand-static">
              <BellMark ringing={false} size={26} />
              lastbell
            </span>
            <p className="muted">Stop-losses for Stock Tokens that only fire on a fresh price. Non-custodial, keeper-executed, $WIF-bonded.</p>
            <p className="label">
              Contract <a href={EXPLORER_CONTRACT_URL} target="_blank" rel="noreferrer" className="num">{shortAddress(CONTRACT_ADDRESS)}</a>
            </p>
          </div>
          <nav aria-label="Footer" className="footer-links">
            {links.map(([n, label, href]) => (
              <a key={label} href={href} target="_blank" rel="noreferrer" className="footer-link">
                <span className="n">{n}</span>
                {label}
                <External size={13} />
              </a>
            ))}
          </nav>
        </div>
        <div className="footer-legal">
          <p>{DISCLAIMER}</p>
          <p className="muted">Stock Tokens may not be offered in some regions. Self-audited, not financial advice. Use small amounts.</p>
        </div>
      </div>
    </footer>
  );
}
