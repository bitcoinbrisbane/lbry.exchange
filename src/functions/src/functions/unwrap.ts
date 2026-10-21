/**
 * POST .../bridge/unwrap { burnTxid } — wLBC → LBC.
 *
 * Reads the Unwrap event(s) the burn emitted, waits for enough Ethereum
 * confirmations, and pays native LBC from the treasury to the address named in
 * each event. The payout carries an OP_RETURN marker naming the burn, and the
 * treasury's history is checked for that marker first, so calling this twice
 * for the same burn never pays twice.
 */
import { LbcChain } from "../lib/chain.js";
import { loadEnv, requireMnemonic } from "../lib/config.js";
import { Custody } from "../lib/custody.js";
import { lookupBurn, type UnwrapEvent } from "../lib/eth.js";
import { handle, HttpError, Reply, requireString } from "../lib/http.js";
import { DUST_THRESHOLD } from "../lib/lbc/networks.js";
import { InsufficientFundsError, assembleTransaction, selectCoins, signTransaction } from "../lib/lbc/tx/builder.js";
import { wipe } from "../lib/lbc/encoding/bytes.js";
import { normalizeEthTxid, unwrapMarkerScript } from "../lib/marker.js";

export function parseBurnTxid(value: string): string {
  try {
    return normalizeEthTxid(value);
  } catch {
    throw new HttpError(400, "burnTxid is not a valid transaction hash");
  }
}

type PayoutResult =
  | {
      id: bigint;
      lbcAddress: string;
      amount: bigint;
      status: "paid";
      lbcTxid: string;
      confirmations: number;
      fee?: bigint;
    }
  | { id: bigint; lbcAddress: string; amount: bigint; status: "invalid_address" | "below_dust"; error: string };

export const main = handle(["POST"], async (request) => {
  const env = loadEnv();
  const burnTxid = parseBurnTxid(requireString(request.params, "burnTxid"));

  const burn = await lookupBurn(env, burnTxid);
  if (!burn.found) throw new HttpError(404, "Burn transaction not found on Ethereum", { burnTxid });
  if (burn.reverted) throw new HttpError(400, "Burn transaction reverted", { burnTxid });
  if (burn.events.length === 0)
    throw new HttpError(400, "Transaction emitted no Unwrap event from the bridge", { burnTxid });
  if (burn.confirmations < env.ethMinConfirmations) {
    return new Reply(202, {
      burnTxid,
      status: "pending",
      confirmations: burn.confirmations,
      required: env.ethMinConfirmations,
    });
  }

  const custody = new Custody(requireMnemonic(), env.lbcNetwork);
  const treasuryAddress = custody.treasuryAddress();

  const payouts = await LbcChain.with(env, async (chain) => {
    const results: PayoutResult[] = [];
    for (const event of burn.events)
      results.push(await settle(chain, custody, treasuryAddress, burnTxid, event, env.feePerByte));
    return results;
  });

  return { burnTxid, confirmations: burn.confirmations, treasuryAddress, payouts };
});

async function settle(
  chain: LbcChain,
  custody: Custody,
  treasuryAddress: string,
  burnTxid: string,
  event: UnwrapEvent,
  feePerByte: number,
): Promise<PayoutResult> {
  const common = { id: event.id, lbcAddress: event.lbcAddress, amount: event.amount };
  const marker = { burnTxid, unwrapId: event.id };

  let payeeScript: Uint8Array;
  try {
    payeeScript = chain.outputScript(event.lbcAddress);
  } catch (err) {
    // The wLBC is burned but the destination is unusable: left for manual handling.
    return { ...common, status: "invalid_address", error: err instanceof Error ? err.message : String(err) };
  }
  if (event.amount < DUST_THRESHOLD)
    return { ...common, status: "below_dust", error: `Payouts below ${DUST_THRESHOLD} dewies cannot be sent` };

  const existing = await chain.findPayout(treasuryAddress, marker);
  if (existing) return { ...common, status: "paid", lbcTxid: existing.txid, confirmations: existing.confirmations };

  const utxos = await chain.getUtxos(treasuryAddress);
  const changeScript = chain.outputScript(treasuryAddress);
  const recipients = [
    { script: payeeScript, value: event.amount },
    { script: unwrapMarkerScript(marker), value: 0n },
  ];
  let selection;
  try {
    selection = selectCoins(utxos, recipients, changeScript, feePerByte);
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      throw new HttpError(503, "Treasury has insufficient LBC for this payout", {
        burnTxid,
        id: event.id,
        needed: err.needed,
        available: err.available,
      });
    }
    throw err;
  }

  const unsigned = assembleTransaction(
    selection.inputs,
    recipients,
    selection.change > 0n ? { script: changeScript, value: selection.change } : undefined,
  );
  const key = custody.treasuryPrivateKey();
  let signed;
  try {
    // signTransaction wipes each key it is handed, so give it copies and wipe the original after.
    signed = signTransaction(unsigned, () => key.slice());
  } finally {
    wipe(key);
  }
  const lbcTxid = await chain.broadcast(signed);
  console.log(`unwrap ${event.id} (${burnTxid}): paid ${event.amount} dewies to ${event.lbcAddress} in ${lbcTxid}`);
  return { ...common, status: "paid", lbcTxid, confirmations: 0, fee: selection.fee };
}
