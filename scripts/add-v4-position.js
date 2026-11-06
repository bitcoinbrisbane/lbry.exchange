// Opens a new position in the wLBC/USDT Uniswap V4 pool (0.25%, tick spacing
// 25, no hooks) over a price range you choose, paid for and signed by the key
// in LP_PRIVATE_KEY.
//
//   POS_MIN_PRICE=0.0004 POS_MAX_PRICE=0.000597 POS_USDT=50 \
//     npx hardhat run scripts/add-v4-position.js --network mainnet             # plan only
//   ... CONFIRM=1 npx hardhat run scripts/add-v4-position.js --network mainnet # send
//
// Rehearse on a mainnet fork first; the LP key keeps its real balances there and
// is given gas, and nothing reaches mainnet:
//
//   FORK=1 POS_MIN_PRICE=... POS_MAX_PRICE=... POS_USDT=... npx hardhat run scripts/add-v4-position.js
//
//   LP_PRIVATE_KEY  key that pays for and signs the position (root .env)
//   POS_MIN_PRICE   USDT per wLBC, decimal string; widened down to the tick spacing
//   POS_MAX_PRICE   USDT per wLBC, decimal string; widened up to the tick spacing
//   POS_WLBC        most wLBC to deposit, decimal string (optional)
//   POS_USDT        most USDT to deposit, decimal string (optional)
//   POS_OWNER       address that receives the position NFT (default: the LP key's address)
//
// A range wholly above the current price takes wLBC only and one below takes
// USDT only. A range spanning the price takes both in the ratio the price sets:
// give either amount and the other is derived, or both and the smaller decides.
// Tokens are paid through Permit2, as the Uniswap app does, and the mint is the
// same MINT_POSITION + SETTLE_PAIR the app sends (see test/univ4.js).
const { ethers, network } = require("hardhat");
const {
  amountsForLiquidity,
  encodeMint,
  liquidityForAmounts,
  poolId,
  priceAtTick,
  rangeTicks,
} = require("./lib/univ4");

// Ethereum mainnet.
const WLBC = { symbol: "wLBC", address: "0xB0F2C4f8b7c0f088f7844947EcBf1220bFCa08C1", decimals: 8 };
const USDT = { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 };
const POOL_MANAGER = "0x000000000004444c5dc75cB358380D2e3dE08A90";
const POSITION_MANAGER = "0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e";
const STATE_VIEW = "0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227";
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

// wLBC sorts before USDT, so it is currency0 and prices are USDT per wLBC.
const POOL_KEY = {
  currency0: WLBC.address,
  currency1: USDT.address,
  fee: 2500,
  tickSpacing: 25,
  hooks: ethers.ZeroAddress,
};
const POOL_ID = "0xb94ad38df39255149c9491e1f28152989db850a9a47acf5b2eb6139ef437eba1";

const SLIPPAGE_BPS = 100; // a range spanning the price may take up to 1% more of either side
const DEADLINE_SECONDS = 20 * 60;
const PERMIT2_EXPIRY_SECONDS = 60 * 60; // the Permit2 allowance lapses after an hour
const MIN_GAS_ETH = ethers.parseEther("0.001");

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  // No `returns`: USDT's approve returns nothing, and the result isn't read.
  "function approve(address spender, uint256 amount)",
];
const PERMIT2_ABI = [
  "function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
];
const STATE_VIEW_ABI = [
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128)",
];
const POSITION_MANAGER_ABI = [
  "function modifyLiquidities(bytes unlockData, uint256 deadline) payable",
  "event Transfer(address indexed from, address indexed to, uint256 indexed id)",
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required (see the header of scripts/add-v4-position.js)`);
  return value;
}

const optionalAmount = (name, decimals) => (process.env[name] ? ethers.parseUnits(process.env[name], decimals) : null);
const fmt = (raw, token) => `${ethers.formatUnits(raw, token.decimals)} ${token.symbol}`;

// USDT reverts when an allowance moves from non-zero to another non-zero
// value, so an existing short allowance is cleared before the new one is set.
async function ensureAllowance(token, owner, spender, amount, symbol) {
  const current = await token.allowance(owner, spender);
  if (current >= amount) return;
  if (current > 0n) {
    console.log(`approve ${symbol} to Permit2: 0 (reset)`);
    await (await token.approve(spender, 0n)).wait();
  }
  console.log(`approve ${symbol} to Permit2: ${amount}`);
  await (await token.approve(spender, amount)).wait();
}

async function main() {
  const minPrice = requireEnv("POS_MIN_PRICE");
  const maxPrice = requireEnv("POS_MAX_PRICE");
  const offered0 = optionalAmount("POS_WLBC", WLBC.decimals);
  const offered1 = optionalAmount("POS_USDT", USDT.decimals);
  if (offered0 == null && offered1 == null) throw new Error("set POS_WLBC, POS_USDT or both");
  const send = network.name === "hardhat" || process.env.CONFIRM === "1";

  const provider = ethers.provider;
  let key = requireEnv("LP_PRIVATE_KEY");
  if (!key.startsWith("0x")) key = `0x${key}`;
  const lp = new ethers.Wallet(key, provider);
  const owner = process.env.POS_OWNER ? ethers.getAddress(process.env.POS_OWNER) : lp.address;

  // On a fork the chain id is Hardhat's, so check for the contracts instead.
  for (const [label, address] of [
    ["wLBC", WLBC.address],
    ["USDT", USDT.address],
    ["pool manager", POOL_MANAGER],
    ["position manager", POSITION_MANAGER],
    ["state view", STATE_VIEW],
    ["Permit2", PERMIT2],
  ]) {
    if ((await provider.getCode(address)) === "0x") {
      throw new Error(`no ${label} at ${address}: run against mainnet or a mainnet fork (FORK=1)`);
    }
  }
  if (poolId(POOL_KEY) !== POOL_ID) throw new Error("pool key does not hash to the wLBC/USDT pool id");

  if (network.name === "hardhat" && (await provider.getBalance(lp.address)) < ethers.parseEther("1")) {
    // Rehearsal only: gas money on the fork, so the run doesn't depend on the key's real ETH.
    await provider.send("hardhat_setBalance", [lp.address, ethers.toQuantity(ethers.parseEther("1"))]);
  }

  const stateView = new ethers.Contract(STATE_VIEW, STATE_VIEW_ABI, provider);
  const [{ sqrtPriceX96, tick }, poolLiquidity] = await Promise.all([
    stateView.getSlot0(POOL_ID),
    stateView.getLiquidity(POOL_ID),
  ]);
  if (sqrtPriceX96 === 0n) throw new Error("the pool is not initialized");
  const currentTick = Number(tick);

  const { tickLower, tickUpper } = rangeTicks(WLBC, USDT, minPrice, maxPrice, POOL_KEY.tickSpacing);
  const liquidity = liquidityForAmounts(sqrtPriceX96, tickLower, tickUpper, offered0, offered1);
  if (liquidity === 0n) throw new Error("the amounts are too small to add any liquidity");
  const { amount0, amount1 } = amountsForLiquidity(sqrtPriceX96, currentTick, tickLower, tickUpper, liquidity);
  const inRange = currentTick >= tickLower && currentTick < tickUpper;

  const wlbc = new ethers.Contract(WLBC.address, ERC20_ABI, lp);
  const usdt = new ethers.Contract(USDT.address, ERC20_ABI, lp);
  const [balance0, balance1, gas] = await Promise.all([
    wlbc.balanceOf(lp.address),
    usdt.balanceOf(lp.address),
    provider.getBalance(lp.address),
  ]);

  // Out of range, the cost is fixed until the price enters the range, and then the
  // other side turns non-zero and the zero maximum stops the mint. In range, allow
  // SLIPPAGE_BPS for the price moving before the transaction lands, within the balance.
  const withSlippage = (amount, balance) => {
    if (!inRange || amount === 0n) return amount;
    const padded = amount + (amount * BigInt(SLIPPAGE_BPS)) / 10000n;
    return padded < balance ? padded : balance;
  };
  const amount0Max = withSlippage(amount0, balance0);
  const amount1Max = withSlippage(amount1, balance1);

  const where = inRange
    ? "spans the current price"
    : currentTick < tickLower
      ? "above the price: wLBC only"
      : "below the price: USDT only";
  console.log(`network             ${network.name}`);
  console.log(`LP key              ${lp.address}`);
  console.log(`position NFT to     ${owner}`);
  console.log(`pool                wLBC/USDT 0.25% V4 ${POOL_ID}`);
  console.log(
    `current price       ${priceAtTick(currentTick, WLBC, USDT).toPrecision(6)} USDT per wLBC (tick ${currentTick}), in-range liquidity ${poolLiquidity}`,
  );
  console.log(
    `range               ${priceAtTick(tickLower, WLBC, USDT).toPrecision(6)} .. ${priceAtTick(tickUpper, WLBC, USDT).toPrecision(6)} USDT per wLBC (ticks ${tickLower} .. ${tickUpper}), ${where}`,
  );
  console.log(`liquidity           ${liquidity}`);
  console.log(`deposit             ${fmt(amount0, WLBC)} + ${fmt(amount1, USDT)}`);
  console.log(`at most             ${fmt(amount0Max, WLBC)} + ${fmt(amount1Max, USDT)}`);
  console.log(`LP balances         ${fmt(balance0, WLBC)}, ${fmt(balance1, USDT)}, ${ethers.formatEther(gas)} ETH`);
  if (offered0 != null && amount0 === 0n)
    console.log("note                POS_WLBC unused: this range takes no wLBC at the current price");
  if (offered1 != null && amount1 === 0n)
    console.log("note                POS_USDT unused: this range takes no USDT at the current price");

  const short = [];
  if (balance0 < amount0) short.push("wLBC");
  if (balance1 < amount1) short.push("USDT");
  if (short.length > 0) throw new Error(`the LP key holds too little ${short.join(" and ")}`);
  if (gas < MIN_GAS_ETH)
    throw new Error(`the LP key has ${ethers.formatEther(gas)} ETH; it needs gas for the approvals and the mint`);

  if (!send) {
    console.log("\nplan only; rerun with CONFIRM=1 to send");
    return;
  }

  // Tokens -> Permit2 (ERC-20 allowance) -> position manager (Permit2 allowance, with expiry).
  const permit2 = new ethers.Contract(PERMIT2, PERMIT2_ABI, lp);
  const now = (await provider.getBlock("latest")).timestamp;
  for (const [token, meta, max] of [
    [wlbc, WLBC, amount0Max],
    [usdt, USDT, amount1Max],
  ]) {
    if (max === 0n) continue;
    await ensureAllowance(token, lp.address, PERMIT2, max, meta.symbol);
    const current = await permit2.allowance(lp.address, meta.address, POSITION_MANAGER);
    // Renew unless the existing allowance covers the amount and outlives the mint deadline.
    if (current.amount < max || Number(current.expiration) < now + DEADLINE_SECONDS) {
      console.log(`permit2 approve ${meta.symbol} to position manager: ${max}`);
      await (await permit2.approve(meta.address, POSITION_MANAGER, max, now + PERMIT2_EXPIRY_SECONDS)).wait();
    }
  }

  const manager = new ethers.Contract(POSITION_MANAGER, POSITION_MANAGER_ABI, lp);
  const unlockData = encodeMint({ key: POOL_KEY, tickLower, tickUpper, liquidity, amount0Max, amount1Max, owner });
  const deadline = (await provider.getBlock("latest")).timestamp + DEADLINE_SECONDS;
  console.log("modifyLiquidities (mint)");
  const receipt = await (await manager.modifyLiquidities(unlockData, deadline)).wait();

  const minted = receipt.logs
    .filter((log) => log.address.toLowerCase() === POSITION_MANAGER.toLowerCase())
    .map((log) => manager.interface.parseLog(log))
    .find((parsed) => parsed && parsed.name === "Transfer" && parsed.args.from === ethers.ZeroAddress);
  if (!minted) throw new Error(`mint ${receipt.hash} emitted no position NFT`);
  const [after0, after1] = await Promise.all([wlbc.balanceOf(lp.address), usdt.balanceOf(lp.address)]);

  console.log(`\nposition id         ${minted.args.id}`);
  console.log(`owner               ${minted.args.to}`);
  console.log(`paid                ${fmt(balance0 - after0, WLBC)} + ${fmt(balance1 - after1, USDT)}`);
  console.log(`mint tx             ${receipt.hash}`);
  console.log(`uniswap             https://app.uniswap.org/positions/v4/ethereum/${minted.args.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
