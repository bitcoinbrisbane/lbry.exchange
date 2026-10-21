import { describe, expect, it } from "vitest";
import { Interface, Wallet, getBytes, verifyMessage } from "ethers";
import { BRIDGE_ABI, lbcTxidToBytes32, signWrapApproval, unwrapEvents, wrapMessageHash } from "../src/lib/eth.js";

// Produced by deploying contracts/Bridge.sol on Hardhat (chain 31337) and calling
// wrapMessageHash(to, amount, lbcTxid); see the hardhat test suite for the contract.
const VECTOR = {
  chainId: 31337,
  bridgeAddress: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  amount: 123456789n,
  lbcTxid: "0xabababababababababababababababababababababababababababababababab",
  hash: "0x3e153325f10834ca9b3246551a4bab7ff34edc1fe3f73386e5f63867172abf83",
};

describe("wrap approvals", () => {
  it("reproduces Bridge.wrapMessageHash exactly", () => {
    expect(wrapMessageHash(VECTOR)).toBe(VECTOR.hash);
  });

  it("signs with EIP-191 so the contract recovers the signer", async () => {
    const wallet = Wallet.createRandom();
    const { signature, signer } = await signWrapApproval(wallet.privateKey, VECTOR);
    expect(signer).toBe(wallet.address);
    expect(verifyMessage(getBytes(VECTOR.hash), signature)).toBe(wallet.address);
  });

  it("turns an LBC txid into the bytes32 the contract keys on", () => {
    expect(lbcTxidToBytes32("AB".repeat(32))).toBe(VECTOR.lbcTxid);
    expect(() => lbcTxidToBytes32("abcd")).toThrow();
  });
});

describe("unwrap events", () => {
  const iface = new Interface(BRIDGE_ABI);
  const bridge = VECTOR.bridgeAddress;

  it("parses Unwrap logs from the bridge and ignores other contracts and events", () => {
    const unwrap = iface.encodeEventLog("Unwrap", [5n, VECTOR.to, 250000000n, "bCqJrLHdoiRqEZ1whFZ3WHNb33bP34SuGx"]);
    const wrapped = iface.encodeEventLog("Wrapped", [VECTOR.to, 1n, VECTOR.lbcTxid]);
    const logs = [
      { address: bridge, topics: wrapped.topics, data: wrapped.data, index: 0 },
      { address: "0x0000000000000000000000000000000000000001", topics: unwrap.topics, data: unwrap.data, index: 1 },
      { address: bridge.toLowerCase(), topics: unwrap.topics, data: unwrap.data, index: 2 },
    ];
    const events = unwrapEvents({ logs } as never, bridge);
    expect(events).toEqual([
      { id: 5n, from: VECTOR.to, amount: 250000000n, lbcAddress: "bCqJrLHdoiRqEZ1whFZ3WHNb33bP34SuGx", logIndex: 2 },
    ]);
  });
});
