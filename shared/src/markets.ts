import type { Address } from "viem";

// Every address below was verified on chain during the feasibility spike (docs/FEASIBILITY.md).
// Feed proxies come from Chainlink's reference data directory for robinhood-mainnet,
// token addresses from the official Token Contracts page, pools from Uniswap's factory events.

export const WIF = {
  address: "0x5173b8ea6923c2d40267890d45c46a3480954773" as Address,
  symbol: "WIF",
  decimals: 18,
} as const;

export const USDG = {
  address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as Address,
  symbol: "USDG",
  decimals: 6,
} as const;

export const UNISWAP_V3 = {
  factory: "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA" as Address,
  swapRouter02: "0xCaf681a66D020601342297493863E78C959E5cb2" as Address,
  quoterV2: "0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7" as Address,
} as const;

export type MarketSymbol = "SPY" | "NVDA" | "AAPL";

export interface Market {
  symbol: MarketSymbol;
  name: string;
  token: Address;
  tokenDecimals: 18;
  feed: Address;
  feedDecimals: 8;
  heartbeatSeconds: number;
  pool: Address; // Uniswap v3 Stock/USDG pool
  poolFee: number; // in hundredths of a bip
}

export const MARKETS: Record<MarketSymbol, Market> = {
  SPY: {
    symbol: "SPY",
    name: "S&P 500 ETF",
    token: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C",
    tokenDecimals: 18,
    feed: "0x319724394D3A0e3669269846abE664Cd621f9f6A",
    feedDecimals: 8,
    heartbeatSeconds: 86400,
    pool: "0xa7Bb1AC63BBaB0C44316E6c8C455213441689167",
    poolFee: 500,
  },
  NVDA: {
    symbol: "NVDA",
    name: "NVIDIA",
    token: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
    tokenDecimals: 18,
    feed: "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15",
    feedDecimals: 8,
    heartbeatSeconds: 86400,
    pool: "0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3",
    poolFee: 500,
  },
  AAPL: {
    symbol: "AAPL",
    name: "Apple",
    token: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9",
    tokenDecimals: 18,
    feed: "0x6B22A786bAa607d76728168703a39Ea9C99f2cD0",
    feedDecimals: 8,
    heartbeatSeconds: 86400,
    pool: "0xAae0d815EE56e4092a5E5C2911E676Fea50B2d6D",
    poolFee: 500,
  },
};

export const MARKET_LIST: Market[] = Object.values(MARKETS);
