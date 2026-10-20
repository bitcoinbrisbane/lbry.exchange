import { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/constants";

// Fallback used when the rate endpoint is unavailable (1 LBC = 0.0035 USDC).
const FALLBACK_RATE = 0.0035;

export function useRate() {
	const [rate, setRate] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	useEffect(() => {
		let cancelled = false;

		const fetchRate = async () => {
			try {
				const response = await axios.get(`${API_BASE_URL}/rate`);
				if (cancelled) return;
				setRate(response.data.rate);
				setError(null);
			} catch (err) {
				if (cancelled) return;
				// Fall back to a sensible default rather than blocking the UI.
				console.error("Rate fetch error, using fallback:", err);
				setRate(FALLBACK_RATE);
				setError(null);
			} finally {
				if (!cancelled) setLoading(false);
			}
		};

		fetchRate();
		const interval = setInterval(fetchRate, 60000); // Refresh every minute

		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, []);

	return { rate, loading, error };
}
