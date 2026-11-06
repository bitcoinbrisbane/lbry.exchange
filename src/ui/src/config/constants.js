// Base URL of the bridge functions (DigitalOcean Functions web package), e.g.
// https://faas-xxx.doserverless.co/api/v1/web/<namespace>/bridge
export const BRIDGE_API_URL = (import.meta.env.VITE_BRIDGE_API_URL || "").replace(/\/$/, "");

// Ethereum mainnet deployments (see README "Deployments"); env overrides for other chains.
export const WLBC_ADDRESS = import.meta.env.VITE_WLBC_ADDRESS || "0xB0F2C4f8b7c0f088f7844947EcBf1220bFCa08C1";
export const BRIDGE_ADDRESS = import.meta.env.VITE_BRIDGE_ADDRESS || "0xa3A3E8304C88b017153bA5dFCCDACCB7116a185f";

// Read-only Ethereum RPC endpoint. Used to query contracts without a
// connected wallet. Falls back to the injected wallet provider when unset.
export const ETH_RPC_URL = import.meta.env.VITE_ETH_RPC_URL || "";

// wLBC trades on Uniswap V4 (mainnet), paired with USDT at the 0.25% tier (README "Liquidity"). The
// links are keyed off the token address so they stay correct as pools are
// added, and the Uniswap token page carries the live price and liquidity.
export const UNISWAP = {
  version: "V4",
  quoteSymbol: "USDT",
  feeTier: "0.25%",
  tokenUrl: `https://app.uniswap.org/explore/tokens/ethereum/${WLBC_ADDRESS.toLowerCase()}`,
  swapUrl: `https://app.uniswap.org/swap?outputCurrency=${WLBC_ADDRESS}&chain=ethereum`,
};

// The wLBC/USDT V4 pool the Supply page adds liquidity to, and the Uniswap contracts it goes through (Ethereum
// mainnet, as in scripts/add-v4-position.js). wLBC sorts before USDT, so it is currency0 and prices are USDT per
// wLBC. The pool key hashes to `poolId`; the Supply page checks that before using it.
export const UNISWAP_V4 = {
  chainId: 1,
  wlbc: { symbol: "wLBC", address: "0xB0F2C4f8b7c0f088f7844947EcBf1220bFCa08C1", decimals: 8 },
  usdt: { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
  poolKey: {
    currency0: "0xB0F2C4f8b7c0f088f7844947EcBf1220bFCa08C1",
    currency1: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    fee: 2500,
    tickSpacing: 25,
    hooks: "0x0000000000000000000000000000000000000000",
  },
  poolId: "0xb94ad38df39255149c9491e1f28152989db850a9a47acf5b2eb6139ef437eba1",
  positionManager: "0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e",
  stateView: "0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  positionUrl: (id) => `https://app.uniswap.org/positions/v4/ethereum/${id}`,
};

// LBC address that pays unwrap network fees (the treasury, m/44'/140'/1'/0/0). Fixed here rather than
// read from the API so a tampered response cannot redirect donations.
export const FEE_ADDRESS = import.meta.env.VITE_FEE_ADDRESS || "bU3qvW4ecNWnnjpZffgGZKBYWaUfGwYP3n";
