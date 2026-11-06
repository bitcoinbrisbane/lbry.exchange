import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { base, baseSepolia, mainnet, sepolia } from "@reown/appkit/networks";
import { createAppKit } from "@reown/appkit/react";
import { SITE_URL } from "../config/pages";

// WalletConnect / Reown project ID (free at https://dashboard.reown.com). Without it the app falls back
// to injected wallets only (desktop extensions and wallet in-app browsers), and mobile browsers cannot connect.
export const REOWN_PROJECT_ID = import.meta.env.VITE_REOWN_PROJECT_ID || "";

// Chains the bridge is deployed to or tested on (hardhat.config.js). Mainnet first: it is the default.
export const NETWORKS = [mainnet, base, sepolia, baseSepolia];

// Trust Wallet and MetaMask first in the modal; the rest of the WalletConnect catalogue follows.
const FEATURED_WALLET_IDS = [
  "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0", // Trust Wallet
  "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96", // MetaMask
  "fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa", // Coinbase Wallet
];

export const appKit = REOWN_PROJECT_ID
  ? createAppKit({
      adapters: [new EthersAdapter()],
      networks: NETWORKS,
      defaultNetwork: mainnet,
      projectId: REOWN_PROJECT_ID,
      metadata: {
        name: "lbry.exchange",
        description: "Wrap LBC to wLBC on Ethereum and back",
        // Must match the domain allow-listed for the project in the Reown dashboard.
        url: typeof window !== "undefined" ? window.location.origin : SITE_URL,
        icons: [`${SITE_URL}/icon-512.png`],
      },
      featuredWalletIds: FEATURED_WALLET_IDS,
      // Wallet connections only: no email/social login, swaps or on-ramp inside the modal.
      features: { analytics: false, email: false, socials: false, swaps: false, onramp: false, history: false },
      themeVariables: { "--w3m-z-index": 2000 },
    })
  : null;
