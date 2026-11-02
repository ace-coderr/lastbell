import { describe, expect, it } from "vitest";
import { formatCountdown } from "../src/lib/time.js";

describe("formatCountdown", () => {
  it("picks the two largest units", () => {
    expect(formatCountdown(2 * 86400 + 4 * 3600 + 59)).toBe("2d 4h");
    expect(formatCountdown(3 * 3600 + 12 * 60 + 5)).toBe("3h 12m");
    expect(formatCountdown(125)).toBe("2m 5s");
    expect(formatCountdown(45)).toBe("45s");
    expect(formatCountdown(-10)).toBe("0s");
  });
});
