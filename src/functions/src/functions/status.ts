/**
 * GET .../bridge/status
 *
 *   ?ethAddress=0x…             every deposit to that user's address: pending / ready / minted
 *   ?ethAddress=0x…&lbcTxid=…   one deposit in detail
 *   ?burnTxid=0x…               an unwrap: burn confirmations and the LBC payout, if sent
 */
import { LbcChain } from '../lib/chain.js';
import { loadEnv, requireMnemonic } from '../lib/config.js';
import { Custody } from '../lib/custody.js';
import { bridgeContract, isProcessed, lbcTxidToBytes32, lookupBurn } from '../lib/eth.js';
import { handle, HttpError, optionalString } from '../lib/http.js';
import { parseEthAddress } from './wrap.js';
import { parseBurnTxid } from './unwrap.js';

const LBC_TXID = /^[0-9a-fA-F]{64}$/;

export const main = handle(['GET'], async (request) => {
  const env = loadEnv();
  const burnTxid = optionalString(request.params, 'burnTxid');
  const ethAddress = optionalString(request.params, 'ethAddress');
  const lbcTxid = optionalString(request.params, 'lbcTxid');

  if (burnTxid) return unwrapStatus(env, parseBurnTxid(burnTxid));
  if (ethAddress && lbcTxid) {
    if (!LBC_TXID.test(lbcTxid)) throw new HttpError(400, 'lbcTxid is malformed');
    return wrapStatus(env, parseEthAddress(ethAddress), lbcTxid.toLowerCase());
  }
  if (ethAddress) return depositsStatus(env, parseEthAddress(ethAddress));
  throw new HttpError(400, 'Provide ethAddress, ethAddress and lbcTxid, or burnTxid');
});

/** What the Wrap page polls: every deposit to the user's address and where each one stands. */
async function depositsStatus(env: ReturnType<typeof loadEnv>, ethAddress: string) {
  const custody = new Custody(requireMnemonic(), env.lbcNetwork);
  const depositAddress = custody.depositAddress(ethAddress);
  const deposits = await LbcChain.with(env, (chain) => chain.listDeposits(depositAddress));
  // The LBRY side is the primary record. If the contract cannot be read (RPC down,
  // not deployed yet) the list still comes back, flagged, with mint state unknown:
  // a mint attempt on an already-minted deposit simply reverts.
  let minted: (boolean | null)[] = deposits.map(() => null);
  let warning: string | undefined;
  try {
    const contract = bridgeContract(env);
    minted = await Promise.all(deposits.map((d) => isProcessed(env, lbcTxidToBytes32(d.txid), contract)));
  } catch (err) {
    warning = `Could not read the bridge contract: ${err instanceof Error ? ((err as { shortMessage?: string }).shortMessage ?? err.message) : String(err)}`;
    console.warn(warning);
  }
  return {
    kind: 'deposits',
    ethAddress,
    depositAddress,
    minConfirmations: env.lbcMinConfirmations,
    warning,
    deposits: deposits.map((d, i) => ({
      lbcTxid: d.txid,
      amount: d.amount,
      confirmations: d.confirmations,
      minted: minted[i],
      status: minted[i] ? 'minted' : d.confirmations >= env.lbcMinConfirmations ? 'ready' : 'pending',
    })),
  };
}

async function wrapStatus(env: ReturnType<typeof loadEnv>, ethAddress: string, lbcTxid: string) {
  const custody = new Custody(requireMnemonic(), env.lbcNetwork);
  const depositAddress = custody.depositAddress(ethAddress);
  const [deposit, processed] = await Promise.all([
    LbcChain.with(env, (chain) => chain.getDeposit(depositAddress, lbcTxid)),
    isProcessed(env, lbcTxidToBytes32(lbcTxid)),
  ]);
  const status = processed ? 'minted' : !deposit ? 'not_found' : deposit.amount === 0n ? 'no_payment' : deposit.confirmations >= env.lbcMinConfirmations ? 'confirmed' : 'pending';
  return {
    kind: 'wrap',
    status,
    ethAddress,
    depositAddress,
    lbcTxid,
    amount: deposit?.amount ?? 0n,
    confirmations: deposit?.confirmations ?? 0,
    minConfirmations: env.lbcMinConfirmations,
    minted: processed,
  };
}

async function unwrapStatus(env: ReturnType<typeof loadEnv>, burnTxid: string) {
  const burn = await lookupBurn(env, burnTxid);
  if (!burn.found) return { kind: 'unwrap', status: 'not_found', burnTxid };
  if (burn.reverted) return { kind: 'unwrap', status: 'reverted', burnTxid };
  const custody = new Custody(requireMnemonic(), env.lbcNetwork);
  const treasuryAddress = custody.treasuryAddress();
  const payouts = await LbcChain.with(env, async (chain) =>
    Promise.all(
      burn.events.map(async (event) => {
        const payout = await chain.findPayout(treasuryAddress, { burnTxid, unwrapId: event.id });
        return {
          id: event.id,
          lbcAddress: event.lbcAddress,
          amount: event.amount,
          status: payout ? 'paid' : burn.confirmations >= env.ethMinConfirmations ? 'ready' : 'pending',
          lbcTxid: payout?.txid,
          lbcConfirmations: payout?.confirmations,
        };
      }),
    ),
  );
  return {
    kind: 'unwrap',
    status: burn.events.length === 0 ? 'no_unwrap_event' : payouts.every((p) => p.status === 'paid') ? 'paid' : burn.confirmations >= env.ethMinConfirmations ? 'ready' : 'pending',
    burnTxid,
    confirmations: burn.confirmations,
    minConfirmations: env.ethMinConfirmations,
    payouts,
  };
}
