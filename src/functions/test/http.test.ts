import { describe, expect, it } from "vitest";
import { HttpError, Reply, handle, parseRequest, requireString } from "../src/lib/http.js";

describe("DigitalOcean request adapter", () => {
  it("merges query and body fields and strips the __ow_ keys", () => {
    const req = parseRequest({
      __ow_method: "post",
      __ow_headers: {},
      __ow_path: "",
      ethAddress: "0xabc",
      lbcTxid: "ff",
    });
    expect(req).toEqual({ method: "POST", params: { ethAddress: "0xabc", lbcTxid: "ff" } });
  });

  it("parses a raw JSON body and a query string when raw HTTP is on", () => {
    const req = parseRequest({ __ow_method: "post", __ow_body: JSON.stringify({ a: 1 }), __ow_query: "b=2&a=9" });
    expect(req.params).toEqual({ a: 1, b: "2" });
  });

  it("answers OPTIONS, rejects other methods, and serialises bigints", async () => {
    const main = handle(["POST"], async (req) => ({ echo: req.params, amount: 10n ** 18n }));
    expect((await main({ __ow_method: "options" })).statusCode).toBe(204);
    expect((await main({ __ow_method: "get" })).statusCode).toBe(405);
    const ok = await main({ __ow_method: "post", x: 1 });
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(ok.body)).toEqual({ echo: { x: 1 }, amount: "1000000000000000000" });
  });

  it("maps HttpError and Reply to their status codes and hides unknown errors", async () => {
    const fail = handle(["GET"], async () => {
      throw new HttpError(409, "nope", { why: "because" });
    });
    const res = await fail({ __ow_method: "get" });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body)).toEqual({ error: "nope", why: "because" });

    const pending = handle(["GET"], async () => new Reply(202, { status: "pending" }));
    expect((await pending({ __ow_method: "get" })).statusCode).toBe(202);

    const boom = handle(["GET"], async () => {
      throw new Error("secret details");
    });
    const res2 = await boom({ __ow_method: "get" });
    expect(res2.statusCode).toBe(500);
    expect(res2.body).not.toContain("secret");
  });

  it("validates required string parameters", () => {
    expect(requireString({ a: " x " }, "a")).toBe("x");
    expect(() => requireString({}, "a")).toThrow(HttpError);
    expect(() => requireString({ a: "zz" }, "a", /^[0-9]+$/)).toThrow(HttpError);
  });
});
