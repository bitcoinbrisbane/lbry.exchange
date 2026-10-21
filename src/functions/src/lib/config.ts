import {
  NETWORKS,
  type HubServer,
  type NetworkName,
  type NetworkParams,
  DEFAULT_FEE_PER_BYTE,
} from "./lbc/networks.js";
import { isValidBip39 } from "./lbc/keys/mnemonic.js";
import { isAddress } from "ethers";

/** Non-secret configuration shared by every function, read from the environment. */
export interface BridgeEnv {
  ethRpcUrl: string;
  chainId: number;
  bridgeAddress: string;
  tokenAddress: string;
  ethMinConfirmations: number;
  lbcNetwork: NetworkParams;
  hubs: HubServer[];
  lbcMinConfirmations: number;
  feePerByte: number;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

type Env = Record<string, string | undefined>;

function required(env: Env, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new ConfigError(`${key} is not set`);
  return value;
}

function integer(env: Env, key: string, fallback: number | undefined, min = 0): number {
  const raw = env[key]?.trim();
  if (!raw) {
    if (fallback === undefined) throw new ConfigError(`${key} is not set`);
    return fallback;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) throw new ConfigError(`${key} must be an integer >= ${min}`);
  return n;
}

function ethAddress(env: Env, key: string): string {
  const value = required(env, key);
  if (!isAddress(value)) throw new ConfigError(`${key} is not a valid Ethereum address`);
  return value;
}

/** "host:port,host:port[:tls]" → hub endpoints. Empty → the network's default hubs. */
export function parseHubs(raw: string | undefined, network: NetworkParams): HubServer[] {
  const text = raw?.trim();
  if (!text) {
    if (network.defaultHubs.length === 0) throw new ConfigError(`LBC_HUBS must be set for ${network.name}`);
    return network.defaultHubs;
  }
  return text.split(",").map((entry) => {
    const [host, portText, flag] = entry.trim().split(":");
    const port = Number(portText);
    if (!host || !Number.isInteger(port) || port <= 0 || port > 65535)
      throw new ConfigError(`LBC_HUBS entry "${entry}" is not host:port`);
    return flag === "tls" ? { host, port, tls: true } : { host, port };
  });
}

export function loadEnv(env: Env = process.env): BridgeEnv {
  const networkName = (env.LBC_NETWORK?.trim() || "mainnet") as NetworkName;
  const lbcNetwork = NETWORKS[networkName];
  if (!lbcNetwork) throw new ConfigError(`LBC_NETWORK must be one of ${Object.keys(NETWORKS).join(", ")}`);
  return {
    ethRpcUrl: required(env, "ETH_RPC_URL"),
    chainId: integer(env, "CHAIN_ID", undefined, 1),
    bridgeAddress: ethAddress(env, "BRIDGE_ADDRESS"),
    tokenAddress: ethAddress(env, "TOKEN_ADDRESS"),
    ethMinConfirmations: integer(env, "ETH_MIN_CONFIRMATIONS", 12, 1),
    lbcNetwork,
    hubs: parseHubs(env.LBC_HUBS, lbcNetwork),
    lbcMinConfirmations: integer(env, "LBC_MIN_CONFIRMATIONS", 6, 1),
    feePerByte: integer(env, "LBC_FEE_PER_BYTE", DEFAULT_FEE_PER_BYTE, 1),
  };
}

/** The BIP39 phrase controlling deposit addresses and the payout treasury. */
export function requireMnemonic(env: Env = process.env): string {
  const phrase = required(env, "CUSTODY_MNEMONIC");
  if (!isValidBip39(phrase)) throw new ConfigError("CUSTODY_MNEMONIC is not a valid BIP39 phrase");
  return phrase;
}

/** The Ethereum key that matches Bridge.signer(). */
export function requireSignerKey(env: Env = process.env): string {
  const key = required(env, "SIGNER_PRIVATE_KEY");
  if (!/^0x[0-9a-fA-F]{64}$/.test(key))
    throw new ConfigError("SIGNER_PRIVATE_KEY must be a 0x-prefixed 32-byte hex key");
  return key;
}
