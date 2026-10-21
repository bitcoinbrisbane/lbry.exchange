/**
 * GET .../bridge/status
 *
 *   ?ethAddress=0x…&lbcTxid=…   a wrap: deposit confirmations and whether it is minted
 *   ?burnTxid=0x…               an unwrap: burn confirmations and the LBC payout, if sent
 */
import { LbcChain } from '../lib/chain.js';
import { loadEnv, requireMnemonic } from '../lib/config.js';
import { Custody } from '../lib/custody.js';
import { isProcessed, lbcTxidToBytes32, lookupBurn } from '../lib/eth.js';
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
  throw new HttpError(400, 'Provide burnTxid, or ethAddress and lbcTxid');
});

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
