import { Contract, Interface, JsonRpcProvider, Wallet, getBytes, solidityPackedKeccak256, type Log, type TransactionReceipt } from 'ethers';
import type { BridgeEnv } from './config.js';
import { normalizeEthTxid } from './marker.js';

/** The slice of contracts/Bridge.sol the functions use. */
export const BRIDGE_ABI = [
  'function signer() view returns (address)',
  'function token() view returns (address)',
  'function processed(bytes32 lbcTxid) view returns (bool)',
  'function unwrapCount() view returns (uint256)',
  'function wrapMessageHash(address to, uint256 amount, bytes32 lbcTxid) view returns (bytes32)',
  'function wrap(address to, uint256 amount, bytes32 lbcTxid, bytes signature)',
  'function unwrap(uint256 amount, string lbcAddress)',
  'event Wrapped(address indexed to, uint256 amount, bytes32 indexed lbcTxid)',
  'event Unwrap(uint256 indexed id, address indexed from, uint256 amount, string lbcAddress)',
];

const bridgeInterface = new Interface(BRIDGE_ABI);

export function provider(env: BridgeEnv): JsonRpcProvider {
  // A static network skips the eth_chainId round trip and pins the expected chain.
  return new JsonRpcProvider(env.ethRpcUrl, env.chainId, { staticNetwork: true });
}

export function bridgeContract(env: BridgeEnv, rpc = provider(env)): Contract {
  return new Contract(env.bridgeAddress, BRIDGE_ABI, rpc);
}

/** Bridge.processed(lbcTxid): whether a deposit has already been minted. */
export async function isProcessed(env: BridgeEnv, lbcTxidBytes32: string, contract = bridgeContract(env)): Promise<boolean> {
  return Boolean(await contract.getFunction('processed').staticCall(lbcTxidBytes32));
}

/** Bridge.signer(): the key whose approvals the contract accepts. */
export async function onChainSigner(env: BridgeEnv, contract = bridgeContract(env)): Promise<string> {
  return String(await contract.getFunction('signer').staticCall());
}

/** An LBC transaction id (display hex) as the bytes32 the contract keys on. */
export function lbcTxidToBytes32(txid: string): string {
  const hex = txid.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error('LBC txid must be 64 hex characters');
  return `0x${hex}`;
}

export interface WrapApprovalInput {
  chainId: number;
  bridgeAddress: string;
  to: string;
  amount: bigint;
  /** bytes32, 0x-prefixed. */
  lbcTxid: string;
}

/** Reproduces Bridge.wrapMessageHash: keccak256(abi.encodePacked(chainid, bridge, to, amount, lbcTxid)). */
export function wrapMessageHash(input: WrapApprovalInput): string {
  return solidityPackedKeccak256(['uint256', 'address', 'address', 'uint256', 'bytes32'], [input.chainId, input.bridgeAddress, input.to, input.amount, input.lbcTxid]);
}

/** EIP-191 personal-sign of the wrap hash, as Bridge.wrap verifies with toEthSignedMessageHash. */
export async function signWrapApproval(signerKey: string, input: WrapApprovalInput): Promise<{ signature: string; signer: string }> {
  const wallet = new Wallet(signerKey);
  const signature = await wallet.signMessage(getBytes(wrapMessageHash(input)));
  return { signature, signer: wallet.address };
}

export interface UnwrapEvent {
  id: bigint;
  from: string;
  /** wLBC burned, 8 decimals, so also the dewies to pay out. */
  amount: bigint;
  lbcAddress: string;
  logIndex: number;
}

export type BurnLookup =
  | { found: false }
  | { found: true; reverted: true; blockNumber: number }
  | { found: true; reverted: false; blockNumber: number; confirmations: number; events: UnwrapEvent[] };

/** The Unwrap events a burn transaction emitted from the bridge, with its confirmation depth. */
export async function lookupBurn(env: BridgeEnv, burnTxid: string, rpc = provider(env)): Promise<BurnLookup> {
  const hash = normalizeEthTxid(burnTxid);
  const [receipt, head] = await Promise.all([rpc.getTransactionReceipt(hash), rpc.getBlockNumber()]);
  if (!receipt) return { found: false };
  if (receipt.status !== 1) return { found: true, reverted: true, blockNumber: receipt.blockNumber };
  return {
    found: true,
    reverted: false,
    blockNumber: receipt.blockNumber,
    confirmations: head - receipt.blockNumber + 1,
    events: unwrapEvents(receipt, env.bridgeAddress),
  };
}

export function unwrapEvents(receipt: Pick<TransactionReceipt, 'logs'>, bridgeAddress: string): UnwrapEvent[] {
  const bridge = bridgeAddress.toLowerCase();
  const events: UnwrapEvent[] = [];
  for (const log of receipt.logs as readonly Log[]) {
    if (log.address.toLowerCase() !== bridge) continue;
    let parsed;
    try {
      parsed = bridgeInterface.parseLog({ topics: [...log.topics], data: log.data });
    } catch {
      continue;
    }
    if (!parsed || parsed.name !== 'Unwrap') continue;
    events.push({
      id: BigInt(parsed.args.id),
      from: String(parsed.args.from),
      amount: BigInt(parsed.args.amount),
      lbcAddress: String(parsed.args.lbcAddress),
      logIndex: log.index,
    });
  }
  return events;
}
