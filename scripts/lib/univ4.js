// Uniswap V4 position math and calldata for scripts/add-v4-position.js. The
// math is ported line for line from v4-core (TickMath, SqrtPriceMath) and
// v4-periphery (LiquidityAmounts), in BigInt, so the amounts printed in the
// plan are the amounts the PoolManager will take.
const { AbiCoder, hexlify, keccak256 } = require("ethers");
const { encodeSqrtPriceX96 } = require("./univ3");

const Q96 = 2n ** 96n;
const MIN_TICK = -887272;
const MAX_TICK = 887272;
const MAX_UINT256 = 2n ** 256n - 1n;

// v4-periphery src/libraries/Actions.sol
const ACTIONS = { MINT_POSITION: 0x02, SETTLE_PAIR: 0x0d };

const POOL_KEY_TYPE = "tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)";
const coder = AbiCoder.defaultAbiCoder();

const mulDiv = (a, b, d) => (a * b) / d;
const mulDivUp = (a, b, d) => (a * b + d - 1n) / d;

/** TickMath.getSqrtPriceAtTick: sqrt(1.0001^tick) as a Q64.96, rounded up. */
function getSqrtPriceAtTick(tick) {
  if (!Number.isInteger(tick) || tick < MIN_TICK || tick > MAX_TICK) throw new Error(`invalid tick ${tick}`);
  const abs = BigInt(Math.abs(tick));
  let price = abs & 0x1n ? 0xfffcb933bd6fad37aa2d162d1a594001n : 0x100000000000000000000000000000000n;
  const steps = [
    [0x2n, 0xfff97272373d413259a46990580e213an],
    [0x4n, 0xfff2e50f5f656932ef12357cf3c7fdccn],
    [0x8n, 0xffe5caca7e10e4e61c3624eaa0941cd0n],
    [0x10n, 0xffcb9843d60f6159c9db58835c926644n],
    [0x20n, 0xff973b41fa98c081472e6896dfb254c0n],
    [0x40n, 0xff2ea16466c96a3843ec78b326b52861n],
    [0x80n, 0xfe5dee046a99a2a811c461f1969c3053n],
    [0x100n, 0xfcbe86c7900a88aedcffc83b479aa3a4n],
    [0x200n, 0xf987a7253ac413176f2b074cf7815e54n],
    [0x400n, 0xf3392b0822b70005940c7a398e4b70f3n],
    [0x800n, 0xe7159475a2c29b7443b29c7fa6e889d9n],
    [0x1000n, 0xd097f3bdfd2022b8845ad8f792aa5825n],
    [0x2000n, 0xa9f746462d870fdf8a65dc1f90e061e5n],
    [0x4000n, 0x70d869a156d2a1b890bb3df62baf32f7n],
    [0x8000n, 0x31be135f97d08fd981231505542fcfa6n],
    [0x10000n, 0x9aa508b5b7a84e1c677de54f3e99bc9n],
    [0x20000n, 0x5d6af8dedb81196699c329225ee604n],
    [0x40000n, 0x2216e584f5fa1ea926041bedfe98n],
    [0x80000n, 0x48a170391f7dc42444e8fa2n],
  ];
  for (const [bit, factor] of steps) if (abs & bit) price = (price * factor) >> 128n;
  if (tick > 0) price = MAX_UINT256 / price;
  return (price + (1n << 32n) - 1n) >> 32n;
}

/** The tick whose sqrt price is at or just below `sqrtPriceX96` (TickMath.getTickAtSqrtPrice). */
function getTickAtSqrtPrice(sqrtPriceX96) {
  // A float log lands within a tick or two; the BigInt comparisons settle it exactly.
  let tick = Math.floor(Math.log((Number(sqrtPriceX96) / Number(Q96)) ** 2) / Math.log(1.0001));
  tick = Math.min(Math.max(tick, MIN_TICK), MAX_TICK);
  while (tick > MIN_TICK && getSqrtPriceAtTick(tick) > sqrtPriceX96) tick--;
  while (tick < MAX_TICK && getSqrtPriceAtTick(tick + 1) <= sqrtPriceX96) tick++;
  return tick;
}

/**
 * Range ticks for prices given as `quote` per `base` decimal strings, snapped
 * outwards to the tick spacing so the range covers at least what was asked.
 * Only for a pool whose token0 is `base` (wLBC sorts before USDT).
 */
function rangeTicks(base, quote, minPrice, maxPrice, tickSpacing) {
  const lower = getTickAtSqrtPrice(encodeSqrtPriceX96(base, quote, minPrice));
  const upperExact = getTickAtSqrtPrice(encodeSqrtPriceX96(base, quote, maxPrice));
  const tickLower = Math.floor(lower / tickSpacing) * tickSpacing;
  const tickUpper = Math.ceil(upperExact / tickSpacing) * tickSpacing;
  if (tickLower >= tickUpper) throw new Error(`range ${minPrice}..${maxPrice} is empty`);
  if (tickLower < MIN_TICK || tickUpper > MAX_TICK) throw new Error(`range ${minPrice}..${maxPrice} is out of bounds`);
  return { tickLower, tickUpper };
}

/** LiquidityAmounts.getLiquidityForAmount0 */
function liquidityForAmount0(sqrtA, sqrtB, amount0) {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
  return mulDiv(amount0, mulDiv(sqrtA, sqrtB, Q96), sqrtB - sqrtA);
}

/** LiquidityAmounts.getLiquidityForAmount1 */
function liquidityForAmount1(sqrtA, sqrtB, amount1) {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
  return mulDiv(amount1, Q96, sqrtB - sqrtA);
}

/**
 * The most liquidity that `amount0` and `amount1` can fund (null = not
 * offered). A side that the range needs but wasn't offered is derived from
 * the other, so for a range spanning the price either amount is enough.
 */
function liquidityForAmounts(sqrtPriceX96, tickLower, tickUpper, amount0, amount1) {
  const sqrtA = getSqrtPriceAtTick(tickLower);
  const sqrtB = getSqrtPriceAtTick(tickUpper);
  const candidates = [];
  if (sqrtPriceX96 <= sqrtA) {
    if (amount0 == null) throw new Error("the range is above the current price, so it takes wLBC (token0) only");
    candidates.push(liquidityForAmount0(sqrtA, sqrtB, amount0));
  } else if (sqrtPriceX96 < sqrtB) {
    if (amount0 != null) candidates.push(liquidityForAmount0(sqrtPriceX96, sqrtB, amount0));
    if (amount1 != null) candidates.push(liquidityForAmount1(sqrtA, sqrtPriceX96, amount1));
    if (candidates.length === 0) throw new Error("give at least one amount");
  } else {
    if (amount1 == null) throw new Error("the range is below the current price, so it takes USDT (token1) only");
    candidates.push(liquidityForAmount1(sqrtA, sqrtB, amount1));
  }
  return candidates.reduce((a, b) => (a < b ? a : b));
}

/** SqrtPriceMath.getAmount0Delta, rounded up as when adding liquidity. */
function amount0Delta(sqrtA, sqrtB, liquidity) {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
  const n = mulDivUp(liquidity << 96n, sqrtB - sqrtA, sqrtB);
  return (n + sqrtA - 1n) / sqrtA;
}

/** SqrtPriceMath.getAmount1Delta, rounded up as when adding liquidity. */
function amount1Delta(sqrtA, sqrtB, liquidity) {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
  return mulDivUp(liquidity, sqrtB - sqrtA, Q96);
}

/** What adding `liquidity` costs, by the pool's own rule (Pool.modifyLiquidity): which side of the range the tick is on. */
function amountsForLiquidity(sqrtPriceX96, tick, tickLower, tickUpper, liquidity) {
  const sqrtA = getSqrtPriceAtTick(tickLower);
  const sqrtB = getSqrtPriceAtTick(tickUpper);
  if (tick < tickLower) return { amount0: amount0Delta(sqrtA, sqrtB, liquidity), amount1: 0n };
  if (tick < tickUpper) {
    return {
      amount0: amount0Delta(sqrtPriceX96, sqrtB, liquidity),
      amount1: amount1Delta(sqrtA, sqrtPriceX96, liquidity),
    };
  }
  return { amount0: 0n, amount1: amount1Delta(sqrtA, sqrtB, liquidity) };
}

/** PoolId: keccak256 of the ABI-encoded PoolKey. */
function poolId(key) {
  return keccak256(coder.encode([POOL_KEY_TYPE], [key]));
}

/**
 * `unlockData` for PositionManager.modifyLiquidities: MINT_POSITION, then
 * SETTLE_PAIR to pay both currencies through Permit2. The same two actions the
 * Uniswap app sends.
 */
function encodeMint({ key, tickLower, tickUpper, liquidity, amount0Max, amount1Max, owner }) {
  const actions = hexlify(new Uint8Array([ACTIONS.MINT_POSITION, ACTIONS.SETTLE_PAIR]));
  const params = [
    coder.encode(
      [POOL_KEY_TYPE, "int24", "int24", "uint256", "uint128", "uint128", "address", "bytes"],
      [key, tickLower, tickUpper, liquidity, amount0Max, amount1Max, owner, "0x"],
    ),
    coder.encode(["address", "address"], [key.currency0, key.currency1]),
  ];
  return coder.encode(["bytes", "bytes[]"], [actions, params]);
}

/** Human price (`quote` per `base`) at a tick, for display only. */
function priceAtTick(tick, base, quote) {
  return 1.0001 ** tick * 10 ** (base.decimals - quote.decimals);
}

module.exports = {
  ACTIONS,
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
};
