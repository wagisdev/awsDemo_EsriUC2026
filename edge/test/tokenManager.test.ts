import { describe, it, expect, vi } from "vitest";
import { TokenManager, REFRESH_BUFFER_MS } from "../src/tokenManager";

/** Build a fake fetch that returns a fresh token string each call. */
function makeTokenFetch(expiresInSeconds = 7200) {
  let n = 0;
  const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
    n += 1;
    return {
      ok: true,
      json: async () => ({ access_token: `tok-${n}`, expires_in: expiresInSeconds }),
    } as unknown as Response;
  });
  return { fetchImpl, calls: () => n };
}

const creds = { clientId: "id", clientSecret: "secret" };

describe("TokenManager", () => {
  it("fetches once and caches a valid token", async () => {
    const { fetchImpl } = makeTokenFetch();
    let now = 1_000_000;
    const tm = new TokenManager({
      getCredentials: async () => creds,
      fetchImpl,
      now: () => now,
    });

    expect(await tm.getToken()).toBe("tok-1");
    now += 1000; // still well within lifetime
    expect(await tm.getToken()).toBe("tok-1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refreshes once the token enters the 5-minute safety buffer", async () => {
    const expiresIn = 7200;
    const { fetchImpl } = makeTokenFetch(expiresIn);
    let now = 0;
    const tm = new TokenManager({
      getCredentials: async () => creds,
      fetchImpl,
      now: () => now,
    });

    expect(await tm.getToken()).toBe("tok-1");
    // Jump to just inside the buffer window before real expiry.
    now = expiresIn * 1000 - (REFRESH_BUFFER_MS - 1000);
    expect(await tm.getToken()).toBe("tok-2");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("shares a single in-flight request across concurrent callers (promise lock)", async () => {
    let resolveFetch: (v: Response) => void = () => {};
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const tm = new TokenManager({
      getCredentials: async () => creds,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => 0,
    });

    const pending = Promise.all([tm.getToken(), tm.getToken(), tm.getToken()]);
    // Let the (async) credential lookup settle so the single fetch is issued.
    await new Promise((r) => setTimeout(r, 0));
    // Only one network call despite three concurrent requests.
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    resolveFetch({
      ok: true,
      json: async () => ({ access_token: "shared", expires_in: 7200 }),
    } as unknown as Response);

    const results = await pending;
    expect(results).toEqual(["shared", "shared", "shared"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws on an ArcGIS error payload and recovers on the next call", async () => {
    let mode: "error" | "ok" = "error";
    const fetchImpl = vi.fn(async () => {
      if (mode === "error") {
        return {
          ok: true,
          json: async () => ({ error: { message: "Invalid client_id" } }),
        } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ({ access_token: "recovered", expires_in: 7200 }),
      } as unknown as Response;
    });
    const tm = new TokenManager({
      getCredentials: async () => creds,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => 0,
    });

    await expect(tm.getToken()).rejects.toThrow(/Invalid client_id/);
    // The in-flight lock must be released so a retry can succeed.
    mode = "ok";
    expect(await tm.getToken()).toBe("recovered");
  });

  it("binds the token to a referer when one is configured", async () => {
    const { fetchImpl } = makeTokenFetch();
    const tm = new TokenManager({
      getCredentials: async () => creds,
      fetchImpl,
      now: () => 0,
      referer: "https://demo.gis.dev",
    });
    await tm.getToken();
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect(String(init.body)).toContain("referer=https%3A%2F%2Fdemo.gis.dev");
  });

  it("omits the referer when none is configured", async () => {
    const { fetchImpl } = makeTokenFetch();
    const tm = new TokenManager({
      getCredentials: async () => creds,
      fetchImpl,
      now: () => 0,
    });
    await tm.getToken();
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect(String(init.body)).not.toContain("referer=");
  });

  it("throws on a non-200 HTTP response", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response);
    const tm = new TokenManager({
      getCredentials: async () => creds,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => 0,
    });
    await expect(tm.getToken()).rejects.toThrow(/HTTP 500/);
  });
});
