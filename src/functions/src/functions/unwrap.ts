/**
 * POST .../bridge/unwrap { burnTxid } — wLBC → LBC.
 *
 * Reads the Unwrap event(s) the burn emitted, waits for enough Ethereum
 * confirmations, and pays native LBC to the address named in each event. The
 * LBC comes from deposit addresses and the treasury pays the fee (see
 * payout.ts), so deposits and supply stay 1:1. The payout carries an OP_RETURN
 * marker naming the burn, and the treasury's history is checked for that
 * marker first, so calling this twice for the same burn never pays twice.
 */
import { LbcChain } from "../lib/chain.js";
import { loadEnv, requireMnemonic } from "../lib/config.js";
import { Custody } from "../lib/custody.js";
import { spendableDeposits } from "../lib/deposits.js";
import { lookupBurn, wrappedRecipients, type UnwrapEvent } from "../lib/eth.js";
import { handle, HttpError, Reply, requireString } from "../lib/http.js";
import { parseBurnTxid } from "../lib/parse.js";
import { DUST_THRESHOLD } from "../lib/lbc/networks.js";
import { signTransaction } from "../lib/lbc/tx/builder.js";
import { unwrapMarkerScript } from "../lib/marker.js";
import { PayoutFundsError, planPayout } from "../lib/payout.js";

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

  // Deposit addresses are found from the Wrapped events, the same set reserves counts.
  let recipients: Promise<string[]> | undefined;
  const payer: Payer = {
    custody,
    treasuryAddress,
    feePerByte: env.feePerByte,
    minConfirmations: env.lbcMinConfirmations,
    recipients: () => (recipients ??= wrappedRecipients(env).then((r) => r.recipients)),
  };
  const payouts = await LbcChain.with(env, async (chain) => {
    const results: PayoutResult[] = [];
    for (const event of burn.events) results.push(await settle(chain, payer, burnTxid, event));
    return results;
  });

  return { burnTxid, confirmations: burn.confirmations, treasuryAddress, payouts };
});

interface Payer {
  custody: Custody;
  treasuryAddress: string;
  feePerByte: number;
  minConfirmations: number;
  recipients: () => Promise<string[]>;
}

async function settle(chain: LbcChain, payer: Payer, burnTxid: string, event: UnwrapEvent): Promise<PayoutResult> {
  const { custody, treasuryAddress } = payer;
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

  // Fetched per event: an earlier payout in this burn has already spent some coins.
  const [deposits, treasuryUtxos] = await Promise.all([
    payer.recipients().then((r) => spendableDeposits(chain, custody, r, payer.minConfirmations)),
    chain.getUtxos(treasuryAddress),
  ]);
  let plan;
  try {
    plan = planPayout({
      depositUtxos: deposits.utxos,
      treasuryUtxos,
      payee: { script: payeeScript, value: event.amount },
      markerScript: unwrapMarkerScript(marker),
      treasuryScript: chain.outputScript(treasuryAddress),
      feePerByte: payer.feePerByte,
    });
  } catch (err) {
    if (err instanceof PayoutFundsError) {
      const message =
        err.source === "deposits"
          ? "Deposit addresses hold too little confirmed LBC for this payout"
          : "Treasury has too little LBC to pay the network fee";
      throw new HttpError(503, message, { burnTxid, id: event.id, needed: err.needed, available: err.available });
    }
    throw err;
  }

  // signTransaction wipes each key once used; both derivations return fresh copies.
  const signed = signTransaction(plan.unsigned, (utxo) => {
    if (utxo.address === treasuryAddress) return custody.treasuryPrivateKey();
    const owner = deposits.owners.get(utxo.address);
    if (!owner) throw new Error(`no key for ${utxo.address}`);
    return custody.depositPrivateKey(owner.ethAddress, owner.index);
  });
  const lbcTxid = await chain.broadcast(signed);
  console.log(
    `unwrap ${event.id} (${burnTxid}): paid ${event.amount} dewies to ${event.lbcAddress} in ${lbcTxid}, fee ${plan.unsigned.fee}`,
  );
  return { ...common, status: "paid", lbcTxid, confirmations: 0, fee: plan.unsigned.fee };
}
