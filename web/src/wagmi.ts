import { createConfig, http } from "wagmi";
import { injected, mock } from "wagmi/connectors";
import { robinhoodChain } from "@lastbell/shared";
import { LOCAL, LOCAL_ACCOUNT, appChain, localChain } from "./config.js";

export const wagmiConfig = createConfig({
  chains: [appChain],
  // Local dev adds a test wallet backed by the Hardhat node's unlocked account.
  connectors: LOCAL ? [mock({ accounts: [LOCAL_ACCOUNT] }), injected()] : [injected()],
  transports: { [robinhoodChain.id]: http(), [localChain.id]: http() },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
