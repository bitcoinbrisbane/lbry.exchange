import { ethers } from "ethers";

/** Dewies (string or bigint) → "12.5 LBC" style number, trailing zeros trimmed. */
export function formatLbc(dewies, maxDecimals = 8) {
  if (dewies == null) return "—";
  const text = ethers.formatUnits(BigInt(dewies), 8);
  const [whole, frac = ""] = text.split(".");
  const trimmed = frac.slice(0, maxDecimals).replace(/0+$/, "");
  return `${Number(whole).toLocaleString("en-US")}${trimmed ? "." + trimmed : ""}`;
}

/** "12.5" → dewies as bigint. Throws on bad input or more than 8 decimals. */
export function parseLbc(text) {
  const clean = String(text).trim().replace(/,/g, "");
  if (!/^\d*(\.\d{0,8})?$/.test(clean) || clean === "" || clean === ".")
    throw new Error("Enter a valid LBC amount (up to 8 decimals)");
  return ethers.parseUnits(clean, 8);
}

export const shortHash = (hash, head = 6, tail = 4) => (hash ? `${hash.slice(0, head)}…${hash.slice(-tail)}` : "");

/** Loose LBC address check; the functions validate the checksum. */
export const looksLikeLbcAddress = (value) => /^[br][1-9A-HJ-NP-Za-km-z]{33}$/.test(value.trim());

/** Remembered values per wallet, so a reload or a closed tab loses nothing that matters. */
export const cache = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(`bridge:${key}`);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`bridge:${key}`, JSON.stringify(value));
    } catch {
      /* storage unavailable: the chain is the source of truth anyway */
    }
  },
};
