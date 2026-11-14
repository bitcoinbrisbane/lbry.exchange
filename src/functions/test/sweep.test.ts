import { describe, expect, it } from "vitest";
import { HttpError } from "../src/lib/http.js";
import { addressToScript } from "../src/lib/lbc/address.js";
import { MAINNET } from "../src/lib/lbc/networks.js";
import { assembleTransaction, signTransaction, type Utxo } from "../src/lib/lbc/tx/builder.js";
import { derivePrivateKey, deriveAccountKey } from "../src/lib/lbc/keys/hd.js";
import { addressFromPublicKey } from "../src/lib/lbc/address.js";
import { publicKeyOf } from "../src/lib/lbc/tx/sign.js";
import { MAX_SWEEP_ADDRESSES, parseSweepAddresses, parseSweepTransaction } from "../src/lib/sweep.js";

const PHRASE = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const account = deriveAccountKey(PHRASE, "lbry", MAINNET);
const key = derivePrivateKey(account, 0, 0);
const source = addressFromPublicKey(publicKeyOf(key), MAINNET);
const DEPOSIT = "bCxrJ2PonHnfDTPK4mpM46YWmgXubh831T";
const OTHER = "bU3qvW4ecNWnnjpZffgGZKBYWaUfGwYP3n";

const sweepHex = (to: string, outputs = 1) => {
  const coin: Utxo = {
    txid: "11".repeat(32),
    vout: 0,
    value: 5_000_000n,
    script: addressToScript(source, MAINNET),
    address: source,
    height: 10,
  };
  const out = Array.from({ length: outputs }, () => ({ script: addressToScript(to, MAINNET), value: 1_000_000n }));
  return signTransaction(assembleTransaction([coin], out), () => key.slice()).toHex();
};

const message = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError);
    return (err as Error).message;
  }
  throw new Error("did not throw");
};

describe("sweep address lookups", () => {
  it("accepts valid addresses and drops duplicates", () => {
    expect(parseSweepAddresses(`${DEPOSIT}, ${OTHER},${DEPOSIT}`, MAINNET)).toEqual([DEPOSIT, OTHER]);
  });
  it("rejects an invalid, a script-hash or an excessive list", () => {
    expect(message(() => parseSweepAddresses("nope", MAINNET))).toContain("nope");
    expect(message(() => parseSweepAddresses("", MAINNET))).toContain("required");
    const many = Array.from({ length: MAX_SWEEP_ADDRESSES + 1 }, (_, i) => `${DEPOSIT}${i}`).join(",");
    expect(message(() => parseSweepAddresses(many, MAINNET))).toContain("At most");
  });
});

describe("sweep relay", () => {
  it("accepts one output to a deposit address", () => {
    const tx = parseSweepTransaction(sweepHex(DEPOSIT), new Set([DEPOSIT]), MAINNET);
    expect(tx.outputs).toHaveLength(1);
  });
  it("refuses a payment anywhere else", () => {
    expect(message(() => parseSweepTransaction(sweepHex(OTHER), new Set([DEPOSIT]), MAINNET))).toContain("deposit");
  });
  it("refuses extra outputs, which would let it relay a normal payment", () => {
    expect(message(() => parseSweepTransaction(sweepHex(DEPOSIT, 2), new Set([DEPOSIT]), MAINNET))).toContain("one output");
  });
  it("refuses junk", () => {
    expect(message(() => parseSweepTransaction("zz", new Set([DEPOSIT]), MAINNET))).toContain("malformed");
    expect(message(() => parseSweepTransaction("abcd", new Set([DEPOSIT]), MAINNET))).toContain("not a transaction");
  });
});
