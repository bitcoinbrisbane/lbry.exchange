import { useEffect, useState } from "react";
import { bridgeApi, errorOf } from "../lib/bridgeApi";
import { BRIDGE_ADDRESS, WLBC_ADDRESS } from "../config/constants";

/** Public bridge parameters from the functions, falling back to build-time env. */
export function useBridgeConfig() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    bridgeApi
      .config()
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(errorOf(res, "Could not load bridge config"));
        setConfig({
          ...res.data,
          bridgeAddress: res.data.bridgeAddress || BRIDGE_ADDRESS,
          tokenAddress: res.data.tokenAddress || WLBC_ADDRESS,
        });
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  return { config, error };
}
