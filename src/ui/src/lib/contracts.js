import { ethers } from "ethers";
import { ETH_RPC_URL } from "../config/constants";

export const BRIDGE_ABI = [
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

export async function getSigner() {
	if (!window.ethereum) throw new Error("No wallet found. Install MetaMask or another browser wallet.");
	return new ethers.BrowserProvider(window.ethereum).getSigner();
}

/** Ask the wallet to switch to `chainId` when it is on another chain. */
export async function ensureChain(chainId) {
	if (!chainId || !window.ethereum) return;
	const current = Number(await window.ethereum.request({ method: "eth_chainId" }));
	if (current === Number(chainId)) return;
	await window.ethereum.request({
		method: "wallet_switchEthereumChain",
		params: [{ chainId: "0x" + Number(chainId).toString(16) }],
	});
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
