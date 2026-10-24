import { DUST_THRESHOLD } from "./lbc/networks.js";
import {
  assembleTransaction,
  estimateSize,
  feeFor,
  MAX_INPUTS,
  type Recipient,
  type UnsignedPayment,
  type Utxo,
} from "./lbc/tx/builder.js";

/**
 * How an unwrap payout is funded. The LBC paid out comes from deposit
 * addresses, the coins that back wLBC, so reserves and supply fall together and
 * stay 1:1. The treasury only pays the network fee:
 *
 *   inputs    deposit coins (≥ amount)        treasury coins (≥ fee)
 *   outputs   payee: amount
 *             OP_RETURN marker
 *             deposit change → the first deposit input's own address
 *             treasury change → the treasury
 *
 * Every payout spends at least one treasury coin. findPayout looks for the
 * marker in the treasury's history, so a payout the treasury took no part in
 * would be invisible to it and could be paid again.
 *
 * Deposit change below the dust limit cannot be an output; it goes to the fee,
 * which leaves reserves short of supply by under DUST_THRESHOLD dewies.
 */
export interface PayoutRequest {
  /** Spendable deposit coins: confirmed, from addresses reserves counts. */
  depositUtxos: Utxo[];
  treasuryUtxos: Utxo[];
  payee: Recipient;
  markerScript: Uint8Array;
  treasuryScript: Uint8Array;
  feePerByte: number;
}

export interface PayoutPlan {
  unsigned: UnsignedPayment;
  depositInputs: Utxo[];
  treasuryInputs: Utxo[];
  /** Returned to a deposit address; 0 when there is none. */
  depositChange: bigint;
}

export class PayoutFundsError extends Error {
  constructor(
    readonly source: "deposits" | "treasury",
    readonly needed: bigint,
    readonly available: bigint,
  ) {
    super(`${source} hold ${available} dewies, ${needed} needed`);
    this.name = "PayoutFundsError";
  }
}

const descending = (list: Utxo[]) => [...list].sort((a, b) => (a.value < b.value ? 1 : a.value > b.value ? -1 : 0));
const total = (list: Utxo[]) => list.reduce((sum, u) => sum + u.value, 0n);

/** The smallest single coin that covers `amount`, else the largest coins until they do. */
function pickDeposits(utxos: Utxo[], amount: bigint): Utxo[] {
  const single = descending(utxos.filter((u) => u.value >= amount)).pop();
  if (single) return [single];
  const picked: Utxo[] = [];
  let sum = 0n;
  for (const u of descending(utxos)) {
    if (picked.length >= MAX_INPUTS - 1) break;
    picked.push(u);
    sum += u.value;
    if (sum >= amount) return picked;
  }
  throw new PayoutFundsError("deposits", amount, total(utxos));
}

export function planPayout(request: PayoutRequest): PayoutPlan {
  const { payee, feePerByte, treasuryScript } = request;
  const depositInputs = pickDeposits(request.depositUtxos, payee.value);
  const spare = total(depositInputs) - payee.value;
  const depositChange = spare >= DUST_THRESHOLD ? spare : 0n;
  const outputs: Recipient[] = [payee, { script: request.markerScript, value: 0n }];
  if (depositChange > 0n) outputs.push({ script: depositInputs[0]!.script, value: depositChange });
  const dustToFee = spare - depositChange;
  const scripts = outputs.map((o) => o.script);

  // Confirmed treasury coins first, largest first; the treasury's own unconfirmed change is fine after that.
  const candidates = [
    ...descending(request.treasuryUtxos.filter((u) => u.height > 0)),
    ...descending(request.treasuryUtxos.filter((u) => u.height <= 0)),
  ];
  const treasuryInputs: Utxo[] = [];
  let treasuryIn = 0n;
  for (const u of candidates) {
    if (depositInputs.length + treasuryInputs.length >= MAX_INPUTS) break;
    treasuryInputs.push(u);
    treasuryIn += u.value;
    const inputCount = depositInputs.length + treasuryInputs.length;
    const inputs = [...depositInputs, ...treasuryInputs];
    const change = treasuryIn + dustToFee - feeFor(estimateSize(inputCount, [...scripts, treasuryScript]), feePerByte);
    if (change >= DUST_THRESHOLD) {
      const unsigned = assembleTransaction(inputs, outputs, { script: treasuryScript, value: change });
      return { unsigned, depositInputs, treasuryInputs, depositChange };
    }
    // Change too small to keep: drop it and let the remainder go to the fee.
    if (treasuryIn + dustToFee >= feeFor(estimateSize(inputCount, scripts), feePerByte)) {
      return { unsigned: assembleTransaction(inputs, outputs), depositInputs, treasuryInputs, depositChange };
    }
  }
  const needed = feeFor(estimateSize(depositInputs.length + 1, [...scripts, treasuryScript]), feePerByte) - dustToFee;
  throw new PayoutFundsError("treasury", needed > 0n ? needed : 1n, total(request.treasuryUtxos));
}
