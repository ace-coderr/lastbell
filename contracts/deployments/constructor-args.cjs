// Constructor arguments of the mainnet deployment, for `hardhat verify`.
// Must match contracts/scripts/mainnet/config.ts at deploy time.
module.exports = [
  {
    wif: "0x5173b8ea6923c2d40267890d45c46a3480954773",
    quote: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
    router: "0xCaf681a66D020601342297493863E78C959E5cb2",
    minFee: 20n * 10n ** 18n,
    minBond: 1000n * 10n ** 18n,
    slashAmount: 100n * 10n ** 18n,
    claimWindow: 120,
    graceSeconds: 900,
    maxSlippageBps: 300,
  },
  [
    { token: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C", feed: "0x319724394D3A0e3669269846abE664Cd621f9f6A", pool: "0xa7Bb1AC63BBaB0C44316E6c8C455213441689167", heartbeat: 86400, maxDeviationBps: 150 },
    { token: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", feed: "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15", pool: "0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3", heartbeat: 86400, maxDeviationBps: 150 },
    { token: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9", feed: "0x6B22A786bAa607d76728168703a39Ea9C99f2cD0", pool: "0xAae0d815EE56e4092a5E5C2911E676Fea50B2d6D", heartbeat: 86400, maxDeviationBps: 150 },
  ],
];
