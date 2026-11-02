// Stock Tokens may not be offered in these places (Robinhood Stock Token disclaimers and the RHJ
// prospectus restrictions). Order creation is disabled there; viewing, cancelling and refunds stay open
// so nobody is ever locked out of their own funds.

export const RESTRICTED_REGIONS: Record<string, string> = {
  US: "the United States",
  CA: "Canada",
  GB: "the United Kingdom",
  CH: "Switzerland",
  CU: "Cuba",
  BY: "Belarus",
  IR: "Iran",
  KP: "North Korea",
  RU: "Russia",
  SY: "Syria",
  UA: "Ukraine",
  SS: "South Sudan",
  SD: "Sudan",
  MM: "Myanmar",
  VE: "Venezuela",
};

export type RegionStatus = "allowed" | "blocked" | "unknown";

/**
 * Decision for an ISO 3166-1 alpha-2 code from Cloudflare's `request.cf.country`.
 * Cloudflare reports "XX" when it can't tell and "T1" for Tor; both are "unknown", which the app treats
 * as closed for new orders.
 */
export function regionStatus(country: string | null | undefined): RegionStatus {
  const c = country?.trim().toUpperCase();
  if (!c || c === "XX" || c === "T1" || !/^[A-Z]{2}$/.test(c)) return "unknown";
  return c in RESTRICTED_REGIONS ? "blocked" : "allowed";
}
