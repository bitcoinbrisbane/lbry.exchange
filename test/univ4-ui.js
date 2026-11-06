// The Supply page carries its own ES module copy of the V4 math (src/ui/src/lib/univ4.js), because the site
// builds from src/ui alone. These check it gives the same answers as scripts/lib/univ4.js, which test/univ4.js
// pins to mainnet; Node loads the ES module through require().
const { expect } = require("chai");
const { ZeroAddress, keccak256 } = require("ethers");
const scripts = require("../scripts/lib/univ4");
const { encodeSqrtPriceX96 } = require("../scripts/lib/univ3");
const ui = require("../src/ui/src/lib/univ4.js");

const WLBC = { symbol: "wLBC", address: "0xB0F2C4f8b7c0f088f7844947EcBf1220bFCa08C1", decimals: 8 };
const USDT = { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 };
const KEY = { currency0: WLBC.address, currency1: USDT.address, fee: 2500, tickSpacing: 25, hooks: ZeroAddress };
const SQRT_PRICE = 193888217682943942625070850n;
const TICK = -120263;

// tick spacing 25 ranges: above the price, spanning it, below it
const RANGES = [
  [-120000, -110000],
  [-122100, -108200],
  [-127200, -120300],
];

describe("univ4 UI copy", function () {
  it("matches tick math across the range", function () {
    for (const tick of [scripts.MIN_TICK, -887000, -200001, -120263, -1, 0, 1, 50000, 887000, scripts.MAX_TICK]) {
      expect(ui.getSqrtPriceAtTick(tick)).to.equal(scripts.getSqrtPriceAtTick(tick));
      const sqrt = scripts.getSqrtPriceAtTick(tick);
      expect(ui.getTickAtSqrtPrice(sqrt + 7n)).to.equal(scripts.getTickAtSqrtPrice(sqrt + 7n));
    }
  });

  it("matches price encoding and range snapping", function () {
    for (const price of ["0.0003", "0.0004", "0.000478", "0.0005", "0.000597", "0.002", "1"]) {
      expect(ui.encodeSqrtPriceX96(WLBC, USDT, price)).to.equal(encodeSqrtPriceX96(WLBC, USDT, price));
    }
    for (const [min, max] of [
      ["0.0005", "0.002"],
      ["0.0003", "0.000597"],
      ["0.000430", "0.000526"],
    ]) {
      expect(ui.rangeTicks(WLBC, USDT, min, max, 25)).to.deep.equal(scripts.rangeTicks(WLBC, USDT, min, max, 25));
    }
    expect(() => ui.rangeTicks(WLBC, USDT, "0.001", "0.0005", 25)).to.throw();
  });

  it("matches liquidity and amounts on every side of the price", function () {
    const offers = [
      [10_000n * 10n ** 8n, null],
      [null, 10n * 10n ** 6n],
      [123_456_789n, 4_321_000n],
    ];
    for (const [lower, upper] of RANGES) {
      for (const [a0, a1] of offers) {
        let expected;
        try {
          expected = scripts.liquidityForAmounts(SQRT_PRICE, lower, upper, a0, a1);
        } catch {
          expect(() => ui.liquidityForAmounts(SQRT_PRICE, lower, upper, a0, a1)).to.throw();
          continue;
        }
        expect(ui.liquidityForAmounts(SQRT_PRICE, lower, upper, a0, a1)).to.equal(expected);
        expect(ui.amountsForLiquidity(SQRT_PRICE, TICK, lower, upper, expected)).to.deep.equal(
          scripts.amountsForLiquidity(SQRT_PRICE, TICK, lower, upper, expected),
        );
      }
    }
  });

  it("matches the pool id and the app's mint calldata", function () {
    expect(ui.poolId(KEY)).to.equal(scripts.poolId(KEY));
    // Position #485556, minted from the Uniswap app (see test/univ4.js).
    const mint = {
      key: KEY,
      tickLower: -127200,
      tickUpper: -120300,
      liquidity: 159831182224n,
      amount0Max: 731784621295n,
      amount1Max: 113906267n,
      owner: "0x76E2A669f2E1e09109D4A3eB9e216096A3c7c275",
    };
    expect(keccak256(ui.encodeMint(mint))).to.equal(
      "0xa21ef8a1ad45ef80d8cc8575342939f99dd17901a58c89c77f26d46f5e5ff483",
    );
    expect(ui.priceAtTick(TICK, WLBC, USDT)).to.equal(scripts.priceAtTick(TICK, WLBC, USDT));
  });
});
