// Base URL of the bridge functions (DigitalOcean Functions web package), e.g.
// https://faas-xxx.doserverless.co/api/v1/web/<namespace>/bridge
export const BRIDGE_API_URL = (import.meta.env.VITE_BRIDGE_API_URL || "").replace(/\/$/, "");

// Address of the wrapped LBC (wLBC) ERC-20.
export const WLBC_ADDRESS = import.meta.env.VITE_WLBC_ADDRESS || "";

// Address of the Bridge contract that mints and burns wLBC.
export const BRIDGE_ADDRESS = import.meta.env.VITE_BRIDGE_ADDRESS || "";

// Read-only Ethereum RPC endpoint. Used to query contracts without a
// connected wallet. Falls back to the injected wallet provider when unset.
export const ETH_RPC_URL = import.meta.env.VITE_ETH_RPC_URL || "";
