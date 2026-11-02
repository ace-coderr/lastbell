import { RESTRICTED_REGIONS, type RegionStatus } from "@lastbell/shared/region";
import { LOCAL } from "./config.js";

export interface Region {
  status: RegionStatus;
  country: string;
  /** "the United States", etc. when known and restricted */
  place?: string;
}

/**
 * The Pages Function stamps <html data-region="…" data-country="…">. A production build that wasn't served
 * through it (no stamp) is treated as unknown, which keeps new orders off. Dev and the local test chain
 * default to allowed; `?region=US` in dev previews the blocked state.
 */
export function readRegion(root: HTMLElement = document.documentElement, search = window.location.search): Region {
  const dev = import.meta.env.DEV || LOCAL;
  const forced = dev ? new URLSearchParams(search).get("region")?.toUpperCase() : undefined;
  const country = forced ?? root.dataset.country ?? "";
  const stamped = root.dataset.region as RegionStatus | undefined;
  const status: RegionStatus = forced ? (forced in RESTRICTED_REGIONS ? "blocked" : "allowed") : stamped ?? (dev ? "allowed" : "unknown");
  return { status, country, place: RESTRICTED_REGIONS[country] };
}
