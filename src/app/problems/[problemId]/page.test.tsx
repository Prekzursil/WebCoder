import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ProblemType, TestCaseType } from "@/types";

vi.mock("@/services/ApiService", () => ({
  ForumService: {
    getThreads: vi.fn().mockResolvedValue({ count: 0, next: null, previous: null, results: [] }),
    createThread: vi.fn(),
  },
  ToolingService: {
    getStatementRevisions: vi.fn().mockResolvedValue({ count: 0, results: [] }),
    getSamplesBundle: vi.fn().mockResolvedValue({ count: 0, filename: "", content: "" }),
  },
  CommunityService: {
    getCommunityEditorials: vi
      .fn()
      .mockResolvedValue({ count: 0, next: null, previous: null, results: [] }),
    createCommunityEditorial: vi.fn(),
    getRelatedArticles: vi.fn().mockResolvedValue({ count: 0, results: [] }),
    getArticles: vi.fn().mockResolvedValue({ count: 0, next: null, previous: null, results: [] }),
    getArticle: vi.fn(),
    getFeed: vi.fn().mockResolvedValue({ count: 0, page: 1, next: null, results: [] }),
    getSolutions: vi.fn().mockRejectedValue(new Error("locked")),
    getHonor: vi.fn(),
    getMyHonor: vi.fn(),
    getWeeklyBoard: vi.fn().mockResolvedValue({ count: 0, window_days: 7, results: [] }),
  },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("../_lib/problems-api", () => ({
  getProblemDetail: vi.fn(),
  getProblems: vi.fn(),
}));

vi.mock("./HintsPanel", () => ({
  default: ({ hints }: { hints: string[] }) =>
    hints.length ? <div data-testid="hints-panel">{hints.join("|")}</div> : null,
}));

vi.mock("./EditorialPanel", () => ({
  default: ({ hasEditorial }: { hasEditorial: boolean }) =>
    hasEditorial ? <div data-testid="editorial-panel" /> : null,
}));

vi.mock("./ProblemStatsPanel", () => ({
  default: ({ problemId }: { problemId: string }) => (
    <div data-testid="problem-stats-panel" data-problem-id={problemId} />
  ),
}));

vi.mock("./ScratchPanel", () => ({
  default: ({ allowedLanguages }: { allowedLanguages: string[] }) =>
    allowedLanguages.length ? <div data-testid="scratch-panel" /> : null,
}));

vi.mock("./BookmarkButton", () => ({
  default: () => <div data-testid="bookmark-button" />,
}));

vi.mock("./SubmitSolutionForm", () => ({
  default: (props: { problemId: string; allowedLanguages: string[]; problemTitle: string }) => (
    <div
      data-testid="submit-form"
      data-problem-id={props.problemId}
      data-languages={props.allowedLanguages.join(",")}
      data-title={props.problemTitle}
    />
  ),
}));

import ProblemDetailPage, { generateMetadata } from "./page";
import { getProblemDetail, getProblems } from "../_lib/problems-api";

function mockLocale(value: string | undefined) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      name === "i18nextLng" ? (value === undefined ? undefined : { value }) : undefined,
  } as Awaited<ReturnType<typeof cookies>>);
}

function testCase(partial: Partial<TestCaseType>): TestCaseType {
  return {
    input_data: "1 2",
    expected_output_data: "3",
    is_sample: false,
    points: 10,
    ...partial,
  } as TestCaseType;
}

function problem(partial: Partial<ProblemType>): ProblemType {
  return {
    id: 7,
    title_i18n: { en: "Two Sum" },
    difficulty: "MEDIUM",
    status: "APPROVED",
    statement_i18n: { en: "Add two numbers.\nPrint the sum." },
    allowed_languages: ["python3", "cpp17"],
    ...partial,
  } as ProblemType;
}

function pageProps(problemId = "7") {
  return { params: Promise.resolve({ problemId }) };
}

afterEach(cleanup);

beforeEach(() => {
  mockLocale(undefined);
  vi.mocked(getProblemDetail).mockReset();
  vi.mocked(getProblems).mockReset();
  vi.mocked(notFound).mockClear();
});

describe('ProblemDetailPage (route "/problems/:problemId")', () => {
  it("badges an INTERACTIVE problem with the flush notice (JDG-2)", async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(problem({ problem_type: "INTERACTIVE" }));
    render(await ProblemDetailPage(pageProps()));

    const badge = screen.getByText("Interactive");
    expect(badge).toBeInTheDocument();
    // The flush-your-output hint rides the badge title for keyboard users.
    expect(badge.getAttribute("title")).toMatch(/flush/i);
  });

  it("renders no interactive badge for NORMAL problems", async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(problem({ problem_type: "NORMAL" }));
    render(await ProblemDetailPage(pageProps()));

    expect(screen.queryByText("Interactive")).not.toBeInTheDocument();
  });

  it("renders the problem content server-side and mounts the client form island", async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(
      problem({
        test_cases: [
          testCase({ is_sample: true, input_data: "1 2", expected_output_data: "3" }),
          testCase({ is_sample: false, input_data: "9 9", expected_output_data: "18" }),
        ],
      }),
    );
    render(await ProblemDetailPage(pageProps()));

    expect(screen.getByRole("heading", { name: "Two Sum" })).toBeInTheDocument();
    expect(screen.getByText("MEDIUM")).toBeInTheDocument();
    const statement = screen.getByText(/Add two numbers\./);
    expect(statement.textContent).toBe("Add two numbers.\nPrint the sum.");

    // Only the sample test case is exposed.
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("18")).not.toBeInTheDocument();
    // Samples are now grouped under "Example n" with plain Input / Output labels.
    expect(screen.getByText("Example 1")).toBeInTheDocument();
    expect(screen.getAllByText(/Input/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Output/i).length).toBeGreaterThan(0);

    // The interactive submit surface is the client island, fed by the server.
    const form = screen.getByTestId("submit-form");
    expect(form.getAttribute("data-problem-id")).toBe("7");
    expect(form.getAttribute("data-languages")).toBe("python3,cpp17");
    expect(form.getAttribute("data-title")).toBe("Two Sum");
  });

  it("renders resource limits when present", async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(
      problem({ default_time_limit_ms: 1000, default_memory_limit_kb: 262144 }),
    );
    render(await ProblemDetailPage(pageProps()));

    expect(screen.getByText("1000 ms")).toBeInTheDocument();
    expect(screen.getByText("262144 KB")).toBeInTheDocument();
  });

  it("omits the limits section when the problem carries none", async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(problem({}));
    render(await ProblemDetailPage(pageProps()));

    expect(screen.queryByText(/Time Limit/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Memory Limit/)).not.toBeInTheDocument();
  });

  it("hides the samples section when no test case is a sample", async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(
      problem({ test_cases: [testCase({ is_sample: false })] }),
    );
    render(await ProblemDetailPage(pageProps()));

    expect(screen.queryByText(/Sample Test Cases/)).not.toBeInTheDocument();
  });

  it("resolves title and statement through the ro -> en fallback chain", async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(
      problem({
        title_i18n: { en: "English title", ro: "Titlu românesc" },
        statement_i18n: { en: "English statement" },
      }),
    );
    mockLocale("ro");
    render(await ProblemDetailPage(pageProps()));

    expect(screen.getByRole("heading", { name: "Titlu românesc" })).toBeInTheDocument();
    expect(screen.getByText("English statement")).toBeInTheDocument();
    expect(screen.getByTestId("submit-form").getAttribute("data-title")).toBe("Titlu românesc");
  });

  it('falls back to "Problem ID: n" when no localized title exists', async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(problem({ title_i18n: {} }));
    render(await ProblemDetailPage(pageProps()));

    expect(screen.getByRole("heading", { name: "Problem ID: 7" })).toBeInTheDocument();
  });

  it("renders an empty statement instead of undefined", async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(problem({ statement_i18n: undefined }));
    render(await ProblemDetailPage(pageProps()));

    // The statement is a <div> with whiteSpace: pre-wrap; when empty the page
    // renders an explicit placeholder instead of an empty <pre>.
    expect(screen.getByText(/No statement/i)).toBeInTheDocument();
  });

  it("passes an empty language list to the form when the problem declares none", async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(problem({ allowed_languages: undefined }));
    render(await ProblemDetailPage(pageProps()));

    expect(screen.getByTestId("submit-form").getAttribute("data-languages")).toBe("");
  });

  it("answers a missing problem with notFound() (404, not a 200 message)", async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(null);

    await expect(ProblemDetailPage(pageProps())).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("renders API failures inline instead of reaching the error boundary", async () => {
    // page.tsx now catches getProblemDetail errors and renders the message in an
    // inline alert (see the try/catch around line 64) rather than rethrowing.
    vi.mocked(getProblemDetail).mockRejectedValue(new Error("Failed to load problem details."));

    render(await ProblemDetailPage(pageProps()));

    // The card renders the generic label plus the raw API message, and a way
    // back to the catalog (dead-end fix).
    expect(screen.getByText(/Failed to load problem details\./)).toBeInTheDocument();
    expect(screen.getByText(/Failed to load problem\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Problems" })).toHaveAttribute(
      "href",
      "/problems",
    );
  });

  it("renders prev/next neighbors from the catalog ids (A18)", async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(problem({}));
    vi.mocked(getProblems).mockResolvedValue([
      problem({ id: 5 }),
      problem({ id: 7 }),
      problem({ id: 9 }),
    ] as ProblemType[]);
    render(await ProblemDetailPage(pageProps()));

    expect(screen.getByRole("link", { name: /Previous problem/ })).toHaveAttribute(
      "href",
      "/problems/5",
    );
    expect(screen.getByRole("link", { name: /Next problem/ })).toHaveAttribute(
      "href",
      "/problems/9",
    );
  });

  it("hides the prev/next pager when the catalog fetch fails", async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(problem({}));
    vi.mocked(getProblems).mockRejectedValue(new Error("catalog down"));
    render(await ProblemDetailPage(pageProps()));

    expect(screen.queryByRole("link", { name: /Previous problem/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Next problem/ })).not.toBeInTheDocument();
  });

  it("offers a copy-link share affordance and sample copy buttons (A18/A7)", async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(
      problem({
        test_cases: [testCase({ is_sample: true, input_data: "1 2", expected_output_data: "3" })],
      }),
    );
    vi.mocked(getProblems).mockResolvedValue([problem({})] as ProblemType[]);
    render(await ProblemDetailPage(pageProps()));

    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
    // One copy button on the sample header.
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });
});

describe("generateMetadata (problem detail)", () => {
  it("derives title and description from the localized problem content", async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(problem({}));

    const metadata = await generateMetadata(pageProps());

    expect(metadata.title).toBe("Two Sum");
    expect(metadata.description).toBe("Add two numbers. Print the sum.");
  });

  it("truncates long statements to 160 characters for the description", async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(
      problem({ statement_i18n: { en: "x".repeat(300) } }),
    );

    const metadata = await generateMetadata(pageProps());

    expect((metadata.description ?? "").length).toBe(160);
  });

  it("uses a generic description when the statement is empty", async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(problem({ statement_i18n: undefined }));

    const metadata = await generateMetadata(pageProps());

    expect(metadata.description).toBe("Solve this problem on WebCoder.");
  });

  it("localizes the title for Romanian visitors", async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(
      problem({ title_i18n: { en: "English title", ro: "Titlu românesc" } }),
    );
    mockLocale("ro");

    const metadata = await generateMetadata(pageProps());

    expect(metadata.title).toBe("Titlu românesc");
  });

  it("returns a not-found title when the problem does not exist", async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(null);

    const metadata = await generateMetadata(pageProps("404"));

    expect(metadata.title).toBe("Problem not found.");
  });
});
