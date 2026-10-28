// Creates a wLBC/USDC or wLBC/USDT Uniswap V3 pool on Ethereum mainnet at a
// chosen starting price and adds a full-range position from the deployer's wallet.
//
//   POOL_QUOTE=USDC POOL_PRICE=0.01 POOL_WLBC=10000 LP_RECIPIENT=0x... \
//     npx hardhat run scripts/create-pool.js --network mainnet             # plan only
//   ... CONFIRM=1 npx hardhat run scripts/create-pool.js --network mainnet # send
//
// Rehearse first on a mainnet fork as the real deployer (sends nothing):
//
//   DRY_RUN=1 FORK=1 POOL_QUOTE=... POOL_PRICE=... POOL_WLBC=... LP_RECIPIENT=... \
//     npx hardhat run scripts/create-pool.js
//
//   POOL_QUOTE    USDC or USDT, the token wLBC is paired with
//   POOL_PRICE    POOL_QUOTE per wLBC, decimal string (e.g. "0.0125")
//   POOL_WLBC     wLBC to deposit, decimal string; the quote side is derived from the price
//   LP_RECIPIENT  address that receives the position NFT (the LP custodian, not the hot key)
//
// The deployer must hold both the wLBC (wrapped through the bridge, so it stays
// 1:1 backed) and the quote token. Running it twice is safe: the pool is only
// created and initialized if it does not exist, and an existing pool whose
// price is off from POOL_PRICE aborts the run instead of depositing into it.
// Every wLBC pool already on Uniswap V2 or V3 against either quote is listed
// first; another pool in the same pair stops the run unless ALLOW_OTHER_POOLS=1.
const { ethers, network } = require("hardhat");
const {
  TICK_SPACING,
  encodeSqrtPriceX96,
  fullRangeTicks,
  lessBps,
  priceDeviationBps,
  quoteForBase,
  sortTokens,
} = require("./lib/univ3");

// Ethereum mainnet.
const WLBC = { symbol: "wLBC", address: "0xB0F2C4f8b7c0f088f7844947EcBf1220bFCa08C1", decimals: 8 };
const QUOTES = {
  USDC: { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  USDT: { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
};
const UNISWAP_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f8346EA31984F984";
const POSITION_MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
const UNISWAP_V2_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";

const FEE = 10000; // 1%, the long-tail tier
const SLIPPAGE_BPS = 100; // mint minimums: 1% under the desired amounts
const MAX_EXISTING_DEVIATION_BPS = 100; // refuse an existing pool more than 1% off
const DEADLINE_SECONDS = 20 * 60;

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  // No `returns`: USDT's approve returns nothing, and the result isn't read.
  "function approve(address spender, uint256 amount)",
];
const FACTORY_ABI = ["function getPool(address, address, uint24) view returns (address)"];
const V2_FACTORY_ABI = ["function getPair(address, address) view returns (address)"];
const POOL_ABI = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)",
];
const POSITION_MANAGER_ABI = [
  "function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160 sqrtPriceX96) payable returns (address pool)",
  "function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) params) payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  "event IncreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required (see the header of scripts/create-pool.js)`);
  return value;
}

// USDT reverts when an allowance moves from non-zero to another non-zero
// value, so an existing short allowance is cleared before the new one is set.
async function ensureAllowance(token, owner, spender, amount, symbol) {
  const current = await token.allowance(owner, spender);
  if (current >= amount) return;
  if (current > 0n) {
    console.log(`approve ${symbol} 0 (reset)`);
    await (await token.approve(spender, 0n)).wait();
  }
  console.log(`approve ${symbol} ${amount}`);
  await (await token.approve(spender, amount)).wait();
}

async function main() {
  const quoteSymbol = requireEnv("POOL_QUOTE");
  const QUOTE = QUOTES[quoteSymbol];
  if (!QUOTE) throw new Error(`POOL_QUOTE must be one of ${Object.keys(QUOTES).join(", ")}, got "${quoteSymbol}"`);
  const price = requireEnv("POOL_PRICE");
  const wlbcRaw = ethers.parseUnits(requireEnv("POOL_WLBC"), WLBC.decimals);
  const recipient = ethers.getAddress(requireEnv("LP_RECIPIENT"));
  const send = network.name === "hardhat" || process.env.CONFIRM === "1";

  const [deployer] = await ethers.getSigners();
  const provider = ethers.provider;

  // On a fork the chain id is Hardhat's, so check for the contracts instead.
  for (const [label, address] of [
    ["wLBC", WLBC.address],
    ...Object.values(QUOTES).map((q) => [q.symbol, q.address]),
    ["Uniswap V3 factory", UNISWAP_V3_FACTORY],
    ["Uniswap V2 factory", UNISWAP_V2_FACTORY],
    ["position manager", POSITION_MANAGER],
  ]) {
    if ((await provider.getCode(address)) === "0x") {
      throw new Error(`no ${label} at ${address}: run against mainnet or a mainnet fork (FORK=1)`);
    }
  }

  const contracts = {};
  for (const meta of [WLBC, ...Object.values(QUOTES)]) {
    const token = new ethers.Contract(meta.address, ERC20_ABI, deployer);
    const decimals = Number(await token.decimals());
    if (decimals !== meta.decimals) throw new Error(`${meta.symbol} has ${decimals} decimals, expected ${meta.decimals}`);
    contracts[meta.symbol] = token;
  }
  const wlbc = contracts[WLBC.symbol];
  const quote = contracts[QUOTE.symbol];
  const holdings = async (pool, quoteMeta) => {
    const [w, q] = await Promise.all([wlbc.balanceOf(pool), contracts[quoteMeta.symbol].balanceOf(pool)]);
    return `${ethers.formatUnits(w, WLBC.decimals)} wLBC + ${ethers.formatUnits(q, quoteMeta.decimals)} ${quoteMeta.symbol}`;
  };

  const quoteRaw = quoteForBase(WLBC, QUOTE, price, wlbcRaw);
  const sqrtPriceX96 = encodeSqrtPriceX96(WLBC, QUOTE, price);
  const { tickLower, tickUpper } = fullRangeTicks(FEE);
  const [token0, token1] = sortTokens(WLBC, QUOTE);
  const amount0 = token0 === WLBC ? wlbcRaw : quoteRaw;
  const amount1 = token0 === WLBC ? quoteRaw : wlbcRaw;

  const factory = new ethers.Contract(UNISWAP_V3_FACTORY, FACTORY_ABI, provider);
  const v2Factory = new ethers.Contract(UNISWAP_V2_FACTORY, V2_FACTORY_ABI, provider);

  // Anyone holding wLBC can open a pool, so survey every V3 tier and V2 for
  // both quotes before adding a market. V4 pools live in a singleton keyed by
  // hook address and can't be enumerated here; check app.uniswap.org for those.
  const found = [];
  for (const quoteMeta of Object.values(QUOTES)) {
    for (const fee of Object.keys(TICK_SPACING).map(Number)) {
      const pool = await factory.getPool(WLBC.address, quoteMeta.address, fee);
      if (pool !== ethers.ZeroAddress) found.push({ quoteMeta, fee, label: `V3 ${fee / 10000}%`, pool });
    }
    const pair = await v2Factory.getPair(WLBC.address, quoteMeta.address);
    if (pair !== ethers.ZeroAddress) found.push({ quoteMeta, fee: null, label: "V2", pool: pair });
  }
  for (const f of found) f.holds = await holdings(f.pool, f.quoteMeta);

  const target = found.find((f) => f.quoteMeta === QUOTE && f.fee === FEE);
  const samePair = found.filter((f) => f.quoteMeta === QUOTE && f !== target);
  let poolState = "none (will be created)";
  if (target) {
    const [current] = await new ethers.Contract(target.pool, POOL_ABI, provider).slot0();
    if (current === 0n) {
      poolState = `${target.pool} (exists, not initialized), holds ${target.holds}`;
    } else {
      const deviation = priceDeviationBps(current, sqrtPriceX96);
      poolState = `${target.pool} (initialized, ${deviation} bps from POOL_PRICE), holds ${target.holds}`;
      if (deviation > MAX_EXISTING_DEVIATION_BPS) {
        throw new Error(`pool ${target.pool} already trades ${deviation} bps away from ${price}; not depositing`);
      }
    }
  }

  const [wlbcBalance, quoteBalance] = await Promise.all([
    wlbc.balanceOf(deployer.address),
    quote.balanceOf(deployer.address),
  ]);

  console.log(`network             ${network.name}`);
  console.log(`deployer            ${deployer.address}`);
  console.log(`pair                ${token0.symbol}/${token1.symbol} (token0/token1), fee ${FEE / 10000}%`);
  console.log(`price               ${price} ${QUOTE.symbol} per wLBC`);
  console.log(`sqrtPriceX96        ${sqrtPriceX96}`);
  console.log(`range               full, ticks ${tickLower} .. ${tickUpper}`);
  console.log(`deposit             ${ethers.formatUnits(wlbcRaw, WLBC.decimals)} wLBC + ${ethers.formatUnits(quoteRaw, QUOTE.decimals)} ${QUOTE.symbol}`);
  console.log(`balances            ${ethers.formatUnits(wlbcBalance, WLBC.decimals)} wLBC, ${ethers.formatUnits(quoteBalance, QUOTE.decimals)} ${QUOTE.symbol}`);
  console.log(`this pool           ${poolState}`);
  for (const f of found) {
    if (f === target) continue;
    console.log(`other wLBC pool     wLBC/${f.quoteMeta.symbol} ${f.label} ${f.pool} holds ${f.holds}`);
  }
  if (found.length === 0) console.log("other wLBC pools    none on V2 or V3");
  if (samePair.length > 0 && process.env.ALLOW_OTHER_POOLS !== "1") {
    throw new Error(`wLBC/${QUOTE.symbol} already trades elsewhere (above); rerun with ALLOW_OTHER_POOLS=1 to add this pool anyway`);
  }
  console.log(`position NFT to     ${recipient}`);

  const short = [];
  if (wlbcBalance < wlbcRaw) short.push("wLBC");
  if (quoteBalance < quoteRaw) short.push(QUOTE.symbol);
  if (short.length > 0) throw new Error(`deployer holds too little ${short.join(" and ")}`);
  if (quoteRaw === 0n) throw new Error(`${QUOTE.symbol} side rounds to 0: raise POOL_WLBC or POOL_PRICE`);

  if (!send) {
    console.log("\nplan only; rerun with CONFIRM=1 to send");
    return;
  }

  await ensureAllowance(wlbc, deployer.address, POSITION_MANAGER, wlbcRaw, "wLBC");
  await ensureAllowance(quote, deployer.address, POSITION_MANAGER, quoteRaw, QUOTE.symbol);

  const manager = new ethers.Contract(POSITION_MANAGER, POSITION_MANAGER_ABI, deployer);
  console.log("createAndInitializePoolIfNecessary");
  await (
    await manager.createAndInitializePoolIfNecessary(token0.address, token1.address, FEE, sqrtPriceX96)
  ).wait();
  const pool = await factory.getPool(token0.address, token1.address, FEE);

  const deadline = (await provider.getBlock("latest")).timestamp + DEADLINE_SECONDS;
  console.log("mint");
  const receipt = await (
    await manager.mint({
      token0: token0.address,
      token1: token1.address,
      fee: FEE,
      tickLower,
      tickUpper,
      amount0Desired: amount0,
      amount1Desired: amount1,
      amount0Min: lessBps(amount0, SLIPPAGE_BPS),
      amount1Min: lessBps(amount1, SLIPPAGE_BPS),
      recipient,
      deadline,
    })
  ).wait();

  const event = receipt.logs
    .map((log) => {
      try {
        return manager.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed && parsed.name === "IncreaseLiquidity");
  if (!event) throw new Error(`mint ${receipt.hash} emitted no IncreaseLiquidity event`);

  console.log(`\npool                ${pool}`);
  console.log(`position id         ${event.args.tokenId}`);
  console.log(`liquidity           ${event.args.liquidity}`);
  console.log(`used                ${event.args.amount0} ${token0.symbol} raw, ${event.args.amount1} ${token1.symbol} raw`);
  console.log(`mint tx             ${receipt.hash}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
