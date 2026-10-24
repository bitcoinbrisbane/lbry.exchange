import { describe, expect, it } from "vitest";
import { Custody } from "../src/lib/custody.js";
import { addressToScript } from "../src/lib/lbc/address.js";
import { DUST_THRESHOLD, MAINNET } from "../src/lib/lbc/networks.js";
import { signTransaction, type Utxo } from "../src/lib/lbc/tx/builder.js";
import { unwrapMarkerScript } from "../src/lib/marker.js";
import { PayoutFundsError, planPayout } from "../src/lib/payout.js";

const MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const PAYEE = "bCxrJ2PonHnfDTPK4mpM46YWmgXubh831T";
const LBC = 100_000_000n;

const custody = new Custody(MNEMONIC, MAINNET);
const treasury = custody.treasuryAddress();
const deposit = custody.depositAddress(ALICE, 0);
let n = 0;
const coin = (address: string, value: bigint, height = 100): Utxo => ({
  txid: (++n).toString(16).padStart(64, "0"),
  vout: 0,
  value,
  script: addressToScript(address, MAINNET),
  address,
  height,
});
const request = (depositUtxos: Utxo[], treasuryUtxos: Utxo[], amount = LBC) => ({
  depositUtxos,
  treasuryUtxos,
  payee: { script: addressToScript(PAYEE, MAINNET), value: amount },
  markerScript: unwrapMarkerScript({ burnTxid: "0x" + "cd".repeat(32), unwrapId: 0n }),
  treasuryScript: addressToScript(treasury, MAINNET),
  feePerByte: 50,
});
const paidTo = (plan: ReturnType<typeof planPayout>, address: string) =>
  plan.unsigned.tx.outputs
    .filter((o) => Buffer.from(o.script).equals(Buffer.from(addressToScript(address, MAINNET))))
    .reduce((sum, o) => sum + o.value, 0n);

describe("unwrap payouts", () => {
  it("pays the full amount from a deposit and only the fee from the treasury", () => {
    const plan = planPayout(request([coin(deposit, LBC)], [coin(treasury, LBC)]));
    expect(paidTo(plan, PAYEE)).toBe(LBC);
    expect(plan.depositInputs).toHaveLength(1);
    expect(plan.treasuryInputs).toHaveLength(1);
    expect(plan.depositChange).toBe(0n);
    // Everything the treasury put in comes back except the fee.
    expect(LBC - paidTo(plan, treasury)).toBe(plan.unsigned.fee);
    expect(plan.unsigned.fee).toBeGreaterThan(0n);
  });

  it("returns deposit change to the deposit address, so deposits fall by exactly the payout", () => {
    const plan = planPayout(request([coin(deposit, 3n * LBC)], [coin(treasury, LBC)]));
    expect(paidTo(plan, deposit)).toBe(2n * LBC);
    expect(plan.depositChange).toBe(2n * LBC);
    expect(LBC - paidTo(plan, treasury)).toBe(plan.unsigned.fee);
  });

  it("combines deposit coins when no single one covers the amount", () => {
    const plan = planPayout(request([coin(deposit, LBC / 2n), coin(deposit, LBC / 2n)], [coin(treasury, LBC)]));
    expect(plan.depositInputs).toHaveLength(2);
    expect(paidTo(plan, PAYEE)).toBe(LBC);
  });

  it("always spends a treasury coin, so findPayout sees the marker in the treasury's history", () => {
    expect(() => planPayout(request([coin(deposit, 2n * LBC)], []))).toThrow(PayoutFundsError);
  });

  it("names which side is short", () => {
    const short = (fn: () => unknown) => {
      try {
        fn();
      } catch (err) {
        return (err as PayoutFundsError).source;
      }
    };
    expect(short(() => planPayout(request([coin(deposit, LBC / 2n)], [coin(treasury, LBC)])))).toBe("deposits");
    expect(short(() => planPayout(request([coin(deposit, LBC)], [coin(treasury, DUST_THRESHOLD)])))).toBe("treasury");
  });

  it("signs deposit and treasury inputs with their own keys", () => {
    const plan = planPayout(request([coin(deposit, LBC)], [coin(treasury, LBC)]));
    const signed = signTransaction(plan.unsigned, (u) =>
      u.address === treasury ? custody.treasuryPrivateKey() : custody.depositPrivateKey(ALICE, 0),
    );
    expect(signed.inputs.every((i) => i.scriptSig.length > 0)).toBe(true);
  });
});
