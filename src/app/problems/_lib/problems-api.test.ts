import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getProblemDetail, getProblems, getProblemsPage, MAX_CATALOG_PAGES } from "./problems-api";

function mockFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

const envelope = (results: unknown[], next: string | null = null) => ({
  count: results.length,
  next,
  previous: null,
  results,
});

// process.env values are strings — assigning `undefined` yields the literal
// string "undefined", so the unset state must be produced with delete.
const ORIGINAL_BASE = process.env.NEXT_PUBLIC_API_BASE;

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_API_BASE;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_BASE === undefined) {
    delete process.env.NEXT_PUBLIC_API_BASE;
  } else {
    process.env.NEXT_PUBLIC_API_BASE = ORIGINAL_BASE;
  }
});

describe("getProblemsPage", () => {
  it("fetches one catalog page (page + page_size) with ISR revalidation", async () => {
    const fetchMock = mockFetch(async () =>
      jsonResponse(envelope([{ id: 1, title_i18n: { en: "A" } }])),
    );
    const page = await getProblemsPage(2);

    expect(page.results).toEqual([{ id: 1, title_i18n: { en: "A" } }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/problems/problems/?page=2&page_size=100",
      {
        next: { revalidate: 60 },
      },
    );
  });

  it("honors NEXT_PUBLIC_API_BASE when set", async () => {
    process.env.NEXT_PUBLIC_API_BASE = "http://api.test";
    vi.resetModules();
    const fetchMock = mockFetch(async () => jsonResponse(envelope([])));
    const { getProblemsPage: fresh } = await import("./problems-api");
    await fresh();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/api/v1/problems/problems/?page=1&page_size=100",
      {
        next: { revalidate: 60 },
      },
    );
  });

  // [SPEC-GAPS F2] No `.catch(() => [])`: a down backend must surface as the
  // page's error state, not masquerade as an empty catalog.
  it("rejects with Error(detail) when the API responds with a detail body", async () => {
    mockFetch(async () => jsonResponse({ detail: "Service unavailable" }, { status: 503 }));
    await expect(getProblemsPage()).rejects.toThrow("Service unavailable");
  });

  it("rejects with Error(statusText) when the error body has no detail", async () => {
    mockFetch(async () => jsonResponse({}, { status: 500, statusText: "Internal Server Error" }));
    await expect(getProblemsPage()).rejects.toThrow("Internal Server Error");
  });

  it("propagates network failures", async () => {
    mockFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(getProblemsPage()).rejects.toThrow("Failed to fetch");
  });
});

describe("getProblems (full catalog, bounded)", () => {
  it("concatenates every page while `next` is present", async () => {
    const fetchMock = mockFetch(async () => {
      const page = fetchMock.mock.calls.length; // 1-based: calls includes the in-flight one
      if (page === 1) {
        return jsonResponse(
          envelope(
            [{ id: 1 }, { id: 2 }],
            "http://localhost:8000/api/v1/problems/problems/?page=2&page_size=100",
          ),
        );
      }
      return jsonResponse(envelope([{ id: 3 }]));
    });
    const problems = await getProblems();
    expect(problems.map((p) => (p as { id: number }).id)).toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops after MAX_CATALOG_PAGES pages even when next keeps resolving", async () => {
    const fetchMock = mockFetch(async () =>
      jsonResponse(
        envelope(
          [{ id: 1 }],
          "http://localhost:8000/api/v1/problems/problems/?page=99&page_size=100",
        ),
      ),
    );
    const problems = await getProblems();
    expect(problems).toHaveLength(MAX_CATALOG_PAGES);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_CATALOG_PAGES);
  });

  it("propagates a first-page failure (no silent empty catalog)", async () => {
    mockFetch(async () => jsonResponse({ detail: "Service unavailable" }, { status: 503 }));
    await expect(getProblems()).rejects.toThrow("Service unavailable");
  });
});

describe("getProblemDetail", () => {
  it("returns the problem object on success", async () => {
    const problem = {
      id: 9,
      title_i18n: { en: "Two Sum" },
      difficulty: "EASY",
      status: "APPROVED",
    };
    mockFetch(async () => jsonResponse(problem));
    await expect(getProblemDetail(9)).resolves.toEqual(problem);
  });

  it("returns null on HTTP 404 so the page can render notFound()", async () => {
    mockFetch(async () => new Response(null, { status: 404, statusText: "Not Found" }));
    await expect(getProblemDetail("missing")).resolves.toBeNull();
  });

  it("throws Error(detail) on other error statuses", async () => {
    mockFetch(async () => jsonResponse({ detail: "Throttled" }, { status: 429 }));
    await expect(getProblemDetail(3)).rejects.toThrow("Throttled");
  });

  it("throws Error(statusText) when the error body has no detail", async () => {
    mockFetch(async () => jsonResponse({}, { status: 502, statusText: "Bad Gateway" }));
    await expect(getProblemDetail(3)).rejects.toThrow("Bad Gateway");
  });

  it("throws Error(statusText) when the error body is not JSON (json() rejects)", async () => {
    mockFetch(
      async () => new Response("not-json", { status: 500, statusText: "Internal Server Error" }),
    );
    await expect(getProblemDetail(3)).rejects.toThrow("Internal Server Error");
  });
});
