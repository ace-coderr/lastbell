import { network } from "hardhat";
import { getAddress, parseUnits, type Address } from "viem";

export const conn = await network.create();
export const { viem, networkHelpers } = conn;

export const Kind = { StopLoss: 0, LimitBuy: 1 } as const;
export const Status = { None: 0, Open: 1, Filled: 2, Cancelled: 3 } as const;
export const Gate = {
  Fresh: 0,
  MarketClosed: 1,
  OraclePaused: 2,
  TokenPaused: 3,
  BadAnswer: 4,
  NotUpdatedSinceOpen: 5,
  OlderThanHeartbeat: 6,
  PoolOutOfBand: 7,
} as const;

export const t = (iso: string) => BigInt(Date.parse(iso) / 1000);
/** Feed units: 8 decimals. */
export const usd = (v: string) => parseUnits(v, 8);
export const WIF = (v: string) => parseUnits(v, 18);
export const USDG = (v: string) => parseUnits(v, 6);
export const STOCK = (v: string) => parseUnits(v, 18);

export const PARAMS = {
  minFee: WIF("50"),
  minBond: WIF("100000"),
  slashAmount: WIF("10000"),
  claimWindow: 120,
  graceSeconds: 900,
  maxSlippageBps: 300,
};

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
  // stock token0: quoteRaw/stockRaw = price8 / 1e20; quote token0: stockRaw/quoteRaw = 1e20 / price8
  return stockIsToken0 ? isqrt((price8 * Q192) / 10n ** 20n) : isqrt((10n ** 20n * Q192) / price8);
}

/** A Wednesday afternoon in New York, mid-session. */
export const WEDNESDAY = t("2026-11-04T15:00:00Z");
/** Saturday: markets closed. */
export const SATURDAY = t("2026-11-07T15:00:00Z");

export async function deployFixture() {
  const [deployer, alice, bob, keeper, keeper2] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  const wif = await viem.deployContract("MockBurnableToken", ["World is Flat", "WIF", 18]);
  const usdg = await viem.deployContract("MockBurnableToken", ["Global Dollar", "USDG", 6]);

  // Deploy stocks until we have one on each side of USDG, so both pool orientations are covered
  // (on mainnet SPY is token0 while NVDA and AAPL sit behind USDG).
  let low, high;
  for (let i = 0; i < 64 && !(low && high); i++) {
    const s = await viem.deployContract("MockStockToken", [`Stock ${i}`, `S${i}`]);
    if (BigInt(s.address) < BigInt(usdg.address)) low ??= s;
    else high ??= s;
  }
  if (!low || !high) throw new Error("could not get both pool orientations");
  const spy = low; // stock is token0
  const nvda = high; // USDG is token0

  const spyPrice = usd("758.37790204");
  const nvdaPrice = usd("205.28");
  const spyFeed = await viem.deployContract("MockAggregator", [8, spyPrice, WEDNESDAY - 600n]);
  const nvdaFeed = await viem.deployContract("MockAggregator", [8, nvdaPrice, WEDNESDAY - 600n]);
  const spyPool = await viem.deployContract("MockUniswapV3Pool", [spy.address, usdg.address, 500, sqrtPriceFor(spyPrice, true)]);
  const nvdaPool = await viem.deployContract("MockUniswapV3Pool", [nvda.address, usdg.address, 500, sqrtPriceFor(nvdaPrice, false)]);
  const router = await viem.deployContract("MockSwapRouter");
  await router.write.register([spyPool.address]);
  await router.write.register([nvdaPool.address]);

  const lastbell = await viem.deployContract("Lastbell", [
    {
      wif: wif.address,
      quote: usdg.address,
      router: router.address,
      minFee: PARAMS.minFee,
      minBond: PARAMS.minBond,
      slashAmount: PARAMS.slashAmount,
      claimWindow: PARAMS.claimWindow,
      graceSeconds: PARAMS.graceSeconds,
      maxSlippageBps: PARAMS.maxSlippageBps,
    },
    [
      { token: spy.address, feed: spyFeed.address, pool: spyPool.address, heartbeat: 86400, maxDeviationBps: 150 },
      { token: nvda.address, feed: nvdaFeed.address, pool: nvdaPool.address, heartbeat: 86400, maxDeviationBps: 150 },
    ],
  ]);

  // Balances and approvals for users and keepers.
  for (const w of [alice, bob, keeper, keeper2]) {
    await wif.write.mint([w.account.address, WIF("1000000")]);
    await usdg.write.mint([w.account.address, USDG("100000")]);
    await spy.write.mint([w.account.address, STOCK("100")]);
    await nvda.write.mint([w.account.address, STOCK("100")]);
    const max = 2n ** 256n - 1n;
    await wif.write.approve([lastbell.address, max], { account: w.account });
    await usdg.write.approve([lastbell.address, max], { account: w.account });
    await spy.write.approve([lastbell.address, max], { account: w.account });
    await nvda.write.approve([lastbell.address, max], { account: w.account });
  }

  await networkHelpers.time.increaseTo(WEDNESDAY);

  return {
    deployer, alice, bob, keeper, keeper2, publicClient,
    wif, usdg, spy, nvda, spyFeed, nvdaFeed, spyPool, nvdaPool, router, lastbell,
    spyPrice, nvdaPrice,
  };
}

export type Fixture = Awaited<ReturnType<typeof deployFixture>>;

export async function now(f: Fixture): Promise<bigint> {
  return (await f.publicClient.getBlock()).timestamp;
}

/** Push a fresh feed round at `price8` for market 0 (SPY) or 1 (NVDA); the pool follows unless `poolPrice8` is given. */
export async function setPrice(f: Fixture, market: 0 | 1, price8: bigint, opts: { updatedAt?: bigint; poolPrice8?: bigint } = {}) {
  const feed = market === 0 ? f.spyFeed : f.nvdaFeed;
  const pool = market === 0 ? f.spyPool : f.nvdaPool;
  await feed.write.set([price8, opts.updatedAt ?? (await now(f))]);
  await pool.write.setSqrtPriceX96([sqrtPriceFor(opts.poolPrice8 ?? price8, market === 0)]);
}

type Wallet = Fixture["alice"];

export interface PlaceOpts {
  account?: Wallet;
  market?: number;
  kind?: number;
  amountIn?: bigint;
  trigger?: bigint;
  slippageBps?: number;
  expiry?: bigint;
  fee?: bigint;
}

/** Places an order with sensible defaults (SPY stop-loss, 1 share, trigger 740) and returns its id. */
export async function place(f: Fixture, o: PlaceOpts = {}): Promise<bigint> {
  const id = await f.lastbell.read.orderCount();
  const kind = o.kind ?? Kind.StopLoss;
  await f.lastbell.write.placeOrder(
    [
      o.market ?? 0,
      kind,
      o.amountIn ?? (kind === Kind.StopLoss ? STOCK("1") : USDG("500")),
      o.trigger ?? usd("740"),
      o.slippageBps ?? 100,
      o.expiry ?? (await now(f)) + 86400n * 7n,
      o.fee ?? PARAMS.minFee,
    ],
    { account: (o.account ?? f.alice).account },
  );
  return id;
}

export async function bondKeeper(f: Fixture, keeper: Wallet = f.keeper, amount = PARAMS.minBond) {
  await f.lastbell.write.bond([amount], { account: keeper.account });
}

export const addr = (a: Address) => getAddress(a);
