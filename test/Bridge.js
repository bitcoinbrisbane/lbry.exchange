const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

// A native LBC deposit txid, represented as a bytes32 on-chain.
const LBC_TXID = ethers.id("lbc-deposit-tx-0001");
const LBC_ADDRESS = "bJxPoWWAttwnh3WR8fxJPguzeJ4mmk4n8o";
const AMOUNT = 100_000_000n; // 1.0 wLBC at 8 decimals

describe("Bridge", function () {
  async function deployFixture() {
    const [owner, user, other, newSigner] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    const token = await Token.deploy();

    const Bridge = await ethers.getContractFactory("Bridge");
    const bridge = await Bridge.deploy(token.target);

    // Wire the bridge as the sole mint/burn authority on the token.
    await token.setBridge(bridge.target);

    return { token, bridge, owner, user, other, newSigner };
  }

  // Produce a valid wrap approval signed by `signer` for the given params.
  async function signWrap(bridge, signer, to, amount, lbcTxid) {
    const hash = await bridge.wrapMessageHash(to, amount, lbcTxid);
    return signer.signMessage(ethers.getBytes(hash));
  }

  describe("Deployment", function () {
    it("wires token, owner and signer", async function () {
      const { token, bridge, owner } = await loadFixture(deployFixture);
      expect(await bridge.token()).to.equal(token.target);
      expect(await bridge.owner()).to.equal(owner.address);
      expect(await bridge.signer()).to.equal(owner.address);
      expect(await token.bridge()).to.equal(bridge.target);
    });

    it("token uses 8 decimals to match native LBC", async function () {
      const { token } = await loadFixture(deployFixture);
      expect(await token.decimals()).to.equal(8);
    });

    it("reverts if deployed with the zero token address", async function () {
      const Bridge = await ethers.getContractFactory("Bridge");
      await expect(Bridge.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(Bridge, "ZeroAddress");
    });
  });

  describe("Wrap (LBC -> wLBC)", function () {
    it("mints 1:1 on a valid signature and marks the deposit processed", async function () {
      const { token, bridge, owner, user } = await loadFixture(deployFixture);
      const sig = await signWrap(bridge, owner, user.address, AMOUNT, LBC_TXID);

      await expect(bridge.connect(user).wrap(user.address, AMOUNT, LBC_TXID, sig))
        .to.emit(bridge, "Wrapped")
        .withArgs(user.address, AMOUNT, LBC_TXID);

      expect(await token.balanceOf(user.address)).to.equal(AMOUNT);
      expect(await token.totalSupply()).to.equal(AMOUNT);
      expect(await bridge.processed(LBC_TXID)).to.equal(true);
    });

    it("can be relayed by anyone, not just the recipient", async function () {
      const { token, bridge, owner, user, other } = await loadFixture(deployFixture);
      const sig = await signWrap(bridge, owner, user.address, AMOUNT, LBC_TXID);

      // `other` submits; wLBC still lands with `user`.
      await bridge.connect(other).wrap(user.address, AMOUNT, LBC_TXID, sig);
      expect(await token.balanceOf(user.address)).to.equal(AMOUNT);
    });

    it("rejects a signature from a non-signer", async function () {
      const { bridge, user, other } = await loadFixture(deployFixture);
      const sig = await signWrap(bridge, other, user.address, AMOUNT, LBC_TXID);

      await expect(bridge.connect(user).wrap(user.address, AMOUNT, LBC_TXID, sig)).to.be.revertedWithCustomError(
        bridge,
        "InvalidSignature",
      );
    });

    it("rejects tampered params (signature is bound to to/amount/txid)", async function () {
      const { bridge, owner, user } = await loadFixture(deployFixture);
      const sig = await signWrap(bridge, owner, user.address, AMOUNT, LBC_TXID);

      // Same signature, inflated amount -> hash differs -> invalid.
      await expect(bridge.connect(user).wrap(user.address, AMOUNT + 1n, LBC_TXID, sig)).to.be.revertedWithCustomError(
        bridge,
        "InvalidSignature",
      );
    });

    it("is idempotent: the same lbcTxid cannot be minted twice", async function () {
      const { token, bridge, owner, user } = await loadFixture(deployFixture);
      const sig = await signWrap(bridge, owner, user.address, AMOUNT, LBC_TXID);

      await bridge.connect(user).wrap(user.address, AMOUNT, LBC_TXID, sig);
      await expect(bridge.connect(user).wrap(user.address, AMOUNT, LBC_TXID, sig))
        .to.be.revertedWithCustomError(bridge, "AlreadyProcessed")
        .withArgs(LBC_TXID);

      // Supply unchanged after the rejected replay.
      expect(await token.totalSupply()).to.equal(AMOUNT);
    });

    it("rejects zero amount and zero recipient", async function () {
      const { bridge, owner, user } = await loadFixture(deployFixture);

      const zeroAmtSig = await signWrap(bridge, owner, user.address, 0n, LBC_TXID);
      await expect(bridge.connect(user).wrap(user.address, 0n, LBC_TXID, zeroAmtSig)).to.be.revertedWithCustomError(
        bridge,
        "ZeroAmount",
      );

      const zeroToSig = await signWrap(bridge, owner, ethers.ZeroAddress, AMOUNT, LBC_TXID);
      await expect(
        bridge.connect(user).wrap(ethers.ZeroAddress, AMOUNT, LBC_TXID, zeroToSig),
      ).to.be.revertedWithCustomError(bridge, "ZeroAddress");
    });

    it("honours a rotated signer", async function () {
      const { bridge, owner, user, newSigner } = await loadFixture(deployFixture);

      // Old signer no longer works.
      const oldSig = await signWrap(bridge, owner, user.address, AMOUNT, LBC_TXID);
      await bridge.connect(owner).setSigner(newSigner.address);
      await expect(bridge.connect(user).wrap(user.address, AMOUNT, LBC_TXID, oldSig)).to.be.revertedWithCustomError(
        bridge,
        "InvalidSignature",
      );

      // New signer works.
      const newSig = await signWrap(bridge, newSigner, user.address, AMOUNT, LBC_TXID);
      await expect(bridge.connect(user).wrap(user.address, AMOUNT, LBC_TXID, newSig)).to.emit(bridge, "Wrapped");
    });
  });

  describe("Unwrap (wLBC -> LBC)", function () {
    // Mint the caller some wLBC first via a valid wrap.
    async function withBalance() {
      const ctx = await loadFixture(deployFixture);
      const sig = await signWrap(ctx.bridge, ctx.owner, ctx.user.address, AMOUNT, LBC_TXID);
      await ctx.bridge.connect(ctx.user).wrap(ctx.user.address, AMOUNT, LBC_TXID, sig);
      return ctx;
    }

    it("burns wLBC and emits an Unwrap event with a sequential id", async function () {
      const { token, bridge, user } = await withBalance();

      await expect(bridge.connect(user).unwrap(AMOUNT, LBC_ADDRESS))
        .to.emit(bridge, "Unwrap")
        .withArgs(0, user.address, AMOUNT, LBC_ADDRESS);

      expect(await token.balanceOf(user.address)).to.equal(0);
      expect(await token.totalSupply()).to.equal(0);
      expect(await bridge.unwrapCount()).to.equal(1);
    });

    it("increments the unwrap id per request", async function () {
      const { bridge, user } = await withBalance();
      await bridge.connect(user).unwrap(AMOUNT / 2n, LBC_ADDRESS);
      await expect(bridge.connect(user).unwrap(AMOUNT / 2n, LBC_ADDRESS))
        .to.emit(bridge, "Unwrap")
        .withArgs(1, user.address, AMOUNT / 2n, LBC_ADDRESS);
    });

    it("reverts when burning more than the balance", async function () {
      const { token, bridge, user } = await withBalance();
      await expect(bridge.connect(user).unwrap(AMOUNT + 1n, LBC_ADDRESS)).to.be.revertedWithCustomError(
        token,
        "ERC20InsufficientBalance",
      );
    });

    it("rejects zero amount and empty LBC address", async function () {
      const { bridge, user } = await withBalance();
      await expect(bridge.connect(user).unwrap(0n, LBC_ADDRESS)).to.be.revertedWithCustomError(bridge, "ZeroAmount");
      await expect(bridge.connect(user).unwrap(AMOUNT, "")).to.be.revertedWithCustomError(bridge, "EmptyLbcAddress");
    });
  });

  describe("Access control", function () {
    it("only the bridge can mint or burn the token", async function () {
      const { token, user } = await loadFixture(deployFixture);
      await expect(token.connect(user).mint(user.address, AMOUNT)).to.be.revertedWithCustomError(token, "NotBridge");
      await expect(token.connect(user).burn(user.address, AMOUNT)).to.be.revertedWithCustomError(token, "NotBridge");
    });

    it("only the owner can set the bridge or rotate the signer", async function () {
      const { token, bridge, user } = await loadFixture(deployFixture);
      await expect(token.connect(user).setBridge(user.address)).to.be.revertedWithCustomError(
        token,
        "OwnableUnauthorizedAccount",
      );
      await expect(bridge.connect(user).setSigner(user.address)).to.be.revertedWithCustomError(
        bridge,
        "OwnableUnauthorizedAccount",
      );
    });

    it("setBridge and setSigner reject the zero address", async function () {
      const { token, bridge, owner } = await loadFixture(deployFixture);
      await expect(token.connect(owner).setBridge(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        token,
        "ZeroAddress",
      );
      await expect(bridge.connect(owner).setSigner(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        bridge,
        "ZeroAddress",
      );
    });
  });
});
