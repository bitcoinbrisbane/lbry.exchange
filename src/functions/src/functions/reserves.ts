/**
 * GET .../bridge/reserves — proof of reserves.
 *
 * wLBC supply (the liability) against the confirmed LBC held by the treasury
 * and every deposit address (the assets), plus a Merkle root over those
 * balances. Deposit addresses are found from the Bridge's Wrapped events and
 * derived from the published deposits xpub, so anyone can redo this from
 * public data: the Verify page recomputes the root in the browser.
 */
import { LbcChain } from "../lib/chain.js";
import { loadEnv, requireMnemonic } from "../lib/config.js";
import { Custody } from "../lib/custody.js";
import { tokenSupply, wrappedRecipients } from "../lib/eth.js";
import { handle } from "../lib/http.js";
import { buildReservesTree } from "../lib/merkle.js";

export const main = handle(["GET"], async () => {
  const env = loadEnv();
  const custody = new Custody(requireMnemonic(), env.lbcNetwork);
  const treasuryAddress = custody.treasuryAddress();

  // Supply is read at the same block the Wrapped scan stops at, so both describe one moment.
  const { recipients, toBlock: ethBlock } = await wrappedRecipients(env);
  const supply = await tokenSupply(env, undefined, ethBlock);
  const depositAddresses = [...new Set(recipients.map((eth) => custody.depositAddress(eth)))];

  const { lbcHeight, balances } = await LbcChain.with(env, async (chain) => {
    const height = await chain.tipHeight();
    const addresses = [treasuryAddress, ...depositAddresses];
    const values = await Promise.all(addresses.map((a) => chain.confirmedBalance(a)));
    return { lbcHeight: height, balances: addresses.map((lbcAddress, i) => ({ lbcAddress, balance: values[i]! })) };
  });

  const reserves = balances.reduce((sum, b) => sum + b.balance, 0n);
  const tree = buildReservesTree(balances, lbcHeight);
  const kind = (a: string) => (a === treasuryAddress ? "treasury" : "deposit");

  return {
    asOf: { lbcHeight, ethBlock, timestamp: new Date().toISOString() },
    supply,
    reserves,
    /** Reserves per wLBC in basis points (10000 = fully backed); null with no supply. */
    backingBps: supply > 0n ? Number((reserves * 10_000n) / supply) : null,
    fullyBacked: reserves >= supply,
    treasury: balances.find((b) => b.lbcAddress === treasuryAddress),
    merkle: {
      root: tree.root,
      leafFormat: "keccak256(abi.encodePacked(string lbcAddress, uint64 balanceDewies, uint32 lbcHeight))",
      pairing: "leaves sorted by address; parent = keccak256(left ‖ right); odd node paired with itself",
      leaves: tree.leaves.map((l) => ({ ...l, kind: kind(l.lbcAddress) })),
    },
    xpubs: {
      deposits: custody.depositXpub(),
      depositsPath: "m/44'/140'/0'  →  /2/c0/c1/c2/c3/c4/c5 (Ethereum address in 31-bit chunks)",
      treasury: custody.treasuryXpub(),
      treasuryPath: "m/44'/140'/1'  →  /0/0",
    },
    contracts: { token: env.tokenAddress, bridge: env.bridgeAddress, chainId: env.chainId },
  };
});
