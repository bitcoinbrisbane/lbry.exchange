// Base URL of the bridge functions (DigitalOcean Functions web package), e.g.
// https://faas-xxx.doserverless.co/api/v1/web/<namespace>/bridge
export const BRIDGE_API_URL = (import.meta.env.VITE_BRIDGE_API_URL || "").replace(/\/$/, "");

// Ethereum mainnet deployments (see README "Deployments"); env overrides for other chains.
export const WLBC_ADDRESS = import.meta.env.VITE_WLBC_ADDRESS || "0xB0F2C4f8b7c0f088f7844947EcBf1220bFCa08C1";
export const BRIDGE_ADDRESS = import.meta.env.VITE_BRIDGE_ADDRESS || "0xa3A3E8304C88b017153bA5dFCCDACCB7116a185f";

// Read-only Ethereum RPC endpoint. Used to query contracts without a
// connected wallet. Falls back to the injected wallet provider when unset.
export const ETH_RPC_URL = import.meta.env.VITE_ETH_RPC_URL || "";

// LBC address that pays unwrap network fees (the treasury, m/44'/140'/1'/0/0). Fixed here rather than
// read from the API so a tampered response cannot redirect donations.
export const FEE_ADDRESS = import.meta.env.VITE_FEE_ADDRESS || "bU3qvW4ecNWnnjpZffgGZKBYWaUfGwYP3n";
