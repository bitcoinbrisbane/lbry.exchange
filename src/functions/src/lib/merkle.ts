import { keccak256, concat, solidityPackedKeccak256 } from "ethers";

/**
 * Reserves Merkle tree, reproducible by anyone (the Verify page recomputes it
 * in the browser):
 *
 *   leaf   = keccak256(abi.encodePacked(string lbcAddress, uint64 balanceDewies, uint32 lbcHeight))
 *   leaves sorted by lbcAddress (byte order)
 *   parent = keccak256(left ‖ right); an odd node at the end of a level is paired with itself
 *   root of zero leaves = keccak256("") so an empty reserve set still has a defined root
 */
export interface ReserveLeaf {
  lbcAddress: string;
  balance: bigint;
}

export function leafHash(lbcAddress: string, balance: bigint, lbcHeight: number): string {
  return solidityPackedKeccak256(["string", "uint64", "uint32"], [lbcAddress, balance, lbcHeight]);
}

export function sortLeaves<T extends ReserveLeaf>(leaves: T[]): T[] {
  return [...leaves].sort((a, b) => (a.lbcAddress < b.lbcAddress ? -1 : a.lbcAddress > b.lbcAddress ? 1 : 0));
}

export function hashPair(left: string, right: string): string {
  return keccak256(concat([left, right]));
}

/** All levels, leaves first, root last. */
export function buildLevels(hashes: string[]): string[][] {
  if (hashes.length === 0) return [[keccak256("0x")]];
  const levels = [hashes];
  while (levels[levels.length - 1]!.length > 1) {
    const level = levels[levels.length - 1]!;
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(hashPair(level[i]!, level[i + 1] ?? level[i]!));
    levels.push(next);
  }
  return levels;
}

export interface ProofStep {
  sibling: string;
  /** Whether the sibling sits to the left of the running hash. */
  left: boolean;
}

export function proofFor(levels: string[][], index: number): ProofStep[] {
  const proof: ProofStep[] = [];
  let i = index;
  for (let d = 0; d < levels.length - 1; d++) {
    const level = levels[d]!;
    const isRight = i % 2 === 1;
    const sibling = isRight ? level[i - 1]! : (level[i + 1] ?? level[i]!);
    proof.push({ sibling, left: isRight });
    i = Math.floor(i / 2);
  }
  return proof;
}

export function verifyProof(leaf: string, proof: ProofStep[], root: string): boolean {
  let hash = leaf;
  for (const step of proof) hash = step.left ? hashPair(step.sibling, hash) : hashPair(hash, step.sibling);
  return hash === root;
}

export interface ReservesTree {
  root: string;
  leaves: (ReserveLeaf & { leaf: string; proof: ProofStep[] })[];
}

export function buildReservesTree(entries: ReserveLeaf[], lbcHeight: number): ReservesTree {
  const sorted = sortLeaves(entries);
  const hashes = sorted.map((e) => leafHash(e.lbcAddress, e.balance, lbcHeight));
  const levels = buildLevels(hashes);
  return {
    root: levels[levels.length - 1]![0]!,
    leaves: sorted.map((e, i) => ({ ...e, leaf: hashes[i]!, proof: proofFor(levels, i) })),
  };
}
