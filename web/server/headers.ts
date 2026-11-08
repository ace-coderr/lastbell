import { OFFICIAL_RPC_URL } from "@lastbell/shared";

/**
 * Security headers for every response. The page signs real transactions, so it must not be framed (clickjacking a
 * "Place order" button) and must not load code from anywhere but itself.
 *
 * connect-src lists the only hosts the app talks to: the chain RPC and the keeper Worker. Wallets are injected into
 * the page and need no network permission.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  // React and motion set inline style attributes; scripts stay locked to 'self'.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  `connect-src 'self' ${new URL(OFFICIAL_RPC_URL).origin} https://*.workers.dev`,
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

export const SECURITY_HEADERS: Record<string, string> = {
  "content-security-policy": CONTENT_SECURITY_POLICY,
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "cross-origin-opener-policy": "same-origin",
};

export function withSecurityHeaders(headers: Headers): Headers {
  const out = new Headers(headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.set(k, v);
  return out;
}
