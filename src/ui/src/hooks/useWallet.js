import { useState, useEffect } from "react";
import { ethers } from "ethers";

export function useWallet() {
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
		} catch (err) {
			setError("Failed to connect wallet");
			console.error(err);
		} finally {
			setIsConnecting(false);
		}
	};

	const disconnectWallet = () => {
		setAddress(null);
		setError(null);
		// Add any additional cleanup needed
	};

	useEffect(() => {
		// Check if already connected
		if (window.ethereum) {
			window.ethereum.request({ method: "eth_accounts" }).then((accounts) => {
				if (accounts.length > 0) {
					setAddress(accounts[0]);
				}
			});
		}
	}, []);

	return {
		address,
		isConnecting,
		error,
		connectWallet,
		disconnectWallet,
	};
}
