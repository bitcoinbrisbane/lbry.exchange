import type { HDKey } from '@scure/bip32';
import { getAddress } from 'ethers';
import { addressFromPublicKey } from './lbc/address.js';
import { deriveAccountKey, derivePrivateKey, CHAIN_RECEIVE } from './lbc/keys/hd.js';
import type { NetworkParams } from './lbc/networks.js';

/**
 * Key management for the custodial side of the bridge. Everything is derived
 * from one BIP39 seed, so there is no database of addresses to keep or lose:
 *
 *   deposits   m/44'/140'/0'/2/c0/c1/c2/c3/c4/c5   one address per Ethereum address
 *   treasury   m/44'/140'/1'/0/0                   pays out unwraps
 *
 * A deposit address is a pure function of (seed, Ethereum address), so a user
 * can be given their address statelessly and LBC sent to it can only ever be
 * minted to that Ethereum address. The chain index 2 keeps deposits off the
 * receive/change chains (0 and 1) that ordinary BIP44 wallets scan, and the
 * 160-bit address is split into six 31-bit non-hardened child indexes.
 *
 * The treasury sits in account 1 at the standard first receive address, so
 * any BIP44 wallet restored from the seed with account 1 can see and spend it.
 * Deposit addresses can be enumerated later from the bridge's Wrapped events
 * (each carries the Ethereum address) and swept into the treasury.
 */
export const DEPOSIT_CHAIN = 2;
export const TREASURY_ACCOUNT = 1;

const CHUNK_BITS = 31n;
const CHUNK_MASK = (1n << CHUNK_BITS) - 1n;
/** ceil(160 / 31) */
export const DEPOSIT_CHUNKS = 6;

/** Checksummed form of an Ethereum address; throws on anything that is not one. */
export function normalizeEthAddress(address: string): string {
  return getAddress(address.trim());
}

/** The six 31-bit child indexes an Ethereum address derives to, least significant first. */
export function ethAddressChunks(ethAddress: string): number[] {
  const value = BigInt(normalizeEthAddress(ethAddress));
  const chunks: number[] = [];
  for (let i = 0; i < DEPOSIT_CHUNKS; i++) chunks.push(Number((value >> (CHUNK_BITS * BigInt(i))) & CHUNK_MASK));
  return chunks;
}

export class Custody {
  private readonly account: HDKey;
  private readonly treasuryAccount: HDKey;

  constructor(
    mnemonic: string,
    readonly network: NetworkParams,
  ) {
    this.account = deriveAccountKey(mnemonic, 'bip44', network, { accountIndex: 0 });
    this.treasuryAccount = deriveAccountKey(mnemonic, 'bip44', network, { accountIndex: TREASURY_ACCOUNT });
  }

  /** Child indexes below the account key for an Ethereum address's deposit address. */
  depositIndexes(ethAddress: string): number[] {
    return [DEPOSIT_CHAIN, ...ethAddressChunks(ethAddress)];
  }

  /** Human-readable derivation path of a deposit address. */
  depositPath(ethAddress: string): string {
    return `m/44'/${this.network.coinType}'/0'/${this.depositIndexes(ethAddress).join('/')}`;
  }

  private depositKey(ethAddress: string): HDKey {
    return this.depositIndexes(ethAddress).reduce((key, index) => key.deriveChild(index), this.account);
  }

  /** The LBC address a user must send to in order to mint wLBC to `ethAddress`. */
  depositAddress(ethAddress: string): string {
    const publicKey = this.depositKey(ethAddress).publicKey;
    if (!publicKey) throw new Error('derivation failed');
    return addressFromPublicKey(publicKey, this.network);
  }

  /** Private key of a deposit address (for sweeping). Caller must wipe the result. */
  depositPrivateKey(ethAddress: string): Uint8Array {
    const key = this.depositKey(ethAddress).privateKey;
    if (!key) throw new Error('account key has no private key');
    return key.slice();
  }

  treasuryAddress(): string {
    const publicKey = this.treasuryAccount.deriveChild(CHAIN_RECEIVE).deriveChild(0).publicKey;
    if (!publicKey) throw new Error('derivation failed');
    return addressFromPublicKey(publicKey, this.network);
  }

  /** Private key of the treasury. Caller must wipe the result. */
  treasuryPrivateKey(): Uint8Array {
    return derivePrivateKey(this.treasuryAccount, CHAIN_RECEIVE, 0);
  }
}
