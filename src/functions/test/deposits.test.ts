import { describe, expect, it } from "vitest";
import type { LbcChain } from "../src/lib/chain.js";
import { Custody, LEGACY_DEPOSIT } from "../src/lib/custody.js";
import { scanDepositAddresses } from "../src/lib/deposits.js";
import { MAINNET } from "../src/lib/lbc/networks.js";

const MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

describe("deposit address scan", () => {
  const custody = new Custody(MNEMONIC, MAINNET);
  /** A chain where exactly `used` have history. */
  const chainWith = (...used: string[]) => ({ isUsed: async (a: string) => used.includes(a) }) as unknown as LbcChain;
  const at = (index: number | null) => custody.depositAddress(ALICE, index);

  it("hands out n = 0 to a new user", async () => {
    const { used, next } = await scanDepositAddresses(chainWith(), custody, ALICE);
    expect(used).toEqual([]);
    expect(next).toEqual({ index: 0, address: at(0), path: custody.depositPath(ALICE, 0) });
  });

  it("moves to a fresh address once the current one has a deposit", async () => {
    const { used, next } = await scanDepositAddresses(chainWith(at(0), at(1)), custody, ALICE);
    expect(used.map((u) => u.index)).toEqual([0, 1]);
    expect(next.address).toBe(at(2));
  });

  it("still finds deposits made to the legacy address, but never hands it out", async () => {
    const { used, next } = await scanDepositAddresses(chainWith(at(LEGACY_DEPOSIT)), custody, ALICE);
    expect(used.map((u) => u.index)).toEqual([LEGACY_DEPOSIT]);
    expect(next.address).toBe(at(0));
  });
});
