// Sweep: move every coin of a seed, wallet file or private key into the person's bridge deposit address.
// Everything here runs in the browser. The secret is parsed, the keys derived and the transaction signed
// locally; the functions only see addresses (to look up coins) and the finished, signed transaction.
import { addressFromPublicKey, addressToScript, decodeWif } from "@lbc/address.js";
import { fromHex } from "@lbc/encoding/bytes.js";
import { accountKeyFromExtended, deriveAccountKey, derivePrivateKey } from "@lbc/keys/hd.js";
import { cleanPhrase, isValidBip39 } from "@lbc/keys/mnemonic.js";
import { getNetwork } from "@lbc/networks.js";
import { publicKeyOf } from "@lbc/tx/sign.js";
import { assembleTransaction, selectAll, signTransaction } from "@lbc/tx/builder.js";
import { bridgeApi, errorOf } from "./bridgeApi";

/** How many unused addresses in a row end the search of a chain (the usual wallet gap limit). */
const GAP = 20;
/** Addresses per lookup request; the functions accept more, but a smaller request answers well inside its timeout. */
const LOOKUP_SIZE = 20;
/** Most addresses of one chain looked at, so a mistyped input cannot scan forever. */
const MAX_INDEX = 1000;

export class SecretError extends Error {}

/** A set of keys: an HD account (receive and change chains) or one fixed key. */
function hdSource(label, account, network) {
  return {
    label,
    chains: [0, 1],
    limit: MAX_INDEX,
    address: (chain, index) =>
      addressFromPublicKey(account.deriveChild(chain).deriveChild(index).publicKey, network),
    key: (chain, index) => derivePrivateKey(account, chain, index),
  };
}

function singleSource(label, privateKey, network) {
  const address = addressFromPublicKey(publicKeyOf(privateKey), network);
  return { label, chains: [0], limit: 1, address: () => address, key: () => privateKey.slice() };
}

function phraseSources(phrase, network) {
  const clean = cleanPhrase(phrase);
  const sources = [hdSource("LBRY app seed (m/0/i)", deriveAccountKey(clean, "lbry", network), network)];
  if (isValidBip39(clean)) {
    sources.push(hdSource("BIP39 seed (m/44'/140'/0')", deriveAccountKey(clean, "bip44", network), network));
  }
  return sources;
}

/** Sources from an LBRY SDK wallet file (the JSON in the LBRY app's wallets folder). */
function walletFileSources(text, network) {
  let wallet;
  try {
    wallet = JSON.parse(text);
  } catch {
    throw new SecretError("That file is not valid JSON, so it is not an LBRY wallet file.");
  }
  const accounts = Array.isArray(wallet?.accounts) ? wallet.accounts : null;
  if (!accounts?.length) throw new SecretError("No accounts in this wallet file.");
  if (accounts.some((a) => a.encrypted)) {
    throw new SecretError(
      "This wallet file is encrypted. Remove the password in the LBRY app first, or sweep with your seed instead.",
    );
  }
  const sources = [];
  for (const [i, account] of accounts.entries()) {
    const name = account.name || `account ${i + 1}`;
    const single = account.address_generator?.name === "single-address";
    if (account.private_key) {
      let key;
      try {
        key = accountKeyFromExtended(account.private_key, network);
      } catch {
        throw new SecretError(`The key of ${name} is not a valid extended private key.`);
      }
      if (!key.privateKey) throw new SecretError(`${name} holds no private key.`);
      sources.push(
        single ? singleSource(`${name} (single address)`, key.privateKey, network) : hdSource(name, key, network),
      );
    } else if (account.seed) {
      sources.push(...phraseSources(account.seed, network).map((s) => ({ ...s, label: `${name}: ${s.label}` })));
    }
  }
  if (!sources.length) throw new SecretError("This wallet file holds no private keys (is it watch-only?).");
  return sources;
}

/**
 * What the person pasted or loaded → the key sets to scan.
 * Accepts an LBRY wallet file, an extended private key (xprv), a private key (WIF) or a seed phrase.
 */
export function parseSecret(input, networkName = "mainnet") {
  const network = getNetwork(networkName);
  const text = String(input ?? "").trim();
  if (!text) throw new SecretError("Paste a seed, a private key or a wallet file, or choose a file.");
  if (text.startsWith("{")) return { kind: "wallet file", sources: walletFileSources(text, network) };
  if (/^xprv/.test(text)) {
    let key;
    try {
      key = accountKeyFromExtended(text, network);
    } catch (err) {
      throw new SecretError(err.message);
    }
    if (!key.privateKey) throw new SecretError("That extended key holds no private key.");
    return { kind: "extended private key", sources: [hdSource("Extended key (m/0/i)", key, network)] };
  }
  if (!/\s/.test(text)) {
    let decoded;
    try {
      decoded = decodeWif(text, network);
    } catch (err) {
      throw new SecretError(`${err.message}. Expected an LBC private key, an xprv, a seed phrase or a wallet file.`);
    }
    if (!decoded.compressed) throw new SecretError("Uncompressed private keys are not supported.");
    return { kind: "private key", sources: [singleSource("Private key", decoded.privateKey, network)] };
  }
  const words = cleanPhrase(text).split(" ");
  if (words.length < 12) throw new SecretError("A seed phrase has at least 12 words.");
  return { kind: "seed phrase", sources: phraseSources(text, network) };
}

const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

async function lookup(addresses) {
  const results = await Promise.all(
    chunks(addresses, LOOKUP_SIZE).map(async (batch) => {
      const res = await bridgeApi.utxos(batch);
      if (!res.ok) throw new Error(errorOf(res, "Could not look up coins"));
      return res.data;
    }),
  );
  return {
    addresses: results.flatMap((r) => r.addresses),
    tipHeight: Math.max(...results.map((r) => r.tipHeight)),
    feePerByte: results[0].feePerByte,
  };
}

/**
 * Looks along each chain of the source until GAP addresses in a row have no history.
 * Resolves to { coins, tipHeight, feePerByte }; each coin remembers which key it needs.
 */
export async function scanSource(source, onProgress = () => {}) {
  const coins = [];
  let tipHeight = 0;
  let feePerByte = 0;
  const state = source.chains.map((chain) => ({ chain, next: 0, lastUsed: -1, done: false }));
  while (state.some((s) => !s.done)) {
    const wanted = [];
    for (const s of state) {
      if (s.done) continue;
      const count = Math.min(source.chains.length === 1 ? 1 : GAP, source.limit - s.next);
      for (let i = 0; i < count; i++) wanted.push({ chain: s.chain, index: s.next + i, address: source.address(s.chain, s.next + i) });
    }
    const found = await lookup(wanted.map((w) => w.address));
    tipHeight = Math.max(tipHeight, found.tipHeight);
    feePerByte = found.feePerByte;
    const byAddress = new Map(found.addresses.map((a) => [a.address, a]));
    for (const w of wanted) {
      const info = byAddress.get(w.address);
      const s = state.find((x) => x.chain === w.chain);
      s.next = Math.max(s.next, w.index + 1);
      if (!info?.used) continue;
      s.lastUsed = Math.max(s.lastUsed, w.index);
      for (const u of info.utxos) {
        coins.push({
          txid: u.txid,
          vout: u.vout,
          value: BigInt(u.value),
          script: fromHex(u.script),
          address: u.address ?? w.address,
          height: u.height,
          chain: w.chain,
          index: w.index,
        });
      }
    }
    for (const s of state) s.done = s.done || s.next >= source.limit || s.next - (s.lastUsed + 1) >= (source.chains.length === 1 ? 1 : GAP);
    onProgress(state.reduce((n, s) => n + s.next, 0));
  }
  return { coins, tipHeight, feePerByte };
}

export const totalOf = (coins) => coins.reduce((sum, c) => sum + c.value, 0n);

/**
 * One signed transaction paying every confirmed coin (less the fee) to `destination`.
 * Past MAX_INPUTS coins the largest are spent and `remaining` says how many are left for another sweep.
 */
export function buildSweep(source, coins, destination, feePerByte, networkName = "mainnet") {
  const network = getNetwork(networkName);
  const confirmed = coins.filter((c) => c.height > 0);
  if (!confirmed.length) throw new SecretError("No confirmed coins to sweep yet.");
  const { inputs, value, fee } = selectAll(confirmed, addressToScript(destination, network), feePerByte);
  const payment = assembleTransaction(inputs, [{ script: addressToScript(destination, network), value }]);
  const tx = signTransaction(payment, (utxo) => source.key(utxo.chain, utxo.index));
  return { hex: tx.toHex(), txid: tx.txid, value, fee, inputs: inputs.length, remaining: confirmed.length - inputs.length };
}
