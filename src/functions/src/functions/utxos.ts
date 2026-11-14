/**
 * GET .../bridge/utxos?address=a,b,c
 *
 * Unspent coins of up to MAX_SWEEP_ADDRESSES addresses, for the browser to sign
 * a sweep. Public chain data only; no key is involved on this side.
 */
import { LbcChain } from "../lib/chain.js";
import { loadEnv } from "../lib/config.js";
import { handle, requireString } from "../lib/http.js";
import { toHex } from "../lib/lbc/encoding/bytes.js";
import { parseSweepAddresses } from "../lib/sweep.js";

const CONCURRENCY = 6;

export const main = handle(["GET"], async (request) => {
  const env = loadEnv();
  const addresses = parseSweepAddresses(requireString(request.params, "address"), env.lbcNetwork);
  return LbcChain.with(env, async (chain) => {
    const tipHeight = await chain.tipHeight();
    const results: { address: string; used: boolean; utxos: object[] }[] = [];
    for (let i = 0; i < addresses.length; i += CONCURRENCY) {
      const batch = await Promise.all(
        addresses.slice(i, i + CONCURRENCY).map(async (address) => {
          const { used, utxos } = await chain.coins(address);
          return {
            address,
            used,
            utxos: utxos.map((u) => ({ txid: u.txid, vout: u.vout, value: u.value, script: toHex(u.script), height: u.height })),
          };
        }),
      );
      results.push(...batch);
    }
    return { network: env.lbcNetwork.name, tipHeight, feePerByte: env.feePerByte, addresses: results };
  });
});
