import { addressToScript, scriptToAddress } from "./lbc/address.js";
import type { ChainBackend } from "./lbc/net/backend.js";
import { HubBackend } from "./lbc/net/hub.js";
import { nodeLineTransport } from "./lbc/node/index.js";
import type { Utxo } from "./lbc/tx/builder.js";
import { Transaction } from "./lbc/tx/transaction.js";
import type { BridgeEnv } from "./config.js";
import { markerFromTransaction, sameMarker, type UnwrapMarker } from "./marker.js";

/** A transaction's payments to one address. */
export interface DepositInfo {
  txid: string;
  /** Dewies paid to the address by this transaction. */
  amount: bigint;
  /** Block height, 0 while in the mempool. */
  height: number;
  confirmations: number;
  tipHeight: number;
}

export interface PayoutInfo {
  txid: string;
  height: number;
  confirmations: number;
  marker: UnwrapMarker;
}

const CLIENT_NAME = "lbry.exchange bridge";

/**
 * Short-lived LBRY hub session for one function invocation. Wraps the wallet's
 * hub client (which already copes with both hub implementations) in a
 * connect-work-disconnect lifecycle bounded by the function timeout.
 */
export class LbcChain {
  /** `hub` is injectable so the coin logic can be tested against a fake backend. */
  constructor(
    private readonly env: Pick<BridgeEnv, "lbcNetwork">,
    private readonly hub: ChainBackend,
  ) {}

  static hubBackend(env: BridgeEnv): HubBackend {
    return new HubBackend({
      servers: env.hubs,
      network: env.lbcNetwork,
      clientName: CLIENT_NAME,
      transportFactory: (endpoint) => nodeLineTransport(endpoint, { connectTimeoutMs: 5_000 }),
      connectTimeoutMs: 5_000,
      requestTimeoutMs: 20_000,
      log: (level, message) =>
        (level === "info" ? console.log : level === "warn" ? console.warn : console.error)(`[hub] ${message}`),
    });
  }

  /** Runs `fn` against a connected hub and always disconnects afterwards. */
  static async with<T>(env: BridgeEnv, fn: (chain: LbcChain) => Promise<T>, connectTimeoutMs = 10_000): Promise<T> {
    const hub = LbcChain.hubBackend(env);
    const chain = new LbcChain(env, hub);
    try {
      await withTimeout(hub.start(), connectTimeoutMs, "No LBRY hub answered in time");
      return await fn(chain);
    } finally {
      await hub.stop();
    }
  }

  async tipHeight(): Promise<number> {
    return (await this.hub.getTip()).height;
  }

  async getTransaction(txid: string): Promise<{ tx: Transaction; height: number } | null> {
    const fetched = (await this.hub.getTransactions([txid])).get(txid);
    if (!fetched) return null;
    const tx = Transaction.fromHex(fetched.hex);
    if (tx.txid !== txid) throw new Error(`hub returned a transaction that does not hash to ${txid}`);
    return { tx, height: fetched.height };
  }

  /** What `txid` pays to `address`, or null when the hub does not know the transaction. */
  async getDeposit(address: string, txid: string): Promise<DepositInfo | null> {
    const found = await this.getTransaction(txid);
    if (!found) return null;
    const tipHeight = await this.tipHeight();
    let amount = 0n;
    for (const output of found.tx.outputs)
      if (scriptToAddress(output.script, this.env.lbcNetwork) === address) amount += output.value;
    return { txid, amount, height: found.height, confirmations: confirmationsAt(found.height, tipHeight), tipHeight };
  }

  /**
   * Every payment made to `address`, newest first. The address's own spends
   * (sweeps, and the change they return) are not deposits and are left out.
   */
  async listDeposits(address: string): Promise<DepositInfo[]> {
    const txs = await this.getHistoryTransactions(address);
    const tipHeight = await this.tipHeight();
    const network = this.env.lbcNetwork;
    const owned = new Set<string>();
    for (const { tx } of txs)
      tx.outputs.forEach(
        (o, vout) => scriptToAddress(o.script, network) === address && owned.add(`${tx.txid}:${vout}`),
      );
    const deposits: DepositInfo[] = [];
    for (const { tx, height } of txs) {
      if (tx.inputs.some((i) => owned.has(`${i.txid}:${i.vout}`))) continue;
      let amount = 0n;
      for (const o of tx.outputs) if (scriptToAddress(o.script, network) === address) amount += o.value;
      if (amount > 0n)
        deposits.push({ txid: tx.txid, amount, height, confirmations: confirmationsAt(height, tipHeight), tipHeight });
    }
    // Mempool (height 0) first, then by descending height.
    return deposits.sort((a, b) => (a.height === 0 ? -1 : b.height === 0 ? 1 : b.height - a.height));
  }

  /** Every transaction in an address's history, confirmed and mempool. */
  private async getHistoryTransactions(address: string): Promise<{ tx: Transaction; height: number }[]> {
    const history = await this.hub.getHistory(address);
    const txids = [...new Set(history.map((h) => h.txid))];
    const fetched = await this.hub.getTransactions(txids);
    return txids.map((txid) => {
      const entry = fetched.get(txid);
      if (!entry) throw new Error(`hub listed ${txid} in the history but did not return it`);
      const tx = Transaction.fromHex(entry.hex);
      if (tx.txid !== txid) throw new Error(`hub returned a transaction that does not hash to ${txid}`);
      return { tx, height: entry.height };
    });
  }

  /**
   * Unspent outputs of an address, derived from its history the way the wallet
   * engine does: every output paying the address, minus those an input in the
   * same history spends. Mempool outputs are included (height 0) and the coin
   * selector prefers confirmed ones.
   */
  async getUtxos(address: string): Promise<Utxo[]> {
    const txs = await this.getHistoryTransactions(address);
    const network = this.env.lbcNetwork;
    const utxos = new Map<string, Utxo>();
    for (const { tx, height } of txs) {
      tx.outputs.forEach((output, vout) => {
        if (scriptToAddress(output.script, network) === address) {
          utxos.set(`${tx.txid}:${vout}`, {
            txid: tx.txid,
            vout,
            value: output.value,
            script: output.script,
            address,
            height,
          });
        }
      });
    }
    for (const { tx } of txs) for (const input of tx.inputs) utxos.delete(`${input.txid}:${input.vout}`);
    return [...utxos.values()];
  }

  /** The treasury transaction that already settled `marker`, if any (mempool counts). */
  async findPayout(treasuryAddress: string, marker: UnwrapMarker): Promise<PayoutInfo | null> {
    const txs = await this.getHistoryTransactions(treasuryAddress);
    const tipHeight = await this.tipHeight();
    for (const { tx, height } of txs) {
      const found = markerFromTransaction(tx);
      if (found && sameMarker(found, marker))
        return { txid: tx.txid, height, confirmations: confirmationsAt(height, tipHeight), marker: found };
    }
    return null;
  }

  /** Broadcasts and returns the txid (computed locally when the hub reports it already had it). */
  async broadcast(tx: Transaction): Promise<string> {
    const reported = await this.hub.broadcast(tx.toHex());
    if (reported && reported !== tx.txid)
      throw new Error(`hub reported txid ${reported} for a transaction hashing to ${tx.txid}`);
    return tx.txid;
  }

  outputScript(address: string): Uint8Array {
    return addressToScript(address, this.env.lbcNetwork);
  }
}

function confirmationsAt(height: number, tipHeight: number): number {
  return height > 0 ? Math.max(0, tipHeight - height + 1) : 0;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
