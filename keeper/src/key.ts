import { privateKeyToAccount } from "viem/accounts";

/** Accepts a key with or without the 0x prefix and with stray whitespace or a trailing newline (as pasted into a prompt). */
export function normalizeKey(raw: string): `0x${string}` {
  const k = raw.trim();
  return (k.startsWith("0x") || k.startsWith("0X") ? `0x${k.slice(2)}` : `0x${k}`) as `0x${string}`;
}

export type KeeperKey = { account: ReturnType<typeof privateKeyToAccount> } | { problem: string } | null;

/** null = not set; { problem } = set but unusable (never includes any part of the key). */
export function readKeeperKey(raw: string | undefined): KeeperKey {
  if (!raw || !raw.trim()) return null;
  const key = normalizeKey(raw);
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) return { problem: "KEEPER_PRIVATE_KEY is set but is not a 32-byte hex private key" };
  try {
    return { account: privateKeyToAccount(key) };
  } catch {
    return { problem: "KEEPER_PRIVATE_KEY is set but is not a valid private key" };
  }
}
