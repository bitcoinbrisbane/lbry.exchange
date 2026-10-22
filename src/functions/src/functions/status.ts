/**
 * GET .../bridge/status
 *
 *   ?ethAddress=0x…             every deposit to that user's addresses: pending / ready / minted
 *   ?ethAddress=0x…&lbcTxid=…   one deposit in detail
 *   ?burnTxid=0x…               an unwrap: burn confirmations and the LBC payout, if sent
 */
import { LbcChain } from "../lib/chain.js";
import { loadEnv, requireMnemonic } from "../lib/config.js";
import { Custody } from "../lib/custody.js";
import { scanDepositAddresses } from "../lib/deposits.js";
import { bridgeContract, isProcessed, lbcTxidToBytes32, lookupBurn } from "../lib/eth.js";
import { handle, HttpError, optionalString } from "../lib/http.js";
import { parseBurnTxid, parseEthAddress } from "../lib/parse.js";

const LBC_TXID = /^[0-9a-fA-F]{64}$/;

export const main = handle(["GET"], async (request) => {
  const env = loadEnv();
  const burnTxid = optionalString(request.params, "burnTxid");
  const ethAddress = optionalString(request.params, "ethAddress");
  const lbcTxid = optionalString(request.params, "lbcTxid");

  if (burnTxid) return unwrapStatus(env, parseBurnTxid(burnTxid));
  if (ethAddress && lbcTxid) {
    if (!LBC_TXID.test(lbcTxid)) throw new HttpError(400, "lbcTxid is malformed");
    return wrapStatus(env, parseEthAddress(ethAddress), lbcTxid.toLowerCase());
  }
  if (ethAddress) return depositsStatus(env, parseEthAddress(ethAddress));
  throw new HttpError(400, "Provide ethAddress, ethAddress and lbcTxid, or burnTxid");
});

/**
 * What the Wrap page polls: every deposit to the user's addresses and where each
 * one stands, plus the address to show for the next deposit.
 */
async function depositsStatus(env: ReturnType<typeof loadEnv>, ethAddress: string) {
  const custody = new Custody(requireMnemonic(), env.lbcNetwork);
  const { next, deposits } = await LbcChain.with(env, async (chain) => {
    const { used, next } = await scanDepositAddresses(chain, custody, ethAddress);
    const perAddress = await Promise.all(
      used.map(async ({ address }) => (await chain.listDeposits(address)).map((d) => ({ ...d, address }))),
    );
    // One transaction can pay more than one of the user's addresses; it is still one mint.
    const byTxid = new Map<string, (typeof perAddress)[number][number]>();
    for (const d of perAddress.flat()) {
      const seen = byTxid.get(d.txid);
      byTxid.set(d.txid, seen ? { ...seen, amount: seen.amount + d.amount } : d);
    }
    const deposits = [...byTxid.values()].sort((a, b) =>
      a.height === 0 ? -1 : b.height === 0 ? 1 : b.height - a.height,
    );
    return { next, deposits };
  });
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
    kind: "deposits",
    ethAddress,
    /** Where the next deposit should go: unused, so it changes once a deposit lands. */
    depositAddress: next.address,
    minConfirmations: env.lbcMinConfirmations,
    warning,
    deposits: deposits.map((d, i) => ({
      lbcTxid: d.txid,
      depositAddress: d.address,
      amount: d.amount,
      confirmations: d.confirmations,
      minted: minted[i],
      status: minted[i] ? "minted" : d.confirmations >= env.lbcMinConfirmations ? "ready" : "pending",
    })),
  };
}

async function wrapStatus(env: ReturnType<typeof loadEnv>, ethAddress: string, lbcTxid: string) {
  const custody = new Custody(requireMnemonic(), env.lbcNetwork);
  const [{ depositAddress, deposit }, processed] = await Promise.all([
    LbcChain.with(env, async (chain) => {
      const { used, next } = await scanDepositAddresses(chain, custody, ethAddress);
      const paid = used.map((u) => u.address);
      return {
        depositAddress: next.address,
        deposit: paid.length > 0 ? await chain.getDeposit(paid, lbcTxid) : null,
      };
    }),
    isProcessed(env, lbcTxidToBytes32(lbcTxid)),
  ]);
  const status = processed
    ? "minted"
    : !deposit
      ? "not_found"
      : deposit.amount === 0n
        ? "no_payment"
        : deposit.confirmations >= env.lbcMinConfirmations
          ? "confirmed"
          : "pending";
  return {
    kind: "wrap",
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
  if (!burn.found) return { kind: "unwrap", status: "not_found", burnTxid };
  if (burn.reverted) return { kind: "unwrap", status: "reverted", burnTxid };
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
          status: payout ? "paid" : burn.confirmations >= env.ethMinConfirmations ? "ready" : "pending",
          lbcTxid: payout?.txid,
          lbcConfirmations: payout?.confirmations,
        };
      }),
    ),
  );
  return {
    kind: "unwrap",
    status:
      burn.events.length === 0
        ? "no_unwrap_event"
        : payouts.every((p) => p.status === "paid")
          ? "paid"
          : burn.confirmations >= env.ethMinConfirmations
            ? "ready"
            : "pending",
    burnTxid,
    confirmations: burn.confirmations,
    minConfirmations: env.ethMinConfirmations,
    payouts,
  };
}
