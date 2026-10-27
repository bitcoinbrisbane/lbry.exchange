// Pure Uniswap V3 math for creating the wLBC pool. No chain access, no
// floating point: prices are decimal strings and everything else is BigInt,
// so the starting price lands exactly where the operator asked.

const Q96 = 2n ** 96n;
const Q192 = Q96 * Q96;
const MIN_TICK = -887272;
const MAX_TICK = 887272;

/** Tick spacing per fee tier (hundredths of a bip), as enabled on mainnet. */
const TICK_SPACING = { 100: 1, 500: 10, 3000: 60, 10000: 200 };

/** Integer square root (floor) of a non-negative BigInt. */
function isqrt(n) {
  if (n < 0n) throw new Error("isqrt: negative input");
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

/** Parse a positive decimal string ("0.0125") into { num, den } BigInts. */
function parseDecimal(value) {
  if (typeof value !== "string" || !/^\d+(\.\d+)?$/.test(value)) {
    throw new Error(`parseDecimal: "${value}" is not a positive decimal string`);
  }
  const [whole, frac = ""] = value.split(".");
  const num = BigInt(whole + frac);
  if (num === 0n) throw new Error("parseDecimal: price must be greater than 0");
  return { num, den: 10n ** BigInt(frac.length) };
}

/** Uniswap orders a pool's tokens by address; token0 is the lower one. */
function sortTokens(a, b) {
  const x = BigInt(a.address);
  const y = BigInt(b.address);
  if (x === y) throw new Error("sortTokens: identical addresses");
  return x < y ? [a, b] : [b, a];
}

/**
 * sqrtPriceX96 for a pool where one `base` token is worth `price` `quote`
 * tokens (human units, e.g. price "0.01" = 1 wLBC costs 0.01 USDT).
 *
 * Pool price is token1 per token0 in raw units, so the decimals of both tokens
 * enter the ratio: raw = price * 10^quoteDecimals / 10^baseDecimals, inverted
 * when the base token sorts second.
 */
function encodeSqrtPriceX96(base, quote, price) {
  const { num, den } = parseDecimal(price);
  const [token0] = sortTokens(base, quote);
  // ratio = token1Raw / token0Raw as numerator / denominator.
  let n = num * 10n ** BigInt(quote.decimals);
  let d = den * 10n ** BigInt(base.decimals);
  if (token0.address.toLowerCase() !== base.address.toLowerCase()) [n, d] = [d, n];
  return isqrt((n * Q192) / d);
}

/** The widest ticks usable at `fee`, i.e. a full-range position. */
function fullRangeTicks(fee) {
  const spacing = TICK_SPACING[fee];
  if (!spacing) throw new Error(`fullRangeTicks: fee ${fee} is not an enabled tier`);
  // `+ 0` turns the -0 that Math.ceil gives for small negatives into 0.
  return {
    tickLower: Math.ceil(MIN_TICK / spacing) * spacing + 0,
    tickUpper: Math.floor(MAX_TICK / spacing) * spacing,
  };
}

/** Raw quote amount worth `baseRaw` raw base units at `price`, rounded down. */
function quoteForBase(base, quote, price, baseRaw) {
  const { num, den } = parseDecimal(price);
  return (baseRaw * num * 10n ** BigInt(quote.decimals)) / (den * 10n ** BigInt(base.decimals));
}

/** `amount` less `bps` basis points, for mint slippage minimums. */
function lessBps(amount, bps) {
  return (amount * BigInt(10000 - bps)) / 10000n;
}

/**
 * How far an existing pool's price is from the intended one, in basis points
 * of price (sqrt prices are squared before comparing).
 */
function priceDeviationBps(actualSqrtX96, expectedSqrtX96) {
  const a = actualSqrtX96 * actualSqrtX96;
  const e = expectedSqrtX96 * expectedSqrtX96;
  const diff = a > e ? a - e : e - a;
  return Number((diff * 10000n) / e);
}

module.exports = {
  Q96,
  MIN_TICK,
  MAX_TICK,
  TICK_SPACING,
  isqrt,
  parseDecimal,
  sortTokens,
  encodeSqrtPriceX96,
  fullRangeTicks,
  quoteForBase,
  lessBps,
  priceDeviationBps,
};
