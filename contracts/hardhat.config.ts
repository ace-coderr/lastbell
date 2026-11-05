import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxViem],
  solidity: {
    version: "0.8.30",
    settings: {
      evmVersion: "cancun",
      optimizer: { enabled: true, runs: 500 },
    },
  },
  networks: {
    // The default network (what `hardhat test` and `network.create()` use): a fixed start date, so fixtures that
    // jump to calendar dates never depend on the real clock.
    default: { type: "edr-simulated", chainType: "l1", initialDate: "2026-11-01T00:00:00Z" },
    hardhatMainnet: { type: "edr-simulated", chainType: "l1", initialDate: "2026-11-01T00:00:00Z" },
    // `hardhat node` for the local click-through: starts at the real current time.
    hardhatLocal: { type: "edr-simulated", chainType: "l1" },
    // `npx hardhat node`, for the local click-through test (scripts/local).
    localhost: { type: "http", chainType: "l1", url: "http://127.0.0.1:8545" },
    // Read-only (no account): used for `hardhat verify` so verification never needs a key.
    robinhoodReadonly: { type: "http", chainType: "generic", chainId: 4663, url: "https://rpc.mainnet.chain.robinhood.com" },
    robinhood: {
      type: "http",
      chainType: "generic",
      chainId: 4663,
      url: configVariable("ROBINHOOD_RPC_URL"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
  },
  chainDescriptors: {
    4663: {
      name: "Robinhood Chain",
      blockExplorers: {
        blockscout: {
          name: "Blockscout",
          url: "https://robinhoodchain.blockscout.com",
          apiUrl: "https://robinhoodchain.blockscout.com/api",
        },
      },
    },
  },
  verify: {
    blockscout: { enabled: true },
    etherscan: { enabled: false },
  },
});
