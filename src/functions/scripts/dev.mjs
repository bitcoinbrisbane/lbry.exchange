// Serves the built functions locally the way DigitalOcean would, at
// http://localhost:8787/api/v1/web/bridge/<fn>, so the UI can run end to end.
// Run `node scripts/build.mjs` first (or `yarn dev`, which does both).
import http from "node:http";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const PORT = Number(process.env.PORT || 8787);
const PREFIX = "/api/v1/web/bridge/";
const FUNCTIONS = ["wrap", "unwrap", "status", "config"];

const handlers = Object.fromEntries(
  FUNCTIONS.map((name) => [name, require(resolve(here, `../packages/bridge/${name}/index.js`)).main]),
);

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const name = url.pathname.startsWith(PREFIX) ? url.pathname.slice(PREFIX.length).split("/")[0] : null;
    const main = name && handlers[name];
    if (!main) {
      res
        .writeHead(404, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: `no function at ${url.pathname}` }));
      return;
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    let body = {};
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Body must be JSON" }));
        return;
      }
    }
    // DigitalOcean merges query and JSON body fields into one args object.
    const args = {
      ...Object.fromEntries(url.searchParams),
      ...body,
      __ow_method: req.method.toLowerCase(),
      __ow_headers: req.headers,
      __ow_path: "",
      __ow_query: url.search.slice(1),
    };
    const started = Date.now();
    const out = await main(args);
    res.writeHead(out.statusCode, out.headers).end(out.body);
    console.log(`${req.method} ${url.pathname}${url.search} → ${out.statusCode} (${Date.now() - started}ms)`);
  })
  .listen(PORT, () => console.log(`bridge functions at http://localhost:${PORT}${PREFIX}{${FUNCTIONS.join(",")}}`));
