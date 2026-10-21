import { describe, expect, it } from 'vitest';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { Custody, DEPOSIT_CHAIN, DEPOSIT_CHUNKS, ethAddressChunks, normalizeEthAddress } from '../src/lib/custody.js';
import { addressFromPublicKey, isValidAddress } from '../src/lib/lbc/address.js';
import { MAINNET } from '../src/lib/lbc/networks.js';

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const ALICE = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const BOB = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

describe('deposit address derivation', () => {
  const custody = new Custody(MNEMONIC, MAINNET);

  it('splits an Ethereum address into six 31-bit indexes that reassemble to the address', () => {
    const chunks = ethAddressChunks(ALICE);
    expect(chunks).toHaveLength(DEPOSIT_CHUNKS);
    for (const c of chunks) expect(c >= 0 && c < 2 ** 31).toBe(true);
    const rebuilt = chunks.reduce((acc, c, i) => acc | (BigInt(c) << BigInt(31 * i)), 0n);
    expect(rebuilt).toBe(BigInt(ALICE));
  });

  it('is deterministic and ignores address case', () => {
    const a = custody.depositAddress(ALICE);
    expect(custody.depositAddress(ALICE.toLowerCase())).toBe(a);
    expect(new Custody(MNEMONIC, MAINNET).depositAddress(ALICE)).toBe(a);
    expect(isValidAddress(a, MAINNET)).toBe(true);
    expect(a.startsWith('b')).toBe(true);
  });

  it('gives different users different addresses, distinct from the treasury', () => {
    const a = custody.depositAddress(ALICE);
    const b = custody.depositAddress(BOB);
    expect(a).not.toBe(b);
    expect(a).not.toBe(custody.treasuryAddress());
  });

  it("matches an independent BIP32 derivation of m/44'/140'/0'/2/c0..c5", () => {
    const root = HDKey.fromMasterSeed(mnemonicToSeedSync(MNEMONIC));
    const path = `m/44'/140'/0'/${DEPOSIT_CHAIN}/${ethAddressChunks(ALICE).join('/')}`;
    expect(custody.depositPath(ALICE)).toBe(path);
    const expected = addressFromPublicKey(root.derive(path).publicKey!, MAINNET);
    expect(custody.depositAddress(ALICE)).toBe(expected);
  });

  it("puts the treasury at m/44'/140'/1'/0/0 and derives a matching private key", () => {
    const root = HDKey.fromMasterSeed(mnemonicToSeedSync(MNEMONIC));
    const key = root.derive("m/44'/140'/1'/0/0");
    expect(custody.treasuryAddress()).toBe(addressFromPublicKey(key.publicKey!, MAINNET));
    expect(Buffer.from(custody.treasuryPrivateKey()).toString('hex')).toBe(Buffer.from(key.privateKey!).toString('hex'));
  });

  it('rejects things that are not Ethereum addresses', () => {
    expect(() => normalizeEthAddress('0x1234')).toThrow();
    expect(() => normalizeEthAddress('bCqJrLHdoiRqEZ1whFZ3WHNb33bP34SuGx')).toThrow();
    // A wrong checksum is a typo, not a different user.
    expect(() => normalizeEthAddress('0x70997970C51812dc3A010C7d01b50e0d17dc79c8')).toThrow();
  });
});
