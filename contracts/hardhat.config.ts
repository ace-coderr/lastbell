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
    hardhatMainnet: { type: "edr-simulated", chainType: "l1" },
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
