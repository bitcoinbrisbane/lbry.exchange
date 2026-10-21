/**
 * Adapter between DigitalOcean Functions' calling convention and plain
 * request/response objects.
 *
 * A web function receives one `args` object: query-string and JSON-body fields
 * merged at the top level, plus `__ow_method`, `__ow_headers`, `__ow_path` and
 * `__ow_query`. It returns `{ statusCode, headers, body }`. Bodies are
 * pre-serialised here so bigint amounts come out as decimal strings.
 */

export interface DoArgs {
  __ow_method?: string;
  __ow_headers?: Record<string, string>;
  __ow_path?: string;
  __ow_query?: string;
  __ow_body?: string;
  __ow_isBase64Encoded?: boolean;
  [key: string]: unknown;
}

export interface DoResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface Request {
  method: string;
  params: Record<string, unknown>;
}

/** An error that maps to an HTTP status and a JSON body. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** A successful response with a status other than 200. */
export class Reply {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {}
}

// No CORS headers here: DigitalOcean's web-function gateway adds them itself, and
// a browser rejects a response that carries Access-Control-Allow-Origin twice.
// scripts/dev.mjs adds them for local development.

function serialize(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
}

export function json(statusCode: number, body: unknown): DoResponse {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: serialize(body) };
}

export function parseRequest(args: DoArgs): Request {
  const method = (args.__ow_method ?? "get").toUpperCase();
  const params: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) if (!key.startsWith("__ow_")) params[key] = value;
  // With "raw HTTP" enabled the body arrives unparsed instead of merged into args.
  if (typeof args.__ow_body === "string" && args.__ow_body) {
    const text = args.__ow_isBase64Encoded ? Buffer.from(args.__ow_body, "base64").toString("utf8") : args.__ow_body;
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) Object.assign(params, parsed);
    } catch {
      throw new HttpError(400, "Body must be JSON");
    }
  }
  if (typeof args.__ow_query === "string" && args.__ow_query) {
    for (const [key, value] of new URLSearchParams(args.__ow_query)) if (!(key in params)) params[key] = value;
  }
  return { method, params };
}

/** A required string parameter, optionally matching a pattern. */
export function requireString(params: Record<string, unknown>, key: string, pattern?: RegExp): string {
  const value = params[key];
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, `${key} is required`);
  const text = value.trim();
  if (pattern && !pattern.test(text)) throw new HttpError(400, `${key} is malformed`);
  return text;
}

export function optionalString(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export type Handler = (request: Request) => Promise<unknown>;

/**
 * Wraps a handler into a DigitalOcean `main`. Known errors become their status;
 * anything else is a 500 with a generic message (details go to the function log).
 */
export function handle(allowedMethods: string[], fn: Handler): (args: DoArgs) => Promise<DoResponse> {
  return async (args) => {
    let request: Request;
    try {
      request = parseRequest(args);
    } catch (err) {
      return err instanceof HttpError
        ? json(err.status, { error: err.message, ...err.extra })
        : json(400, { error: "Bad request" });
    }
    if (request.method === "OPTIONS") return { statusCode: 204, headers: {}, body: "" };
    if (!allowedMethods.includes(request.method)) return json(405, { error: `Use ${allowedMethods.join(" or ")}` });
    try {
      const result = await fn(request);
      return result instanceof Reply ? json(result.status, result.body) : json(200, result);
    } catch (err) {
      if (err instanceof HttpError) return json(err.status, { error: err.message, ...err.extra });
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${request.method} failed: ${message}`, err);
      // Configuration mistakes are the operator's to see; everything else stays generic.
      const isConfig = err instanceof Error && err.name === "ConfigError";
      return json(isConfig ? 503 : 500, { error: isConfig ? `Service misconfigured: ${message}` : "Internal error" });
    }
  };
}
