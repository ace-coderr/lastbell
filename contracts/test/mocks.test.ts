import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { parseUnits } from "viem";

const { viem } = await network.create();

describe("test doubles", () => {
  it("MockAggregator reports what it was given", async () => {
    const feed = await viem.deployContract("MockAggregator", [8, 20528000142n, 1_762_000_000n]);
    const [, answer, , updatedAt] = await feed.read.latestRoundData();
    assert.equal(answer, 20528000142n);
    assert.equal(updatedAt, 1_762_000_000n);
    assert.equal(await feed.read.decimals(), 8);
  });

  it("MockStockToken enforces issuer pause and blocklist", async () => {
    const [alice, bob] = await viem.getWalletClients();
    const stock = await viem.deployContract("MockStockToken", ["Mock NVDA", "NVDA"]);
    await stock.write.mint([alice.account.address, parseUnits("10", 18)]);

    await stock.write.setPaused([true]);
    await viem.assertions.revertWithCustomError(
      stock.write.transfer([bob.account.address, 1n], { account: alice.account }),
      stock,
      "IsPaused",
    );
    await stock.write.setPaused([false]);

    await stock.write.setBlocked([bob.account.address, true]);
    await viem.assertions.revertWithCustomError(
      stock.write.transfer([bob.account.address, 1n], { account: alice.account }),
      stock,
      "Blocked",
    );
  });

  it("MockBurnableToken burns from the caller", async () => {
    const [alice] = await viem.getWalletClients();
    const wif = await viem.deployContract("MockBurnableToken", ["World is Flat", "WIF", 18]);
    await wif.write.mint([alice.account.address, 1000n]);
    await wif.write.burn([400n]);
    assert.equal(await wif.read.totalSupply(), 600n);
  });
});
