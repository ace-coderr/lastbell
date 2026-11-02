import { readFile } from "node:fs/promises";

export const LOCAL_FILE = new URL("../../../web/.env.local", import.meta.url);
export const STATE_FILE = new URL("../../cache/local-deployment.json", import.meta.url);

export interface LocalDeployment {
  lastbell: `0x${string}`;
  router: `0x${string}`;
  markets: { symbol: string; token: `0x${string}`; feed: `0x${string}`; pool: `0x${string}`; stockIsToken0: boolean }[];
}

export async function loadDeployment(): Promise<LocalDeployment> {
  return JSON.parse(await readFile(STATE_FILE, "utf8"));
}

const Q192 = 1n << 192n;
function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) >> 1n;
  while (y < x) {
    x = y;
    y = (x + n / x) >> 1n;
  }
  return x;
}

/** sqrtPriceX96 for a stock(18)/quote(6) pool at `price8` quote per stock. */
export function sqrtPriceFor(price8: bigint, stockIsToken0: boolean): bigint {
  return stockIsToken0 ? isqrt((price8 * Q192) / 10n ** 20n) : isqrt((10n ** 20n * Q192) / price8);
}
