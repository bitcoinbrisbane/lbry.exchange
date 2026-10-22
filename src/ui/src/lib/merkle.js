import { concat, keccak256, solidityPackedKeccak256 } from "ethers";

// Same construction as src/functions/src/lib/merkle.ts, reimplemented here so the
// browser can recompute the reserves root without trusting the server's.
export const leafHash = (lbcAddress, balance, lbcHeight) =>
  solidityPackedKeccak256(["string", "uint64", "uint32"], [lbcAddress, BigInt(balance), lbcHeight]);

export function computeRoot(entries, lbcHeight) {
  const sorted = [...entries].sort((a, b) => (a.lbcAddress < b.lbcAddress ? -1 : a.lbcAddress > b.lbcAddress ? 1 : 0));
  let level = sorted.map((e) => leafHash(e.lbcAddress, e.balance, lbcHeight));
  if (level.length === 0) return keccak256("0x");
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(keccak256(concat([level[i], level[i + 1] ?? level[i]])));
    level = next;
  }
  return level[0];
}
