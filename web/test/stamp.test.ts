import { describe, expect, it } from "vitest";
import { stampRegion } from "../server/stamp.js";

const HTML = `<!doctype html>\n<html lang="en">\n  <head></head><body><div id="root"></div></body>\n</html>`;

describe("stampRegion", () => {
  it("marks a restricted country as blocked", () => {
    expect(stampRegion(HTML, "US")).toContain(`<html lang="en" data-country="US" data-region="blocked">`);
    expect(stampRegion(HTML, "gb")).toContain(`data-country="GB" data-region="blocked"`);
  });

  it("marks other countries as allowed", () => {
    expect(stampRegion(HTML, "DE")).toContain(`<html lang="en" data-country="DE" data-region="allowed">`);
  });

  it("marks missing, unknown and Tor as unknown", () => {
    expect(stampRegion(HTML, undefined)).toContain(`data-country="" data-region="unknown"`);
    expect(stampRegion(HTML, "XX")).toContain(`data-region="unknown"`);
    expect(stampRegion(HTML, "T1")).toContain(`data-country="T1" data-region="unknown"`);
  });

  it("never writes anything but a two-character code into the markup", () => {
    const out = stampRegion(HTML, `"><script>alert(1)</script>`);
    expect(out).not.toContain("<script>alert");
    expect(out).toContain(`data-country="" data-region="unknown"`);
  });

  it("only touches the <html> tag", () => {
    expect(stampRegion(HTML, "DE").replace(` data-country="DE" data-region="allowed"`, "")).toBe(HTML);
  });
});
