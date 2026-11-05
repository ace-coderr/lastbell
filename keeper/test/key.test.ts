import { describe, expect, it } from "vitest";
import { normalizeKey, readKeeperKey } from "../src/key.js";

// Hardhat's well-known first test key: public, funds nothing.
const KEY = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

describe("readKeeperKey", () => {
  it("accepts the key with or without 0x, and with whitespace or a trailing newline", () => {
    for (const raw of [KEY, `0x${KEY}`, `  ${KEY}\n`, `0X${KEY}`]) {
      const r = readKeeperKey(raw);
      expect(r && "account" in r && r.account.address).toBe(ADDRESS);
    }
  });

  it("reports not set as null", () => {
    expect(readKeeperKey(undefined)).toBeNull();
    expect(readKeeperKey("")).toBeNull();
    expect(readKeeperKey("   \n")).toBeNull();
  });

  it("reports a malformed key without echoing any of it", () => {
    for (const raw of ["not-a-key", KEY.slice(0, 60), `${KEY}00`, "0x1234"]) {
      const r = readKeeperKey(raw);
      expect(r && "problem" in r).toBe(true);
      expect(JSON.stringify(r)).not.toContain(raw.trim().slice(0, 8) === "not-a-ke" ? "XXXX" : raw.trim().slice(0, 8));
    }
  });

  it("normalizes the prefix", () => {
    expect(normalizeKey(KEY)).toBe(`0x${KEY}`);
    expect(normalizeKey(`0x${KEY}`)).toBe(`0x${KEY}`);
  });
});
