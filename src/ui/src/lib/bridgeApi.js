import { BRIDGE_API_URL } from "../config/constants";

/** Thin client for the bridge functions. Every call resolves to { ok, status, data }. */
async function call(path, { method = "GET", params, body } = {}) {
	if (!BRIDGE_API_URL) throw new Error("VITE_BRIDGE_API_URL is not configured");
	const url = new URL(`${BRIDGE_API_URL}/${path}`);
	if (params) for (const [key, value] of Object.entries(params)) if (value != null) url.searchParams.set(key, value);
	const res = await fetch(url, {
		method,
		headers: body ? { "Content-Type": "application/json" } : undefined,
		body: body ? JSON.stringify(body) : undefined,
	});
	const data = await res.json().catch(() => ({}));
	return { ok: res.ok, status: res.status, data };
}

export const bridgeApi = {
	config: () => call("config"),
	depositAddress: (ethAddress) => call("wrap", { params: { ethAddress } }),
	deposits: (ethAddress) => call("status", { params: { ethAddress } }),
	approve: (ethAddress, lbcTxid) => call("wrap", { method: "POST", body: { ethAddress, lbcTxid } }),
	unwrap: (burnTxid) => call("unwrap", { method: "POST", body: { burnTxid } }),
	unwrapStatus: (burnTxid) => call("status", { params: { burnTxid } }),
};

/** The error message a failed call carries, or a fallback. */
export function errorOf(result, fallback = "Request failed") {
	return result?.data?.error || fallback;
}
