import type { LbcChain } from "./chain.js";
import { LEGACY_DEPOSIT, type Custody, type DepositIndex } from "./custody.js";
import type { Utxo } from "./lbc/tx/builder.js";

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

export interface DepositCoins {
  /** Confirmed coins on every used deposit address, at least `minConfirmations` deep. */
  utxos: Utxo[];
  /** Which user and index each address belongs to, for signing. */
  owners: Map<string, { ethAddress: string; index: DepositIndex }>;
}

/** The deposit coins a payout may spend, across every recipient the Bridge has minted to. */
export async function spendableDeposits(
  chain: LbcChain,
  custody: Custody,
  recipients: string[],
  minConfirmations: number,
): Promise<DepositCoins> {
  const tip = await chain.tipHeight();
  const owners: DepositCoins["owners"] = new Map();
  const scans = await Promise.all(recipients.map((eth) => scanDepositAddresses(chain, custody, eth)));
  scans.forEach((scan, i) => {
    for (const slot of scan.used) owners.set(slot.address, { ethAddress: recipients[i]!, index: slot.index });
  });
  const perAddress = await Promise.all([...owners.keys()].map((address) => chain.getUtxos(address)));
  const utxos = perAddress.flat().filter((u) => u.height > 0 && tip - u.height + 1 >= minConfirmations);
  return { utxos, owners };
}
