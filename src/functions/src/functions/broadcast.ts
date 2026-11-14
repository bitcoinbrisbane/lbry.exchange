/**
 * POST .../bridge/broadcast { ethAddress, hex }
 *
 * Relays a sweep signed in the browser. It is accepted only when it pays a
 * single output to one of the sender's own deposit addresses, so the bridge
 * never relays anything else.
 */
import { LbcChain } from "../lib/chain.js";
import { loadEnv, requireMnemonic } from "../lib/config.js";
import { Custody } from "../lib/custody.js";
import { scanDepositAddresses } from "../lib/deposits.js";
import { handle, requireString } from "../lib/http.js";
import { parseEthAddress } from "../lib/parse.js";
import { parseSweepTransaction } from "../lib/sweep.js";

export const main = handle(["POST"], async (request) => {
  const env = loadEnv();
  const ethAddress = parseEthAddress(requireString(request.params, "ethAddress"));
  const hex = requireString(request.params, "hex");
  const custody = new Custody(requireMnemonic(), env.lbcNetwork);
  return LbcChain.with(env, async (chain) => {
    const { used, next } = await scanDepositAddresses(chain, custody, ethAddress);
    const allowed = new Set([...used.map((u) => u.address), next.address]);
    const tx = parseSweepTransaction(hex, allowed, env.lbcNetwork);
    return { ethAddress, txid: await chain.broadcast(tx) };
  });
});
