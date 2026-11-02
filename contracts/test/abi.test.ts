import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { lastbellAbi } from "../../shared/src/abi/lastbell.js";

describe("shared ABI", () => {
  it("matches the compiled contract (run `npm run export-abi -w contracts` if this fails)", async () => {
    const artifact = JSON.parse(
      await readFile(new URL("../artifacts/contracts/Lastbell.sol/Lastbell.json", import.meta.url), "utf8"),
    );
    assert.deepEqual(lastbellAbi, artifact.abi);
  });
});
