import { describe, expect, it } from 'vitest';
import { LbcChain } from '../src/lib/chain.js';
import { addressToScript } from '../src/lib/lbc/address.js';
import { Emitter } from '../src/lib/lbc/util/emitter.js';
import type { BackendEvents, ChainBackend, ChainTip, FetchedTransaction, HistoryItem } from '../src/lib/lbc/net/backend.js';
import { MAINNET } from '../src/lib/lbc/networks.js';
import { SEQUENCE_FINAL, Transaction } from '../src/lib/lbc/tx/transaction.js';
import { unwrapMarkerScript } from '../src/lib/marker.js';

const TREASURY = 'bCqJrLHdoiRqEZ1whFZ3WHNb33bP34SuGx';
const OTHER = 'bCxrJ2PonHnfDTPK4mpM46YWmgXubh831T';
const BURN = '0x' + 'cd'.repeat(32);

/** An in-memory hub: a tip height plus transactions indexed by txid and by paying address. */
class FakeHub extends Emitter<BackendEvents> implements ChainBackend {
  readonly kind = 'hub' as const;
  readonly untrusted = true;
  private txs = new Map<string, { tx: Transaction; height: number }>();
  broadcasts: string[] = [];

  constructor(private tipHeight: number) {
    super();
  }

  add(tx: Transaction, height: number): Transaction {
    this.txs.set(tx.txid, { tx, height });
    return tx;
  }

  async start() {}
  async stop() {}
  getStatus() {
    return { connected: true, kind: this.kind };
  }
  async getTip(): Promise<ChainTip> {
    return { height: this.tipHeight, header: '' };
  }
  async getHeaders() {
    return [];
  }
  async subscribeAddresses(addresses: string[]) {
    return addresses.map(() => null);
  }
  /** Like a real hub: every transaction that pays the address or spends one of its outputs. */
  async getHistory(address: string): Promise<HistoryItem[]> {
    const paysTo = (tx: Transaction) => tx.outputs.some((o) => Buffer.from(o.script).equals(Buffer.from(addressToScript(address, MAINNET))));
    const spendsFrom = (tx: Transaction) => tx.inputs.some((i) => {
      const prev = this.txs.get(i.txid);
      return prev && paysTo(prev.tx) && Buffer.from(prev.tx.outputs[i.vout]!.script).equals(Buffer.from(addressToScript(address, MAINNET)));
    });
    return [...this.txs.values()].filter(({ tx }) => paysTo(tx) || spendsFrom(tx)).map(({ tx, height }) => ({ txid: tx.txid, height }));
  }
  async getTransactions(txids: string[]): Promise<Map<string, FetchedTransaction>> {
    const out = new Map<string, FetchedTransaction>();
    for (const txid of txids) {
      const entry = this.txs.get(txid);
      if (entry) out.set(txid, { hex: entry.tx.toHex(), height: entry.height });
    }
    return out;
  }
  async broadcast(rawHex: string) {
    this.broadcasts.push(rawHex);
    return Transaction.fromHex(rawHex).txid;
  }
}

function pay(outputs: { address: string; value: bigint }[], inputs: { txid: string; vout: number }[] = [], extra: Uint8Array[] = []): Transaction {
  const tx = new Transaction();
  for (const i of inputs) tx.inputs.push({ txid: i.txid, vout: i.vout, scriptSig: new Uint8Array([1, 2, 3]), sequence: SEQUENCE_FINAL, witness: [] });
  if (inputs.length === 0) tx.inputs.push({ txid: 'ff'.repeat(32), vout: 0, scriptSig: new Uint8Array(0), sequence: SEQUENCE_FINAL, witness: [] });
  for (const o of outputs) tx.outputs.push({ value: o.value, script: addressToScript(o.address, MAINNET) });
  for (const script of extra) tx.outputs.push({ value: 0n, script });
  return tx;
}

describe('LbcChain', () => {
  it('reports what a transaction pays to an address and its confirmations', async () => {
    const hub = new FakeHub(1000);
    const deposit = hub.add(pay([{ address: TREASURY, value: 5n }, { address: OTHER, value: 7n }, { address: TREASURY, value: 10n }]), 991);
    const mempool = hub.add(pay([{ address: TREASURY, value: 1n }]), 0);
    const chain = new LbcChain({ lbcNetwork: MAINNET }, hub);

    expect(await chain.getDeposit(TREASURY, deposit.txid)).toEqual({ txid: deposit.txid, amount: 15n, height: 991, confirmations: 10, tipHeight: 1000 });
    expect((await chain.getDeposit(OTHER, deposit.txid))!.amount).toBe(7n);
    expect((await chain.getDeposit(TREASURY, mempool.txid))!.confirmations).toBe(0);
    expect(await chain.getDeposit(TREASURY, '00'.repeat(32))).toBeNull();
  });

  it('derives unspent outputs from history, dropping what later transactions spend', async () => {
    const hub = new FakeHub(1000);
    const a = hub.add(pay([{ address: TREASURY, value: 100n }, { address: TREASURY, value: 200n }, { address: OTHER, value: 300n }]), 900);
    // Spends a:0 and pays change back; the mempool output counts with height 0.
    const b = hub.add(pay([{ address: OTHER, value: 60n }, { address: TREASURY, value: 30n }], [{ txid: a.txid, vout: 0 }]), 0);
    const chain = new LbcChain({ lbcNetwork: MAINNET }, hub);

    const utxos = (await chain.getUtxos(TREASURY)).sort((x, y) => Number(x.value - y.value));
    expect(utxos.map((u) => [u.txid, u.vout, u.value, u.height])).toEqual([
      [b.txid, 1, 30n, 0],
      [a.txid, 1, 200n, 900],
    ]);
    expect(utxos.every((u) => u.address === TREASURY)).toBe(true);
    expect(await chain.getUtxos(OTHER)).toHaveLength(2);
  });

  it('finds an earlier payout by its OP_RETURN marker and distinguishes unwrap ids', async () => {
    const hub = new FakeHub(1000);
    const marker = { burnTxid: BURN, unwrapId: 3n };
    const payout = hub.add(pay([{ address: OTHER, value: 50n }, { address: TREASURY, value: 5n }], [], [unwrapMarkerScript(marker)]), 998);
    hub.add(pay([{ address: OTHER, value: 50n }, { address: TREASURY, value: 5n }], [], [unwrapMarkerScript({ burnTxid: BURN, unwrapId: 4n })]), 999);
    const chain = new LbcChain({ lbcNetwork: MAINNET }, hub);

    const found = await chain.findPayout(TREASURY, marker);
    expect(found?.txid).toBe(payout.txid);
    expect(found?.confirmations).toBe(3);
    expect(await chain.findPayout(TREASURY, { burnTxid: BURN, unwrapId: 5n })).toBeNull();
    expect(await chain.findPayout(TREASURY, { burnTxid: '0x' + '00'.repeat(32), unwrapId: 3n })).toBeNull();
  });

  it('refuses a hub that returns a transaction with the wrong hash', async () => {
    const hub = new FakeHub(1000);
    const tx = pay([{ address: TREASURY, value: 1n }]);
    hub.getTransactions = async (txids) => new Map(txids.map((t) => [t, { hex: tx.toHex(), height: 1 }]));
    const chain = new LbcChain({ lbcNetwork: MAINNET }, hub);
    await expect(chain.getTransaction('00'.repeat(32))).rejects.toThrow(/does not hash/);
  });
});
