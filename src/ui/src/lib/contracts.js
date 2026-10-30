import { ethers } from "ethers";
import { BRIDGE_ADDRESS, ETH_RPC_URL } from "../config/constants";

export const BRIDGE_ABI = [
  "function signer() view returns (address)",
  "function wrap(address to, uint256 amount, bytes32 lbcTxid, bytes signature)",
  "function unwrap(uint256 amount, string lbcAddress)",
  "function processed(bytes32 lbcTxid) view returns (bool)",
  "event Unwrap(uint256 indexed id, address indexed from, uint256 amount, string lbcAddress)",
];

export const TOKEN_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)",
];

/** A provider that works without a connected wallet: the configured RPC, else the injected one. */
export function getReadProvider() {
  if (ETH_RPC_URL) return new ethers.JsonRpcProvider(ETH_RPC_URL);
  if (typeof window !== "undefined" && window.ethereum) return new ethers.BrowserProvider(window.ethereum);
  return null;
}

/** Mirrors depositAddressMessage in src/functions/src/lib/eth.ts; the two must match exactly. */
export function depositAddressMessage({ chainId, bridgeAddress, ethAddress, depositAddress }) {
  return [
    "lbry.exchange deposit address",
    `LBC address: ${depositAddress}`,
    `Mints wLBC to: ${ethers.getAddress(ethAddress)}`,
    `Bridge: ${ethers.getAddress(bridgeAddress)}`,
    `Chain: ${chainId}`,
  ].join("\n");
}

/** A deposit address whose signature does not recover to Bridge.signer(). */
export class UnsignedAddressError extends Error {}

/**
 * Throws unless `signature` shows Bridge.signer() handed out `depositAddress` for
 * `ethAddress`. The bridge address is this build's own and the signer and chain are
 * read from Ethereum, so nothing here trusts the API that returned the address.
 */
export async function verifyDepositAddress({ ethAddress, depositAddress, signature }) {
  const provider = getReadProvider();
  if (!provider) throw new Error("No Ethereum connection to check the deposit address against");
  const bridge = new ethers.Contract(BRIDGE_ADDRESS, BRIDGE_ABI, provider);
  const [{ chainId }, signer] = await Promise.all([provider.getNetwork(), bridge.signer()]);
  const message = depositAddressMessage({ chainId, bridgeAddress: BRIDGE_ADDRESS, ethAddress, depositAddress });
  let recovered = null;
  try {
    recovered = ethers.verifyMessage(message, signature);
  } catch {
    // Malformed signature: same outcome as a wrong one.
  }
  if (!recovered || recovered.toLowerCase() !== signer.toLowerCase()) {
    throw new UnsignedAddressError("This deposit address is not signed by the bridge. Do not send LBC to it.");
  }
}

/** A signer from the connected wallet's EIP-1193 provider (WalletConnect or injected). */
export async function getSigner(walletProvider) {
  if (!walletProvider) throw new Error("Connect a wallet first.");
  return new ethers.BrowserProvider(walletProvider).getSigner();
}

const EXPLORERS = {
  1: "https://etherscan.io",
  11155111: "https://sepolia.etherscan.io",
  8453: "https://basescan.org",
  84532: "https://sepolia.basescan.org",
};

export function ethTxUrl(chainId, hash) {
  const base = EXPLORERS[Number(chainId)];
  return base ? `${base}/tx/${hash}` : null;
}

export const lbcTxUrl = (txid) => `https://explorer.lbry.com/tx/${txid}`;
export const lbcAddressUrl = (address) => `https://explorer.lbry.com/address/${address}`;

/**
 * Ask the wallet to track wLBC (EIP-747 wallet_watchAsset). Resolves true when the
 * user accepts. Wallets that already track the token simply confirm again.
 */
export async function addTokenToWallet(tokenAddress, walletProvider) {
  if (!walletProvider) throw new Error("Connect a wallet first.");
  return walletProvider.request({
    method: "wallet_watchAsset",
    params: {
      type: "ERC20",
      options: {
        address: tokenAddress,
        symbol: "wLBC",
        decimals: 8,
        image: `${window.location.origin}/icon-512.png`,
      },
    },
  });
}

export const ethAddressUrl = (chainId, address) => {
  const base = EXPLORERS[Number(chainId)];
  return base ? `${base}/token/${address}` : null;
};

export const ethContractUrl = (chainId, address) => {
  const base = EXPLORERS[Number(chainId)];
  return base ? `${base}/address/${address}` : null;
};
