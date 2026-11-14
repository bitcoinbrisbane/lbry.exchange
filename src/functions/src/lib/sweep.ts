import { decodeAddress, scriptToAddress } from "./lbc/address.js";
import type { NetworkParams } from "./lbc/networks.js";
import { Transaction } from "./lbc/tx/transaction.js";
import { HttpError } from "./http.js";

/**
 * Sweeping is signed in the browser: the person's seed, wallet file or key never
 * reaches the functions. The functions only look up coins by address and relay
 * the finished transaction, and the relay accepts nothing but a sweep into the
 * sender's own deposit addresses, so it is no general-purpose broadcast service.
 */

/** Addresses one lookup may ask about. A gap-limit scan of both chains of one account fits. */
export const MAX_SWEEP_ADDRESSES = 60;
/** A transaction of MAX_INPUTS inputs is about 90 KB; hex doubles that. */
const MAX_SWEEP_HEX = 200_000;

/** "addr,addr,…" → distinct, valid pay-to-pubkey-hash addresses. */
export function parseSweepAddresses(raw: string, network: NetworkParams): string[] {
  const list = [...new Set(raw.split(",").map((a) => a.trim()).filter(Boolean))];
  if (list.length === 0) throw new HttpError(400, "address is required");
  if (list.length > MAX_SWEEP_ADDRESSES) throw new HttpError(400, `At most ${MAX_SWEEP_ADDRESSES} addresses per request`);
  for (const address of list) {
    let type: string;
    try {
      type = decodeAddress(address, network).type;
    } catch (err) {
      throw new HttpError(400, `${address}: ${err instanceof Error ? err.message : "invalid address"}`);
    }
    if (type !== "p2pkh") throw new HttpError(400, `${address} is not a pay-to-pubkey-hash address`);
  }
  return list;
}

/**
 * Parses a signed sweep and checks it pays one output, to one of `allowed` (the
 * sender's deposit addresses). Throws a 400 otherwise.
 */
export function parseSweepTransaction(hex: string, allowed: ReadonlySet<string>, network: NetworkParams): Transaction {
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(hex) || hex.length > MAX_SWEEP_HEX) throw new HttpError(400, "hex is malformed");
  let tx: Transaction;
  try {
    tx = Transaction.fromHex(hex);
  } catch {
    throw new HttpError(400, "hex is not a transaction");
  }
  if (tx.inputs.length === 0) throw new HttpError(400, "Transaction has no inputs");
  if (tx.outputs.length !== 1) throw new HttpError(400, "A sweep pays exactly one output");
  const paid = scriptToAddress(tx.outputs[0]!.script, network);
  if (paid === null || !allowed.has(paid)) throw new HttpError(400, "A sweep must pay your bridge deposit address");
  return tx;
}
