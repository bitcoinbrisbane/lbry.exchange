import { concatBytes, equalBytes, fromHex, toHex, utf8Encode } from './lbc/encoding/bytes.js';
import { decompile, nullDataScript, OP } from './lbc/script/script.js';
import type { Transaction } from './lbc/tx/transaction.js';

/**
 * Every LBC payout for an unwrap carries an OP_RETURN output tagging which burn
 * it settles: "wLBC" || burn tx hash (32) || unwrap id (8, big-endian). The
 * treasury's own history on the LBRY chain is therefore the ledger of what has
 * been paid, and the unwrap function stays idempotent without a database.
 */
export const MARKER_PREFIX = utf8Encode('wLBC');
export const MARKER_SIZE = MARKER_PREFIX.length + 32 + 8;

export interface UnwrapMarker {
  /** 0x-prefixed Ethereum transaction hash of the burn. */
  burnTxid: string;
  unwrapId: bigint;
}

/** Lower-case 0x-prefixed 32-byte hash, or throws. */
export function normalizeEthTxid(txid: string): string {
  const text = txid.trim().toLowerCase();
  const hex = text.startsWith('0x') ? text.slice(2) : text;
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error('Transaction hash must be 32 bytes of hex');
  return `0x${hex}`;
}

export function encodeUnwrapMarker(marker: UnwrapMarker): Uint8Array {
  if (marker.unwrapId < 0n || marker.unwrapId > 0xffffffffffffffffn) throw new RangeError('unwrap id out of range');
  const id = new Uint8Array(8);
  let v = marker.unwrapId;
  for (let i = 7; i >= 0; i--) {
    id[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return concatBytes(MARKER_PREFIX, fromHex(normalizeEthTxid(marker.burnTxid).slice(2)), id);
}

export function decodeUnwrapMarker(data: Uint8Array): UnwrapMarker | null {
  if (data.length !== MARKER_SIZE || !equalBytes(data.subarray(0, MARKER_PREFIX.length), MARKER_PREFIX)) return null;
  const hash = data.subarray(MARKER_PREFIX.length, MARKER_PREFIX.length + 32);
  let unwrapId = 0n;
  for (const b of data.subarray(MARKER_PREFIX.length + 32)) unwrapId = (unwrapId << 8n) | BigInt(b);
  return { burnTxid: `0x${toHex(hash)}`, unwrapId };
}

/** OP_RETURN output script carrying the marker. */
export function unwrapMarkerScript(marker: UnwrapMarker): Uint8Array {
  return nullDataScript(encodeUnwrapMarker(marker));
}

/** The marker in an OP_RETURN output script, if it carries one. */
export function markerFromScript(script: Uint8Array): UnwrapMarker | null {
  const chunks = decompile(script);
  if (!chunks || chunks.length !== 2 || chunks[0]!.opcode !== OP.OP_RETURN || !chunks[1]!.data) return null;
  return decodeUnwrapMarker(chunks[1]!.data);
}

/** The first unwrap marker among a transaction's outputs. */
export function markerFromTransaction(tx: Transaction): UnwrapMarker | null {
  for (const output of tx.outputs) {
    const marker = markerFromScript(output.script);
    if (marker) return marker;
  }
  return null;
}

export function sameMarker(a: UnwrapMarker, b: UnwrapMarker): boolean {
  return a.unwrapId === b.unwrapId && normalizeEthTxid(a.burnTxid) === normalizeEthTxid(b.burnTxid);
}
