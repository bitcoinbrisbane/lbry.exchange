const { expect } = require("chai");
const {
  Q96,
  isqrt,
  parseDecimal,
  sortTokens,
  encodeSqrtPriceX96,
  fullRangeTicks,
  quoteForBase,
  lessBps,
  priceDeviationBps,
} = require("../scripts/lib/univ3");

// Mainnet addresses: wLBC (0xB0..) sorts before USDT (0xdA..) and after USDC (0xA0..).
const WLBC = { symbol: "wLBC", address: "0xB0F2C4f8b7c0f088f7844947EcBf1220bFCa08C1", decimals: 8 };
const USDT = { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 };
const USDC = { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 };

describe("univ3 pool math", function () {
  describe("isqrt", function () {
    it("floors exact and inexact roots", function () {
      expect(isqrt(0n)).to.equal(0n);
      expect(isqrt(1n)).to.equal(1n);
      expect(isqrt(15n)).to.equal(3n);
      expect(isqrt(16n)).to.equal(4n);
      expect(isqrt(Q96 * Q96)).to.equal(Q96);
    });

    it("rejects negatives", function () {
      expect(() => isqrt(-1n)).to.throw("negative");
    });
  });

  describe("parseDecimal", function () {
    it("splits a decimal into numerator and denominator", function () {
      expect(parseDecimal("0.0125")).to.deep.equal({ num: 125n, den: 10000n });
      expect(parseDecimal("2")).to.deep.equal({ num: 2n, den: 1n });
    });

    it("rejects zero, negatives and non-strings", function () {
      expect(() => parseDecimal("0")).to.throw("greater than 0");
      expect(() => parseDecimal("-1")).to.throw("positive decimal");
      expect(() => parseDecimal("1e-2")).to.throw("positive decimal");
      expect(() => parseDecimal(0.01)).to.throw("positive decimal");
    });
  });

  describe("sortTokens", function () {
    it("orders by address regardless of argument order", function () {
      expect(sortTokens(WLBC, USDT)).to.deep.equal([WLBC, USDT]);
      expect(sortTokens(USDT, WLBC)).to.deep.equal([WLBC, USDT]);
    });

    it("rejects identical addresses", function () {
      expect(() => sortTokens(WLBC, { ...WLBC })).to.throw("identical");
    });
  });

  describe("encodeSqrtPriceX96", function () {
    it("is 2^96 for price 1 between equal-decimal tokens", function () {
      const a = { address: "0x0000000000000000000000000000000000000001", decimals: 18 };
      const b = { address: "0x0000000000000000000000000000000000000002", decimals: 18 };
      expect(encodeSqrtPriceX96(a, b, "1")).to.equal(Q96);
      expect(encodeSqrtPriceX96(b, a, "1")).to.equal(Q96);
    });

    it("applies the 8/6 decimal offset for wLBC/USDT", function () {
      // 0.01 USDT per wLBC = 10^4 raw USDT per 10^8 raw wLBC = 10^-4; sqrt = 10^-2.
      expect(encodeSqrtPriceX96(WLBC, USDT, "0.01")).to.equal(Q96 / 100n);
      // 1 USDT per wLBC = 10^-2 raw; sqrt = 10^-1.
      expect(encodeSqrtPriceX96(WLBC, USDT, "1")).to.equal(Q96 / 10n);
    });

    it("inverts for wLBC/USDC, where USDC (0xA0..) is token0", function () {
      // 0.01 USDC per wLBC: pool price is wLBC raw per USDC raw = 10^8 / 10^4 = 10^4; sqrt = 100.
      expect(sortTokens(WLBC, USDC)[0]).to.equal(USDC);
      expect(encodeSqrtPriceX96(WLBC, USDC, "0.01")).to.equal(Q96 * 100n);
      expect(quoteForBase(WLBC, USDC, "0.0125", 10_000n * 10n ** 8n)).to.equal(125n * 10n ** 6n);
    });

    it("inverts when the base token sorts second", function () {
      // Pricing USDT in wLBC: 100 wLBC per USDT is the same pool price as 0.01 USDT per wLBC.
      expect(encodeSqrtPriceX96(USDT, WLBC, "100")).to.equal(Q96 / 100n);
    });
  });

  describe("fullRangeTicks", function () {
    it("snaps the tick bounds inward to the tier's spacing", function () {
      expect(fullRangeTicks(10000)).to.deep.equal({ tickLower: -887200, tickUpper: 887200 });
      expect(fullRangeTicks(3000)).to.deep.equal({ tickLower: -887220, tickUpper: 887220 });
      expect(fullRangeTicks(500)).to.deep.equal({ tickLower: -887270, tickUpper: 887270 });
      expect(fullRangeTicks(100)).to.deep.equal({ tickLower: -887272, tickUpper: 887272 });
    });

    it("rejects a fee tier that is not enabled", function () {
      expect(() => fullRangeTicks(1000)).to.throw("not an enabled tier");
    });
  });

  describe("quoteForBase", function () {
    it("converts raw wLBC to raw USDT at the price", function () {
      // 10,000 wLBC at 0.0125 USDT = 125 USDT.
      expect(quoteForBase(WLBC, USDT, "0.0125", 10_000n * 10n ** 8n)).to.equal(125n * 10n ** 6n);
    });

    it("rounds down", function () {
      // 1 raw wLBC at 0.01 is 10^-4 raw USDT.
      expect(quoteForBase(WLBC, USDT, "0.01", 1n)).to.equal(0n);
    });
  });

  describe("lessBps", function () {
    it("subtracts basis points, rounding down", function () {
      expect(lessBps(10000n, 100)).to.equal(9900n);
      expect(lessBps(999n, 100)).to.equal(989n);
      expect(lessBps(5n, 0)).to.equal(5n);
    });
  });

  describe("priceDeviationBps", function () {
    it("is 0 for equal prices", function () {
      expect(priceDeviationBps(Q96, Q96)).to.equal(0);
    });

    it("compares prices, not square roots", function () {
      // A 1% higher sqrt price is a ~2.01% higher price (floored to 200 bps).
      expect(priceDeviationBps((Q96 * 101n) / 100n, Q96)).to.equal(200);
      expect(priceDeviationBps((Q96 * 99n) / 100n, Q96)).to.equal(199);
    });
  });
});
