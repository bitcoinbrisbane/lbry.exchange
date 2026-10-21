/**
 * GET .../bridge/config — the public parameters a client needs: chain, contract
 * addresses, confirmation thresholds, the on-chain signer and the treasury.
 */
import { loadEnv, requireMnemonic } from "../lib/config.js";
import { Custody } from "../lib/custody.js";
import { onChainSigner } from "../lib/eth.js";
import { handle } from "../lib/http.js";

export const main = handle(["GET"], async () => {
  const env = loadEnv();
  const custody = new Custody(requireMnemonic(), env.lbcNetwork);
  let signer: string | null = null;
  try {
    signer = await onChainSigner(env);
  } catch (err) {
    console.warn(`could not read Bridge.signer(): ${err instanceof Error ? err.message : String(err)}`);
  }
  return {
    chainId: env.chainId,
    bridgeAddress: env.bridgeAddress,
    tokenAddress: env.tokenAddress,
    signer,
    ethMinConfirmations: env.ethMinConfirmations,
    lbc: {
      network: env.lbcNetwork.name,
      minConfirmations: env.lbcMinConfirmations,
      treasuryAddress: custody.treasuryAddress(),
      hubs: env.hubs.map((h) => `${h.host}:${h.port}`),
      explorer: env.lbcNetwork.explorer ?? null,
    },
    decimals: 8,
  };
});
