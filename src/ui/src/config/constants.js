// Use environment variable or default to localhost for development
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Maximum LBC allowed per buy order. Configurable via env, defaults to 1000.
export const MAX_LBC = Number(import.meta.env.VITE_MAX_LBC) || 1000;

// Address of the wrapped LBC (wLBC) ERC-20 on Ethereum.
export const WLBC_ADDRESS = import.meta.env.VITE_WLBC_ADDRESS || '';

// Read-only Ethereum RPC endpoint. Used to query the contract without a
// connected wallet. Falls back to the injected wallet provider when unset.
export const ETH_RPC_URL = import.meta.env.VITE_ETH_RPC_URL || ''; 