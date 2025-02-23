import { createContext, useContext, useState, useEffect } from "react";
import { ethers } from "ethers";

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const [address, setAddress] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  const connectWallet = async () => {
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
      localStorage.setItem('walletConnected', 'true');
    } catch (err) {
      setError("Failed to connect wallet");
      console.error(err);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = async () => {
    if (window.ethereum) {
      try {
        // Clear the selected address
        setAddress(null);
        setError(null);

        // Remove the event listeners
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        window.ethereum.removeListener("disconnect", handleDisconnect);

        // Clear connection state
        localStorage.removeItem('walletConnected');

        // Some wallets support programmatic disconnect
        if (window.ethereum.disconnect) {
          await window.ethereum.disconnect();
        }
      } catch (err) {
        console.error("Error disconnecting wallet:", err);
      }
    }
  };

  const handleAccountsChanged = (accounts) => {
    if (accounts.length > 0 && localStorage.getItem('walletConnected') === 'true') {
      setAddress(accounts[0]);
    } else {
      // MetaMask disconnected or locked
      setAddress(null);
      localStorage.removeItem('walletConnected');
    }
  };

  const handleDisconnect = () => {
    setAddress(null);
    setError(null);
    localStorage.removeItem('walletConnected');
  };

  useEffect(() => {
    // Check if wallet should be connected
    const shouldConnect = localStorage.getItem('walletConnected') === 'true';

    // Only check for connection if user previously connected
    if (window.ethereum && shouldConnect) {
      window.ethereum.request({ method: "eth_accounts" }).then((accounts) => {
        if (accounts.length > 0) {
          setAddress(accounts[0]);
        } else {
          // If no accounts found, clear connection state
          localStorage.removeItem('walletConnected');
        }
      });

      // Listen for account changes
      window.ethereum.on("accountsChanged", handleAccountsChanged);
      
      // Listen for disconnect event
      window.ethereum.on("disconnect", handleDisconnect);

      // Cleanup listeners on unmount
      return () => {
        if (window.ethereum) {
          window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
          window.ethereum.removeListener("disconnect", handleDisconnect);
        }
      };
    }
  }, []);

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