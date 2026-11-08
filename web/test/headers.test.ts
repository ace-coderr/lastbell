import { describe, expect, it } from "vitest";
import { CONTENT_SECURITY_POLICY, SECURITY_HEADERS, withSecurityHeaders } from "../server/headers.js";

describe("security headers", () => {
  it("forbids framing, plugins and foreign scripts", () => {
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("font-src 'self' data:"); // small bundled fonts are inlined by the build
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/script-src[^;]*unsafe/);
    expect(SECURITY_HEADERS["x-frame-options"]).toBe("DENY");
    expect(SECURITY_HEADERS["x-content-type-options"]).toBe("nosniff");
  });

  it("allows only the chain RPC and the keeper Worker to be called", () => {
    const connect = CONTENT_SECURITY_POLICY.split("; ").find((d) => d.startsWith("connect-src"))!;
    expect(connect).toContain("https://rpc.mainnet.chain.robinhood.com");
    expect(connect).toContain("https://*.workers.dev");
    expect(connect).not.toContain("*  ");
    expect(connect).not.toMatch(/ \*( |$)/);
  });

  it("adds the headers without dropping the ones already there", () => {
    const out = withSecurityHeaders(new Headers({ "content-type": "text/html", "cache-control": "no-store" }));
    expect(out.get("content-type")).toBe("text/html");
    expect(out.get("cache-control")).toBe("no-store");
    expect(out.get("content-security-policy")).toBe(CONTENT_SECURITY_POLICY);
  });
});
