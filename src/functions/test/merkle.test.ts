import { describe, expect, it } from "vitest";
import { keccak256 } from "ethers";
import { buildLevels, buildReservesTree, hashPair, leafHash, verifyProof } from "../src/lib/merkle.js";

const entries = [
  { lbcAddress: "bU3qvW4ecNWnnjpZffgGZKBYWaUfGwYP3n", balance: 100000000n },
  { lbcAddress: "bUkrXpJQZFamrc8e2CBVPLhEdXA6QUNWQv", balance: 100000000n },
  { lbcAddress: "bCqJrLHdoiRqEZ1whFZ3WHNb33bP34SuGx", balance: 5n },
];

describe("reserves Merkle tree", () => {
  it("sorts leaves by address and is independent of input order", () => {
    const a = buildReservesTree(entries, 100);
    const b = buildReservesTree([...entries].reverse(), 100);
    expect(a.root).toBe(b.root);
    expect(a.leaves.map((l) => l.lbcAddress)).toEqual([
      "bCqJrLHdoiRqEZ1whFZ3WHNb33bP34SuGx",
      "bU3qvW4ecNWnnjpZffgGZKBYWaUfGwYP3n",
      "bUkrXpJQZFamrc8e2CBVPLhEdXA6QUNWQv",
    ]);
  });

  it("pairs an odd last node with itself", () => {
    const [h0, h1, h2] = buildReservesTree(entries, 100).leaves.map((l) => l.leaf) as [string, string, string];
    expect(buildLevels([h0, h1, h2]).at(-1)![0]).toBe(hashPair(hashPair(h0, h1), hashPair(h2, h2)));
  });

  it("gives every leaf a proof that verifies, and rejects a tampered balance", () => {
    const tree = buildReservesTree(entries, 100);
    for (const l of tree.leaves) expect(verifyProof(l.leaf, l.proof, tree.root)).toBe(true);
    const first = tree.leaves[0]!;
    expect(verifyProof(leafHash(first.lbcAddress, first.balance + 1n, 100), first.proof, tree.root)).toBe(false);
  });

  it("commits to the LBC height and handles one and zero leaves", () => {
    expect(buildReservesTree(entries, 100).root).not.toBe(buildReservesTree(entries, 101).root);
    const one = buildReservesTree([entries[0]!], 7);
    expect(one.root).toBe(one.leaves[0]!.leaf);
    expect(buildReservesTree([], 7).root).toBe(keccak256("0x"));
  });

  it("matches a fixed vector, so the browser implementation can be checked against it", () => {
    expect(leafHash("bU3qvW4ecNWnnjpZffgGZKBYWaUfGwYP3n", 100000000n, 2202471)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(buildReservesTree(entries, 2202471).root).toMatchInlineSnapshot(
      `"0xcd357624c9e02ed65a783ab5ba6047e2dfd961ce4a29a670454ef38556925163"`,
    );
  });
});
