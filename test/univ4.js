const { expect } = require("chai");
const { ZeroAddress, keccak256 } = require("ethers");
const {
  MIN_TICK,
  MAX_TICK,
  getSqrtPriceAtTick,
  getTickAtSqrtPrice,
  rangeTicks,
  liquidityForAmounts,
  amountsForLiquidity,
  poolId,
  encodeMint,
  priceAtTick,
} = require("../scripts/lib/univ4");

const WLBC = { symbol: "wLBC", address: "0xB0F2C4f8b7c0f088f7844947EcBf1220bFCa08C1", decimals: 8 };
const USDT = { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 };
const KEY = { currency0: WLBC.address, currency1: USDT.address, fee: 2500, tickSpacing: 25, hooks: ZeroAddress };

// The pool's slot0 as read on mainnet, 29 October 2026.
const SQRT_PRICE = 193888217682943942625070850n;
const TICK = -120263;

// Position #485556, minted from the Uniswap app in tx
// 0xb0f729baa7ee5e50c584b1a11ea616ef3a868c34baa252b019709932e43ca396: USDT only, below the price.
const APP_MINT = {
  tickLower: -127200,
  tickUpper: -120300,
  liquidity: 159831182224n,
  amount0Max: 731784621295n,
  amount1Max: 113906267n,
  owner: "0x76E2A669f2E1e09109D4A3eB9e216096A3c7c275",
  unlockDataHash: "0xa21ef8a1ad45ef80d8cc8575342939f99dd17901a58c89c77f26d46f5e5ff483",
};

describe("univ4 position math", function () {
  describe("getSqrtPriceAtTick", function () {
    it("matches TickMath at the bounds and at 0", function () {
      expect(getSqrtPriceAtTick(MIN_TICK)).to.equal(4295128739n);
      expect(getSqrtPriceAtTick(MAX_TICK)).to.equal(1461446703485210103287273052203988822378723970342n);
      expect(getSqrtPriceAtTick(0)).to.equal(2n ** 96n);
    });

    it("rejects ticks out of range", function () {
      expect(() => getSqrtPriceAtTick(MAX_TICK + 1)).to.throw("invalid tick");
      expect(() => getSqrtPriceAtTick(1.5)).to.throw("invalid tick");
    });
  });

  describe("getTickAtSqrtPrice", function () {
    it("agrees with the pool's own slot0", function () {
      expect(getTickAtSqrtPrice(SQRT_PRICE)).to.equal(TICK);
    });

    it("returns the tick exactly at a tick's sqrt price", function () {
      expect(getTickAtSqrtPrice(getSqrtPriceAtTick(-120300))).to.equal(-120300);
      expect(getTickAtSqrtPrice(getSqrtPriceAtTick(-120300) - 1n)).to.equal(-120301);
    });
  });

  describe("rangeTicks", function () {
    it("snaps outwards to the tick spacing", function () {
      // $0.0005 is tick -122066.8 and $0.002 is tick -108203.2; the range widens to the
      // multiples of 25 just outside them.
      expect(rangeTicks(WLBC, USDT, "0.0005", "0.002", 25)).to.deep.equal({ tickLower: -122075, tickUpper: -108200 });
      const { tickLower, tickUpper } = rangeTicks(WLBC, USDT, "0.0003", "0.000597", 25);
      expect(priceAtTick(tickLower, WLBC, USDT)).to.be.at.most(0.0003);
      expect(priceAtTick(tickUpper, WLBC, USDT)).to.be.at.least(0.000597);
    });

    it("rejects an empty range", function () {
      expect(() => rangeTicks(WLBC, USDT, "0.001", "0.0005", 25)).to.throw("empty");
    });
  });

  describe("liquidity and amounts", function () {
    it("reproduces the app's USDT-only mint", function () {
      const { tickLower, tickUpper, liquidity, amount1Max } = APP_MINT;
      expect(liquidityForAmounts(SQRT_PRICE, tickLower, tickUpper, null, amount1Max)).to.equal(liquidity);
      expect(amountsForLiquidity(SQRT_PRICE, TICK, tickLower, tickUpper, liquidity)).to.deep.equal({
        amount0: 0n,
        amount1: amount1Max,
      });
    });

    it("takes wLBC only above the price", function () {
      const L = liquidityForAmounts(SQRT_PRICE, -120000, -110000, 10_000n * 10n ** 8n, null);
      const { amount0, amount1 } = amountsForLiquidity(SQRT_PRICE, TICK, -120000, -110000, L);
      expect(amount1).to.equal(0n);
      expect(amount0).to.be.at.most(10_000n * 10n ** 8n);
      // Liquidity rounds down, so a few hundred raw units (1e-8 wLBC each) stay behind.
      expect(amount0).to.be.above(10_000n * 10n ** 8n - 1000n);
      expect(() => liquidityForAmounts(SQRT_PRICE, -120000, -110000, null, 1n)).to.throw("takes wLBC");
    });

    it("derives the other side when the range spans the price", function () {
      const usdt = 10n * 10n ** 6n;
      const L = liquidityForAmounts(SQRT_PRICE, -122100, -108200, null, usdt);
      const { amount0, amount1 } = amountsForLiquidity(SQRT_PRICE, TICK, -122100, -108200, L);
      expect(amount1).to.be.at.most(usdt);
      expect(amount1).to.be.above(usdt - 10n);
      expect(amount0).to.be.above(0n);
      // Offering more of one side than the other can fund leaves the smaller side in charge.
      expect(liquidityForAmounts(SQRT_PRICE, -122100, -108200, amount0 * 2n, usdt)).to.equal(L);
    });
  });

  describe("calldata", function () {
    it("computes the wLBC/USDT pool id", function () {
      expect(poolId(KEY)).to.equal("0xb94ad38df39255149c9491e1f28152989db850a9a47acf5b2eb6139ef437eba1");
    });

    it("encodes a mint byte-for-byte like the Uniswap app", function () {
      const { unlockDataHash, ...mint } = APP_MINT;
      expect(keccak256(encodeMint({ key: KEY, ...mint }))).to.equal(unlockDataHash);
    });
  });
});
