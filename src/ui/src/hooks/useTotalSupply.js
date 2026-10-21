import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { WLBC_ADDRESS } from "../config/constants";
import { TOKEN_ABI as ERC20_ABI, getReadProvider } from "../lib/contracts";

export function useTotalSupply() {
  const [totalSupply, setTotalSupply] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const fetchSupply = async () => {
      if (!WLBC_ADDRESS) {
        setError("wLBC contract address is not configured");
        setLoading(false);
        return;
      }

      const provider = getReadProvider();
      if (!provider) {
        setError("No Ethereum provider available");
        setLoading(false);
        return;
      }

      try {
        const token = new ethers.Contract(WLBC_ADDRESS, ERC20_ABI, provider);
        const [supply, decimals] = await Promise.all([token.totalSupply(), token.decimals()]);
        if (cancelled) return;
        setTotalSupply(Number(ethers.formatUnits(supply, decimals)));
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError("Failed to fetch total supply");
        console.error("Total supply fetch error:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchSupply();
    const interval = setInterval(fetchSupply, 60000); // refresh every minute

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { totalSupply, loading, error };
}
