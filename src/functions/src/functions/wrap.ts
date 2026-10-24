/**
 * POST/GET .../bridge/wrap — LBC → wLBC.
 *
 *   GET  ?ethAddress=0x…                 a fresh LBC deposit address for that Ethereum address,
 *                                        signed by the bridge signer (see depositAddressMessage)
 *   POST { ethAddress, lbcTxid }         once the deposit is confirmed: a signed mint approval
 *
 * Each deposit gets its own address: GET hands out the first of the user's
 * addresses with no history, and POST looks for the deposit across all of them.
 *
 * The approval is relayed by the user (or anyone) to Bridge.wrap(to, amount,
 * lbcTxid, signature); the contract's `processed` map stops double mints.
 */
import { LbcChain } from "../lib/chain.js";
import { loadEnv, requireMnemonic, requireSignerKey } from "../lib/config.js";
import { Custody } from "../lib/custody.js";
import { scanDepositAddresses } from "../lib/deposits.js";
import {
  bridgeContract,
  isProcessed,
  lbcTxidToBytes32,
  onChainSigner,
  signDepositAddress,
  signWrapApproval,
} from "../lib/eth.js";
import { handle, HttpError, Reply, requireString } from "../lib/http.js";
import { parseEthAddress } from "../lib/parse.js";

const LBC_TXID = /^[0-9a-fA-F]{64}$/;

export const main = handle(["GET", "POST"], async (request) => {
  const env = loadEnv();
  const ethAddress = parseEthAddress(requireString(request.params, "ethAddress"));
  const custody = new Custody(requireMnemonic(), env.lbcNetwork);
  const lbcTxid =
    request.method === "POST" ? requireString(request.params, "lbcTxid", LBC_TXID).toLowerCase() : undefined;
  const { addresses, deposit } = await LbcChain.with(env, async (chain) => {
    const addresses = await scanDepositAddresses(chain, custody, ethAddress);
    const paid = addresses.used.map((u) => u.address);
    const deposit = lbcTxid && paid.length > 0 ? await chain.getDeposit(paid, lbcTxid) : null;
    return { addresses, deposit };
  });
  const depositAddress = addresses.next.address;
  const base = {
    ethAddress,
    depositAddress,
    network: env.lbcNetwork.name,
    minConfirmations: env.lbcMinConfirmations,
    chainId: env.chainId,
    bridgeAddress: env.bridgeAddress,
  };

  if (!lbcTxid) {
    const { message, signature, signer } = await signDepositAddress(requireSignerKey(), {
      chainId: env.chainId,
      bridgeAddress: env.bridgeAddress,
      ethAddress,
      depositAddress,
    });
    return {
      ...base,
      path: addresses.next.path,
      /** Proof the address came from the bridge: check `signature` over `message` recovers Bridge.signer(). */
      message,
      signature,
      signer,
      instructions: `Send LBC to ${depositAddress}; it takes one deposit, and the next one gets a new address. After ${env.lbcMinConfirmations} confirmations, POST { ethAddress, lbcTxid } here to receive a mint approval for Bridge.wrap.`,
    };
  }

  if (!deposit) throw new HttpError(404, "Transaction not found on the LBRY chain", { ...base, lbcTxid });
  if (deposit.amount === 0n)
    throw new HttpError(400, "Transaction pays nothing to this wallet's deposit addresses", { ...base, lbcTxid });
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
