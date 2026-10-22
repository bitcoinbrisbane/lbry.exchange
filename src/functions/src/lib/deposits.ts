import type { LbcChain } from "./chain.js";
import { LEGACY_DEPOSIT, type Custody, type DepositIndex } from "./custody.js";

export interface DepositSlot {
  index: DepositIndex;
  address: string;
  path: string;
}

export interface DepositAddresses {
  /** Every address of the user's that has history: the legacy one if used, then n = 0, 1, … */
  used: DepositSlot[];
  /** The first unused n: the address to hand out for the next deposit. */
  next: DepositSlot;
}

/**
 * A user's deposit addresses as the chain sees them. Addresses are handed out
 * in order and a new one only once the previous one has history, so walking n
 * up to the first unused address finds every deposit without a database.
 */
export async function scanDepositAddresses(
  chain: LbcChain,
  custody: Custody,
  ethAddress: string,
): Promise<DepositAddresses> {
  const slot = (index: DepositIndex): DepositSlot => ({
    index,
    address: custody.depositAddress(ethAddress, index),
    path: custody.depositPath(ethAddress, index),
  });
  const used: DepositSlot[] = [];
  const legacy = slot(LEGACY_DEPOSIT);
  if (await chain.isUsed(legacy.address)) used.push(legacy);
  for (let n = 0; ; n++) {
    const candidate = slot(n);
    if (!(await chain.isUsed(candidate.address))) return { used, next: candidate };
    used.push(candidate);
  }
}
