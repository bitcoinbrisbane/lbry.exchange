import { describe, expect, it } from 'vitest';
import { MARKER_SIZE, decodeUnwrapMarker, encodeUnwrapMarker, markerFromScript, markerFromTransaction, normalizeEthTxid, sameMarker, unwrapMarkerScript } from '../src/lib/marker.js';
import { nullDataScript, p2pkhScript } from '../src/lib/lbc/script/script.js';
import { Transaction } from '../src/lib/lbc/tx/transaction.js';
import { utf8Encode } from '../src/lib/lbc/encoding/bytes.js';

const BURN = '0x' + 'ab'.repeat(32);

describe('unwrap marker', () => {
  it('encodes "wLBC" + burn hash + 8-byte id and decodes it back', () => {
    const marker = { burnTxid: BURN, unwrapId: 258n };
    const bytes = encodeUnwrapMarker(marker);
    expect(bytes).toHaveLength(MARKER_SIZE);
    expect(Buffer.from(bytes.subarray(0, 4)).toString()).toBe('wLBC');
    expect(bytes[MARKER_SIZE - 1]).toBe(2);
    expect(bytes[MARKER_SIZE - 2]).toBe(1);
    expect(decodeUnwrapMarker(bytes)).toEqual(marker);
  });

  it('accepts the hash with or without 0x and in any case', () => {
    expect(normalizeEthTxid('AB'.repeat(32))).toBe(BURN);
    expect(sameMarker({ burnTxid: 'AB'.repeat(32), unwrapId: 1n }, { burnTxid: BURN, unwrapId: 1n })).toBe(true);
    expect(() => normalizeEthTxid('0x1234')).toThrow();
  });

  it('finds the marker among transaction outputs and ignores other OP_RETURNs', () => {
    const marker = { burnTxid: BURN, unwrapId: 7n };
    const tx = new Transaction();
    tx.outputs.push({ value: 1000n, script: p2pkhScript(new Uint8Array(20)) });
    tx.outputs.push({ value: 0n, script: nullDataScript(utf8Encode('hello')) });
    expect(markerFromTransaction(tx)).toBeNull();
    tx.outputs.push({ value: 0n, script: unwrapMarkerScript(marker) });
    expect(markerFromTransaction(tx)).toEqual(marker);
    expect(markerFromScript(p2pkhScript(new Uint8Array(20)))).toBeNull();
  });

  it('keeps the OP_RETURN under the 80-byte relay limit', () => {
    expect(unwrapMarkerScript({ burnTxid: BURN, unwrapId: 0n }).length).toBeLessThanOrEqual(83);
  });
});
