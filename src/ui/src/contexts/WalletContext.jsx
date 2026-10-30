import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAppKit, useAppKitAccount, useAppKitNetwork, useAppKitProvider, useDisconnect } from "@reown/appkit/react";
import { ethers } from "ethers";
import { NETWORKS, appKit } from "../lib/appkit";

/**
 * Wallet state shared by every page:
 *   address, isConnecting, error, connectWallet(), disconnectWallet(),
 *   walletProvider (EIP-1193, for ethers.BrowserProvider), ensureChain(chainId).
 *
 * With a Reown project ID this is backed by AppKit (WalletConnect): mobile browsers connect to
 * Trust Wallet, MetaMask Mobile and other wallets by deep link or QR code, and desktop extensions
 * still connect directly. Without one, only an injected window.ethereum wallet works.
 */
const WalletContext = createContext(null);

function AppKitWalletProvider({ children }) {
  const { open } = useAppKit();
  const { address, status } = useAppKitAccount({ namespace: "eip155" });
  const { walletProvider } = useAppKitProvider("eip155");
  const { chainId, switchNetwork } = useAppKitNetwork();
  const { disconnect } = useDisconnect();
  const [error, setError] = useState(null);

  const connectWallet = useCallback(async () => {
    setError(null);
    try {
      await open({ view: "Connect", namespace: "eip155" });
    } catch (err) {
      setError("Failed to open the wallet picker");
      console.error(err);
    }
  }, [open]);

  const disconnectWallet = useCallback(async () => {
    setError(null);
    try {
      await disconnect();
    } catch (err) {
      console.error("Error disconnecting wallet:", err);
    }
  }, [disconnect]);

  // Switch through AppKit rather than wallet_switchEthereumChain so WalletConnect sessions
  // (which only carry the chains approved at connect time) switch reliably.
  const ensureChain = useCallback(
    async (wanted) => {
      if (!wanted || Number(chainId) === Number(wanted)) return;
      const network = NETWORKS.find((n) => Number(n.id) === Number(wanted));
      if (!network) throw new Error(`Chain ${wanted} is not supported by this site`);
      await switchNetwork(network);
    },
    [chainId, switchNetwork],
  );

  const value = useMemo(
    () => ({
      address: address || null,
      isConnecting: status === "connecting" || status === "reconnecting",
      error,
      connectWallet,
      disconnectWallet,
      walletProvider: address ? walletProvider : null,
      ensureChain,
    }),
    [address, status, error, connectWallet, disconnectWallet, walletProvider, ensureChain],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

/** Fallback when VITE_REOWN_PROJECT_ID is unset: injected wallets only (no mobile browser support). */
function InjectedWalletProvider({ children }) {
  const [address, setAddress] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      setError("No wallet found. Open this site in your wallet's browser, or install MetaMask.");
      return;
    }
    setIsConnecting(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      setAddress(accounts[0]);
      setError(null);
      localStorage.setItem("walletConnected", "true");
    } catch (err) {
      setError("Failed to connect wallet");
      console.error(err);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  // Stable handler identities so add/removeListener operate on the same function reference.
  const handleAccountsChanged = useCallback((accounts) => {
    if (accounts.length > 0 && localStorage.getItem("walletConnected") === "true") {
      setAddress(accounts[0]);
    } else {
      setAddress(null);
      localStorage.removeItem("walletConnected");
    }
  }, []);

  const handleDisconnect = useCallback(() => {
    setAddress(null);
    setError(null);
    localStorage.removeItem("walletConnected");
  }, []);

  const disconnectWallet = useCallback(async () => {
    handleDisconnect();
    try {
      if (window.ethereum?.disconnect) await window.ethereum.disconnect();
    } catch (err) {
      console.error("Error disconnecting wallet:", err);
    }
  }, [handleDisconnect]);

  const ensureChain = useCallback(async (wanted) => {
    if (!wanted || !window.ethereum) return;
    const current = Number(await window.ethereum.request({ method: "eth_chainId" }));
    if (current === Number(wanted)) return;
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x" + Number(wanted).toString(16) }],
    });
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;
    if (localStorage.getItem("walletConnected") === "true") {
      window.ethereum.request({ method: "eth_accounts" }).then((accounts) => {
        if (accounts.length > 0) setAddress(accounts[0]);
        else localStorage.removeItem("walletConnected");
      });
    }
    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("disconnect", handleDisconnect);
    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("disconnect", handleDisconnect);
    };
  }, [handleAccountsChanged, handleDisconnect]);

  const value = useMemo(
    () => ({
      address,
      isConnecting,
      error,
      connectWallet,
      disconnectWallet,
      walletProvider: address && typeof window !== "undefined" ? window.ethereum : null,
      ensureChain,
    }),
    [address, isConnecting, error, connectWallet, disconnectWallet, ensureChain],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

if (!appKit) {
  console.warn("VITE_REOWN_PROJECT_ID is not set: WalletConnect is off and mobile browsers cannot connect a wallet.");
}

export const WalletProvider = appKit ? AppKitWalletProvider : InjectedWalletProvider;

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === null) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
