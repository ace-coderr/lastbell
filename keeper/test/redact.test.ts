import { describe, expect, it } from "vitest";
import { redact } from "../src/redact.js";

const KEY = "ab".repeat(32);
const RPC = "https://rpc-provider.example/v2/SUPERSECRETAPIKEY123";

describe("redact", () => {
  it("hides the RPC URL, its key and any URL path", () => {
    const text = `HTTP request failed. URL: ${RPC} Details: boom (see https://other.example/a/b?token=abc123456)`;
    const out = redact(text, [RPC]);
    expect(out).not.toContain("SUPERSECRETAPIKEY123");
    expect(out).not.toContain("token=abc123456");
    expect(out).not.toContain("rpc-provider.example/v2");
    expect(out).toContain("[redacted]");
    expect(out).toContain("https://other.example/…");
  });

  it("hides a private key in every form it can be quoted", () => {
    for (const form of [KEY, `0x${KEY}`, `0X${KEY}`.replace("0X", "0x")]) {
      const out = redact(`bad key ${form} here`, [`0x${KEY}`]);
      expect(out).not.toContain(KEY);
    }
    expect(redact(`raw ${KEY}`, [KEY])).not.toContain(KEY);
  });

  it("hides a URL's path pieces when only part of it is quoted", () => {
    expect(redact("path /v2/SUPERSECRETAPIKEY123 only", [RPC])).not.toContain("SUPERSECRETAPIKEY123");
  });

  it("leaves ordinary text, transaction hashes and empty secrets alone", () => {
    const hash = `0x${"cd".repeat(32)}`;
    const text = `fill ${hash} reverted: GateClosed`;
    expect(redact(text, [undefined, "", "abc"])).toBe(text);
  });
});
