import { describe, expect, it } from 'vitest';
import { ConfigError, loadEnv, parseHubs, requireMnemonic, requireSignerKey } from '../src/lib/config.js';
import { MAINNET, REGTEST } from '../src/lib/lbc/networks.js';

const BASE = {
  ETH_RPC_URL: 'http://localhost:8545',
  CHAIN_ID: '31337',
  BRIDGE_ADDRESS: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
  TOKEN_ADDRESS: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
};

describe('environment', () => {
  it('applies defaults and the mainnet hubs', () => {
    const env = loadEnv(BASE);
    expect(env.chainId).toBe(31337);
    expect(env.lbcNetwork).toBe(MAINNET);
    expect(env.hubs).toBe(MAINNET.defaultHubs);
    expect(env.lbcMinConfirmations).toBe(6);
    expect(env.ethMinConfirmations).toBe(12);
    expect(env.feePerByte).toBe(50);
  });

  it('parses explicit hubs and requires them on networks without defaults', () => {
    expect(parseHubs('a.example:50001, b.example:50002:tls', MAINNET)).toEqual([
      { host: 'a.example', port: 50001 },
      { host: 'b.example', port: 50002, tls: true },
    ]);
    expect(() => parseHubs('', REGTEST)).toThrow(ConfigError);
    expect(() => parseHubs('nonsense', MAINNET)).toThrow(ConfigError);
  });

  it('rejects missing or malformed values', () => {
    expect(() => loadEnv({ ...BASE, CHAIN_ID: '' })).toThrow(/CHAIN_ID/);
    expect(() => loadEnv({ ...BASE, BRIDGE_ADDRESS: '0x123' })).toThrow(/BRIDGE_ADDRESS/);
    expect(() => loadEnv({ ...BASE, LBC_NETWORK: 'moonnet' })).toThrow(/LBC_NETWORK/);
    expect(() => loadEnv({ ...BASE, LBC_MIN_CONFIRMATIONS: '0' })).toThrow(/LBC_MIN_CONFIRMATIONS/);
  });

  it('validates the secrets', () => {
    expect(requireMnemonic({ CUSTODY_MNEMONIC: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about' })).toContain('abandon');
    expect(() => requireMnemonic({ CUSTODY_MNEMONIC: 'abandon abandon abandon' })).toThrow(ConfigError);
    expect(() => requireMnemonic({})).toThrow(ConfigError);
    expect(requireSignerKey({ SIGNER_PRIVATE_KEY: '0x' + '11'.repeat(32) })).toBe('0x' + '11'.repeat(32));
    expect(() => requireSignerKey({ SIGNER_PRIVATE_KEY: '11'.repeat(32) })).toThrow(ConfigError);
  });
});
