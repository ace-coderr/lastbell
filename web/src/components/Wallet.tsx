import { motion } from "motion/react";
import { useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { friendlyError } from "../chain/errors.js";
import { appChain } from "../config.js";
import { shortAddress } from "../lib/format.js";
import { Alert } from "./icons.js";

export function useWalletState() {
  const { address, isConnected, chainId } = useAccount();
  return { address, isConnected, wrongNetwork: isConnected && chainId !== appChain.id, chainId };
}

export function useConnectWallet() {
  const { connectors, connectAsync, isPending } = useConnect();
  const [error, setError] = useState<string | null>(null);
  async function connect() {
    setError(null);
    const hasInjected = typeof window !== "undefined" && "ethereum" in window;
    const connector = connectors.find((c) => c.type === "mock") ?? (hasInjected ? connectors.find((c) => c.type === "injected") : undefined);
    if (!connector) {
      setError("No browser wallet found. Install MetaMask or Rabby, then reload.");
      return;
    }
    try {
      await connectAsync({ connector });
    } catch (err) {
      setError(friendlyError(err));
    }
  }
  return { connect, connecting: isPending, error };
}

export function WalletButton({ block }: { block?: boolean }) {
  const { address, isConnected, wrongNetwork } = useWalletState();
  const { connect, connecting, error } = useConnectWallet();
  const { disconnect } = useDisconnect();
  if (!isConnected) {
    return (
      <span className="wallet">
        <button className={`btn btn-primary ${block ? "btn-lg" : ""}`} onClick={connect} disabled={connecting}>
          {connecting ? "Connecting…" : "Connect wallet"}
        </button>
        {error && (
          <span className="wallet-error" role="alert">
            {error}
          </span>
        )}
      </span>
    );
  }
  return (
    <button className={`btn btn-ghost wallet-pill ${block ? "btn-lg" : ""} ${wrongNetwork ? "is-wrong" : ""}`} onClick={() => disconnect()} title="Disconnect">
      <span className="wallet-dot" />
      <span className="num">{shortAddress(address!)}</span>
    </button>
  );
}

/** Shown whenever the wallet is on any chain other than Robinhood Chain. */
export function NetworkBanner() {
  const { wrongNetwork } = useWalletState();
  const { switchChainAsync, isPending } = useSwitchChain();
  const [error, setError] = useState<string | null>(null);
  if (!wrongNetwork) return null;
  return (
    <motion.div className="banner network-banner" data-tone="error" role="alert" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
      <Alert size={16} />
      <span className="grow">
        Your wallet is on another network. Lastbell runs on <strong>{appChain.name}</strong>.{error && <> {error}</>}
      </span>
      <button
        className="btn btn-primary"
        disabled={isPending}
        onClick={async () => {
          setError(null);
          try {
            await switchChainAsync({ chainId: appChain.id });
          } catch (err) {
            setError(friendlyError(err));
          }
        }}
      >
        {isPending ? "Switching…" : `Switch to ${appChain.name}`}
      </button>
    </motion.div>
  );
}
