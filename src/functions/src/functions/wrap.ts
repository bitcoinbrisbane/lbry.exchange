/**
 * POST/GET .../bridge/wrap — LBC → wLBC.
 *
 *   GET  ?ethAddress=0x…                 the LBC deposit address for that Ethereum address
 *   POST { ethAddress, lbcTxid }         once the deposit is confirmed: a signed mint approval
 *
 * The approval is relayed by the user (or anyone) to Bridge.wrap(to, amount,
 * lbcTxid, signature); the contract's `processed` map stops double mints.
 */
import { LbcChain } from "../lib/chain.js";
import { loadEnv, requireMnemonic, requireSignerKey } from "../lib/config.js";
import { Custody, normalizeEthAddress } from "../lib/custody.js";
import { bridgeContract, isProcessed, lbcTxidToBytes32, onChainSigner, signWrapApproval } from "../lib/eth.js";
import { handle, HttpError, Reply, requireString } from "../lib/http.js";

const LBC_TXID = /^[0-9a-fA-F]{64}$/;

export function parseEthAddress(value: string): string {
  try {
    return normalizeEthAddress(value);
  } catch {
    throw new HttpError(400, "ethAddress is not a valid Ethereum address");
  }
}

export const main = handle(["GET", "POST"], async (request) => {
  const env = loadEnv();
  const ethAddress = parseEthAddress(requireString(request.params, "ethAddress"));
  const custody = new Custody(requireMnemonic(), env.lbcNetwork);
  const depositAddress = custody.depositAddress(ethAddress);
  const base = {
    ethAddress,
    depositAddress,
    network: env.lbcNetwork.name,
    minConfirmations: env.lbcMinConfirmations,
    chainId: env.chainId,
    bridgeAddress: env.bridgeAddress,
  };

  if (request.method === "GET") {
    return {
      ...base,
      path: custody.depositPath(ethAddress),
      instructions: `Send LBC to ${depositAddress}. After ${env.lbcMinConfirmations} confirmations, POST { ethAddress, lbcTxid } here to receive a mint approval for Bridge.wrap.`,
    };
  }

  const lbcTxid = requireString(request.params, "lbcTxid", LBC_TXID).toLowerCase();
  const deposit = await LbcChain.with(env, (chain) => chain.getDeposit(depositAddress, lbcTxid));
  if (!deposit) throw new HttpError(404, "Transaction not found on the LBRY chain", { ...base, lbcTxid });
  if (deposit.amount === 0n)
    throw new HttpError(400, "Transaction pays nothing to the deposit address", { ...base, lbcTxid });
  if (deposit.confirmations < env.lbcMinConfirmations) {
    return new Reply(202, {
      ...base,
      status: "pending",
      lbcTxid,
      amount: deposit.amount,
      confirmations: deposit.confirmations,
    });
  }

  const lbcTxidBytes32 = lbcTxidToBytes32(lbcTxid);
  const bridge = bridgeContract(env);
  const signerKey = requireSignerKey();
  const [processed, expectedSigner] = await Promise.all([
    isProcessed(env, lbcTxidBytes32, bridge),
    onChainSigner(env, bridge),
  ]);
  if (processed)
    throw new HttpError(409, "This deposit has already been minted", {
      ...base,
      status: "minted",
      lbcTxid,
      amount: deposit.amount,
    });

  const approval = {
    chainId: env.chainId,
    bridgeAddress: env.bridgeAddress,
    to: ethAddress,
    amount: deposit.amount,
    lbcTxid: lbcTxidBytes32,
  };
  const { signature, signer } = await signWrapApproval(signerKey, approval);
  if (signer.toLowerCase() !== expectedSigner.toLowerCase()) {
    throw new HttpError(503, "Service misconfigured: SIGNER_PRIVATE_KEY does not match Bridge.signer()", {
      signer,
      expectedSigner,
    });
  }

  return {
    ...base,
    status: "approved",
    lbcTxid,
    amount: deposit.amount,
    confirmations: deposit.confirmations,
    signer,
    signature,
    /** Arguments for Bridge.wrap, in order. */
    wrapArgs: { to: ethAddress, amount: deposit.amount, lbcTxid: lbcTxidBytes32, signature },
  };
});
