// ApiClient tests: bearer auth, refresh single-flight + rotation capture,
// Set-Cookie parsing across RN header shapes, error extraction, and the
// pagination collectors. fetch is globally mocked.
import {
  apiFetch,
  collectAllCursorPages,
  collectAllPages,
  cookieFromResponse,
  extractErrorMessage,
  setTokenStore,
  setUnauthorizedHandler,
  __resetForTests,
  type TokenStore,
} from "../ApiClient";

describe("cookieFromResponse", () => {
  const makeResponse = (setCookie: string | string[] | undefined) => ({
    headers: {
      get: (name: string) => (name.toLowerCase() === "set-cookie" ? (setCookie ?? null) : null),
    },
  });

  it("extracts wc_refresh from a comma-joined Android-style header", () => {
    const response = makeResponse(
      "wc_access=abc; expires=x; Path=/, wc_refresh=def; Path=/, csrftoken=g",
    );
    expect(cookieFromResponse(response, "wc_refresh")).toBe("def");
    expect(cookieFromResponse(response, "wc_access")).toBe("abc");
    expect(cookieFromResponse(response, "absent")).toBeNull();
  });

  it("extracts from an array (iOS-style) header", () => {
    const response = makeResponse(["a=1; Path=/", "wc_refresh=rot; HttpOnly"]);
    expect(cookieFromResponse(response, "wc_refresh")).toBe("rot");
  });

  it("handles expires dates containing commas", () => {
    const response = makeResponse("wc_refresh=tok; expires=Mon, 02 Nov 2026 22:44:09 GMT; Path=/");
    expect(cookieFromResponse(response, "wc_refresh")).toBe("tok");
  });

  it("returns null when absent and reads headers.map fallback", () => {
    expect(cookieFromResponse(makeResponse(undefined), "wc_refresh")).toBeNull();
    const mapOnly = {
      headers: { map: { "set-cookie": ["wc_refresh=zz; Path=/"] } },
    };
    expect(cookieFromResponse(mapOnly, "wc_refresh")).toBe("zz");
  });

  it("reads map-only headers when get() yields null, and Case-insensitive", () => {
    const nullGet = {
      headers: {
        get: () => null,
        map: { "Set-Cookie": "wc_refresh=case; Path=/" },
      },
    };
    expect(cookieFromResponse(nullGet, "wc_refresh")).toBe("case");
    const noGetNoMap = { headers: {} };
    expect(cookieFromResponse(noGetNoMap, "wc_refresh")).toBeNull();
  });
});

describe("extractErrorMessage", () => {
  it("prefers detail, then non_field_errors, then the first field error", () => {
    expect(extractErrorMessage({ detail: "nope" })).toBe("nope");
    expect(extractErrorMessage({ non_field_errors: ["bad pair", "x"] })).toBe("bad pair");
    expect(extractErrorMessage({ password: ["too short", "too common"] })).toBe("too short");
    expect(extractErrorMessage("string")).toBe("");
    expect(extractErrorMessage(null)).toBe("");
    expect(extractErrorMessage({})).toBe("");
    expect(extractErrorMessage({ other: [42] })).toBe("");
  });
});

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 404 ? "Not Found" : "",
    json: async () => body,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  };
}

function makeStore(
  access: string | null = "ACCESS",
  refresh: string | null = "REFRESH",
): TokenStore & { savedAccess: string[]; savedRefresh: string[] } {
  let a = access;
  let r = refresh;
  const savedAccess: string[] = [];
  const savedRefresh: string[] = [];
  return {
    savedAccess,
    savedRefresh,
    async getAccess() {
      return a;
    },
    async setAccess(token) {
      a = token;
      savedAccess.push(token ?? "<null>");
    },
    async getRefresh() {
      return r;
    },
    async setRefresh(token) {
      r = token;
      savedRefresh.push(token ?? "<null>");
    },
  };
}

describe("apiFetch auth + refresh", () => {
  let store: ReturnType<typeof makeStore>;
  let unauthorized: jest.Mock | null;

  beforeEach(() => {
    global.fetch = jest.fn();
    unauthorized = jest.fn();
    store = makeStore();
    setTokenStore(store);
    setUnauthorizedHandler(unauthorized);
  });

  afterEach(() => {
    __resetForTests();
  });

  it("attaches the Bearer header and parses the JSON body", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ count: 1 }));
    const result = await apiFetch<{ count: number }>("/x/");
    expect(result.count).toBe(1);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer ACCESS");
    expect(init.method).toBe("GET");
  });

  it("refreshes once on 401, persists the rotated pair, retries", async () => {
    (global.fetch as jest.Mock)
      // original request → 401
      .mockResolvedValueOnce(jsonResponse({ detail: "x" }, 401))
      // refresh → new access in body + rotated refresh in Set-Cookie
      .mockResolvedValueOnce(
        jsonResponse({ access: "NEW_ACCESS" }, 200, {
          "set-cookie": "wc_refresh=ROTATED; expires=Mon, 02 Nov 2026 00:00:00 GMT; Path=/",
        }),
      )
      // retried request → 200
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const result = await apiFetch<{ ok: boolean }>("/protected/");
    expect(result.ok).toBe(true);
    expect(store.savedAccess).toEqual(["NEW_ACCESS"]);
    expect(store.savedRefresh).toEqual(["ROTATED"]);
    // 3 calls total: request, refresh, retry.
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(3);
    expect(unauthorized).not.toHaveBeenCalled();
  });

  it("single-flights concurrent 401 refreshes", async () => {
    let resolveRefresh: (v: unknown) => void = () => {};
    const refreshGate = new Promise((resolve) => {
      resolveRefresh = resolve;
    });
    (global.fetch as jest.Mock)
      .mockImplementationOnce(async () => jsonResponse({}, 401))
      .mockImplementationOnce(async () => jsonResponse({}, 401))
      .mockImplementationOnce(async () => {
        await refreshGate;
        return jsonResponse({ access: "A2" }, 200, {
          "set-cookie": "wc_refresh=R2; Path=/",
        });
      })
      // Retries after the shared refresh completes.
      .mockImplementationOnce(async () => jsonResponse({ a: 1 }))
      .mockImplementationOnce(async () => jsonResponse({ b: 2 }));
    const first = apiFetch<{ a: number }>("/one/");
    const second = apiFetch<{ b: number }>("/two/");
    // Give both 401s a tick to funnel into the one shared refresh, then
    // release the gate so the retry lane can proceed.
    await new Promise((r) => setImmediate(r));
    resolveRefresh(undefined);
    const [r1, r2] = await Promise.all([first, second]);
    expect([r1, r2]).toEqual([{ a: 1 }, { b: 2 }]);
    const refreshCalls = (global.fetch as jest.Mock).mock.calls.filter((call) =>
      String(call[0]).includes("token/refresh"),
    );
    expect(refreshCalls.length).toBe(1);
    expect(store.savedRefresh).toEqual(["R2"]);
  });

  it("fires the unauthorized handler when refresh fails (401 refresh)", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ detail: "expired" }, 401))
      .mockResolvedValueOnce(jsonResponse({ detail: "bad refresh" }, 401));
    await expect(apiFetch("/protected/")).rejects.toThrow("expired");
    expect(unauthorized).toHaveBeenCalled();
  });

  it("treats a network-failing refresh as unauthorized", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockRejectedValueOnce(new Error("offline"));
    await expect(apiFetch("/protected/")).rejects.toThrow();
    expect(unauthorized).toHaveBeenCalled();
  });

  it("force-clears the refresh when rotation returns no cookie", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(jsonResponse({ access: "A2" }, 200, {}));
    await expect(apiFetch("/protected/")).rejects.toThrow();
    expect(store.savedRefresh).toEqual(["<null>"]);
  });

  it("skips refresh when no refresh token is stored", async () => {
    setTokenStore(makeStore("ACCESS", null));
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}, 401));
    await expect(apiFetch("/protected/")).rejects.toThrow();
    // Only the original call: no refresh attempt.
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(1);
    expect(unauthorized).toHaveBeenCalled();
  });

  it("skips refresh entirely for anonymous calls (login lane)", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}, 401));
    await expect(apiFetch("/auth/login/", { method: "POST", anonymous: true })).rejects.toThrow();
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(1);
    expect(unauthorized).not.toHaveBeenCalled();
  });

  it("returns {} for 204 and surfaces DRF messages on errors", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => {
        throw new Error("no body");
      },
      headers: { get: () => null },
    });
    expect(await apiFetch("/logout/", { method: "POST" })).toEqual({});
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ password: ["too short"] }, 400),
    );
    await expect(apiFetch("/register/", { method: "POST" })).rejects.toThrow("too short");
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}, 500, {}));
    // no body message → statusText fallback (empty here) → HTTP code
    await expect(apiFetch("/x/")).rejects.toThrow("HTTP 500");
  });

  it("sends JSON content-type only when a body is present", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}));
    await apiFetch("/a/");
    const [, init1] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init1.headers["Content-Type"]).toBeUndefined();
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}));
    await apiFetch("/b/", { method: "POST", body: "{}" });
    const [, init2] = (global.fetch as jest.Mock).mock.calls[1];
    expect(init2.headers["Content-Type"]).toBe("application/json");
  });
});

describe("pagination collectors", () => {
  it("stops at the 50-page ceiling (page-number)", async () => {
    const fetchPage = jest.fn(
      async (page: number) =>
        ({
          count: Infinity,
          next: `http://api?page=${page + 1}`,
          previous: null,
          results: [page],
        }) as never,
    );
    const out = await collectAllPages<number>(fetchPage);
    expect(out.length).toBe(50);
    expect(fetchPage).toHaveBeenCalledTimes(50);
  });

  it("stops at the 50-page ceiling (cursor)", async () => {
    const fetchPage = jest.fn(async (cursor: string | null) => {
      const nextCursor = cursor === null ? "c1" : cursor === "STOP" ? null : "c2";
      return {
        next: nextCursor ? `http://api?cursor=${nextCursor}` : null,
        previous: null,
        results: [cursor],
      } as never;
    });
    const out = await collectAllCursorPages<number>(fetchPage);
    expect(out.length).toBe(50);
    expect(fetchPage).toHaveBeenCalledTimes(50);
  });

  it("terminates on null next", async () => {
    const out = await collectAllPages<number>(
      async () => ({ count: 1, next: null, previous: null, results: [7] }) as never,
    );
    expect(out).toEqual([7]);
    const cursorOut = await collectAllCursorPages<number>(
      async () => ({ next: null, previous: null, results: [9] }) as never,
    );
    expect(cursorOut).toEqual([9]);
  });
});
