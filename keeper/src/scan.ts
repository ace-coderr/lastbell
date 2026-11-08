/** Orders are read this many per call. */
export const PAGE = 200n;
/** Most pages one run reads. Keeps a run inside the Worker's subrequest budget however many orders exist. */
export const MAX_PAGES = 15;

export interface ScanPlan {
  /** Index of the first order of each page to read. */
  starts: bigint[];
  /** True when every order is covered this run. */
  complete: boolean;
}

/**
 * Which pages of orders to read this run.
 *
 * Creating orders is cheap, so the list can be grown on purpose. Up to MAX_PAGES * PAGE orders are read in full every run.
 * Beyond that a window of MAX_PAGES pages is read and it moves on by one window each run (`round` is the cron minute), so
 * every order is still visited, just not every minute. No state is stored: the round alone picks the window.
 */
export function scanPlan(count: bigint, round: number, maxPages = MAX_PAGES, page = PAGE): ScanPlan {
  if (count <= 0n) return { starts: [], complete: true };
  const totalPages = Number((count + page - 1n) / page);
  if (totalPages <= maxPages) return { starts: Array.from({ length: totalPages }, (_, i) => BigInt(i) * page), complete: true };
  const first = (Math.abs(Math.trunc(round)) * maxPages) % totalPages;
  return { starts: Array.from({ length: maxPages }, (_, i) => BigInt((first + i) % totalPages) * page), complete: false };
}
