import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const [address, setAddress] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      setError("Please install MetaMask!");
      return;
    }

    setIsConnecting(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      setAddress(accounts[0]);
      setError(null);
      // Store connection state
      localStorage.setItem("walletConnected", "true");
    } catch (err) {
      setError("Failed to connect wallet");
      console.error(err);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  // Stable handler identities so add/removeListener operate on the same
  // function reference (otherwise cleanup silently fails and leaks listeners).
  const handleAccountsChanged = useCallback((accounts) => {
    if (accounts.length > 0 && localStorage.getItem("walletConnected") === "true") {
      setAddress(accounts[0]);
    } else {
      // MetaMask disconnected or locked
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
    // Clear the selected address regardless of provider availability.
    setAddress(null);
    setError(null);
    localStorage.removeItem("walletConnected");

    if (window.ethereum) {
      try {
        // Some wallets support programmatic disconnect
        if (window.ethereum.disconnect) {
          await window.ethereum.disconnect();
        }
      } catch (err) {
        console.error("Error disconnecting wallet:", err);
      }
    }
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;

    // Only restore the connection if the user previously connected.
    if (localStorage.getItem("walletConnected") === "true") {
      window.ethereum.request({ method: "eth_accounts" }).then((accounts) => {
        if (accounts.length > 0) {
          setAddress(accounts[0]);
        } else {
          // If no accounts found, clear connection state
          localStorage.removeItem("walletConnected");
        }
      });
    }

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("disconnect", handleDisconnect);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("disconnect", handleDisconnect);
    };
  }, [handleAccountsChanged, handleDisconnect]);

  return (
    <WalletContext.Provider
      value={{
        address,
        isConnecting,
        error,
        connectWallet,
        disconnectWallet,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === null) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
