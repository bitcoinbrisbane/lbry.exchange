import { normalizeEthAddress } from "./custody.js";
import { HttpError } from "./http.js";
import { normalizeEthTxid } from "./marker.js";

// Request-parameter parsers shared by the function handlers. They live here, not
// in a handler file, so one function's bundle never pulls in another's `main`:
// the DigitalOcean runtime resolves the handler by that top-level name.

export function parseEthAddress(value: string): string {
  try {
    return normalizeEthAddress(value);
  } catch {
    throw new HttpError(400, "ethAddress is not a valid Ethereum address");
  }
}

export function parseBurnTxid(value: string): string {
  try {
    return normalizeEthTxid(value);
  } catch {
    throw new HttpError(400, "burnTxid is not a valid transaction hash");
  }
}
