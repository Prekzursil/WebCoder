import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import type { User } from "@/types";
import { ProblemType } from "@/types";
import ProblemsListClient from "./ProblemsListClient";

// Client-island behavior tests for the F3 rework: URL-synced filters,
// ?q= initialization, column sorting, and the localized empty state.

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: false,
    user: null as User | null,
    login: vi.fn(),
    logout: vi.fn(),
  },
  params: new URLSearchParams(),
  replace: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/problems",
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => mocks.params,
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => mocks.auth,
}));

const apiMocks = vi.hoisted(() => ({
  getTags: vi.fn(),
  getSolvedIds: vi.fn(),
}));

vi.mock("@/services/ApiService", () => ({
  ProblemService: {
    getTags: apiMocks.getTags,
    getProblems: vi.fn(),
  },
  AuthService: {
    getSolvedIds: apiMocks.getSolvedIds,
  },
}));

const problem = (partial: Partial<ProblemType>): ProblemType =>
  ({
    id: 1,
    title_i18n: { en: "Problem" },
    difficulty: "EASY",
    status: "APPROVED",
    ...partial,
  }) as ProblemType;

const CATALOG: ProblemType[] = [
  problem({
    id: 3,
    title_i18n: { en: "Binary Search" },
    difficulty: "MEDIUM",
    tags: [{ id: 2, name_i18n: { en: "Sorting" }, slug: "sorting" }],
  }),
  problem({
    id: 1,
    title_i18n: { en: "Two Sum" },
    difficulty: "EASY",
    tags: [{ id: 1, name_i18n: { en: "Arrays" }, slug: "arrays" }],
  }),
  problem({
    id: 2,
    title_i18n: { en: "Aho-Corasick" },
    difficulty: "HARD",
    tags: [{ id: 2, name_i18n: { en: "Sorting" }, slug: "sorting" }],
  }),
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = new URLSearchParams();
  mocks.auth.isAuthenticated = false;
  mocks.auth.user = null;
  apiMocks.getTags.mockResolvedValue({
    count: 0,
    next: null,
    previous: null,
    results: [
      { id: 1, name_i18n: { en: "Arrays" }, slug: "arrays" },
      { id: 2, name_i18n: { en: "Sorting" }, slug: "sorting" },
    ],
  });
  apiMocks.getSolvedIds.mockResolvedValue({ solved: [], attempted: [] });
});

afterEach(cleanup);

describe("ProblemsListClient URL-synced filters [F3]", () => {
  it("initializes the search box from ?q= on mount", () => {
    mocks.params = new URLSearchParams("q=two");
    render(
      <ProblemsListClient
        problems={CATALOG}
        fetchError={null}
        locale="en"
        totalCount={3}
        hasMore={false}
      />,
    );
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("two");
    // Filtered to the single matching row.
    expect(screen.getByRole("link", { name: "Two Sum" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Aho-Corasick" })).not.toBeInTheDocument();
  });

  it("pushes ?q= into the URL as the user types", () => {
    render(
      <ProblemsListClient
        problems={CATALOG}
        fetchError={null}
        locale="en"
        totalCount={3}
        hasMore={false}
      />,
    );
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "sum" } });
    expect(mocks.replace).toHaveBeenCalledWith("/problems?q=sum", { scroll: false });
  });

  it("syncs the difficulty filter to ?difficulty=", () => {
    render(
      <ProblemsListClient
        problems={CATALOG}
        fetchError={null}
        locale="en"
        totalCount={3}
        hasMore={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "hard" }));
    expect(mocks.replace).toHaveBeenCalledWith("/problems?difficulty=hard", { scroll: false });
    expect(screen.getByRole("link", { name: "Aho-Corasick" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Two Sum" })).not.toBeInTheDocument();
  });

  it("clears every filter param on the Clear button", () => {
    mocks.params = new URLSearchParams("q=x&difficulty=easy");
    render(
      <ProblemsListClient
        problems={CATALOG}
        fetchError={null}
        locale="en"
        totalCount={3}
        hasMore={false}
      />,
    );
    // Two Clear buttons render (filter bar + empty-state action) when the
    // filters match nothing — the filter-bar one comes first.
    fireEvent.click(screen.getAllByRole("button", { name: /Clear/i })[0]);
    expect(mocks.replace).toHaveBeenCalledWith("/problems", { scroll: false });
  });

  it("renders the localized no-match empty state with a clear action", () => {
    mocks.params = new URLSearchParams("q=zzz-nothing");
    render(
      <ProblemsListClient
        problems={CATALOG}
        fetchError={null}
        locale="en"
        totalCount={3}
        hasMore={false}
      />,
    );
    expect(screen.getByText("No problems match your filters.")).toBeInTheDocument();
  });
});

describe("ProblemsListClient column sorting [F3]", () => {
  const rowTitles = () =>
    within(screen.getByRole("table"))
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.textContent ?? "");

  it("sorts by title asc then desc on repeated clicks, with aria-sort", () => {
    render(
      <ProblemsListClient
        problems={CATALOG}
        fetchError={null}
        locale="en"
        totalCount={3}
        hasMore={false}
      />,
    );

    const titleHeader = screen.getByRole("columnheader", { name: /Title/ });
    expect(titleHeader).toHaveAttribute("aria-sort", "none");

    fireEvent.click(within(titleHeader).getByRole("button"));
    expect(titleHeader).toHaveAttribute("aria-sort", "ascending");
    let titles = rowTitles();
    expect(titles[0]).toContain("Aho-Corasick");
    expect(titles[2]).toContain("Two Sum");

    fireEvent.click(within(titleHeader).getByRole("button"));
    expect(titleHeader).toHaveAttribute("aria-sort", "descending");
    titles = rowTitles();
    expect(titles[0]).toContain("Two Sum");
    expect(titles[2]).toContain("Aho-Corasick");
  });

  it("sorts by difficulty with the easy<medium<hard order", () => {
    render(
      <ProblemsListClient
        problems={CATALOG}
        fetchError={null}
        locale="en"
        totalCount={3}
        hasMore={false}
      />,
    );
    const diffHeader = screen.getByRole("columnheader", { name: /Difficulty/ });
    fireEvent.click(within(diffHeader).getByRole("button"));
    const titles = rowTitles();
    expect(titles[0]).toContain("Two Sum"); // easy first
    expect(titles[1]).toContain("Binary Search"); // medium
    expect(titles[2]).toContain("Aho-Corasick"); // hard
  });
});

describe("ProblemsListClient status facet gating [F7]", () => {
  it("hides the status facet and column from anonymous visitors", () => {
    render(
      <ProblemsListClient
        problems={CATALOG}
        fetchError={null}
        locale="en"
        totalCount={3}
        hasMore={false}
      />,
    );
    expect(screen.queryByText("Status:")).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /Status/ })).not.toBeInTheDocument();
  });

  it("shows the status facet only to creator/verifier/admin roles", () => {
    mocks.auth.isAuthenticated = true;
    mocks.auth.user = { id: 1, username: "v", email: "v@example.com", role: "PROBLEM_CREATOR" };
    render(
      <ProblemsListClient
        problems={CATALOG}
        fetchError={null}
        locale="en"
        totalCount={3}
        hasMore={false}
      />,
    );
    expect(screen.getByText("Status:")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Status/ })).toBeInTheDocument();
    // Real backend choices only.
    for (const choice of ["draft", "pending_approval", "approved", "private"]) {
      expect(screen.getByRole("button", { name: choice })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "rejected" })).not.toBeInTheDocument();
  });
});

describe("Wave A: tag facet [F4] + solved indicators [F5] + curriculum axis [EDU-9]", () => {
  it("filters by a selected tag chip", async () => {
    render(
      <ProblemsListClient
        problems={CATALOG}
        fetchError={null}
        locale="en"
        totalCount={3}
        hasMore={false}
      />,
    );
    const arraysChip = await screen.findByRole("button", { name: "Arrays" });
    fireEvent.click(arraysChip);
    expect(screen.getByRole("link", { name: "Two Sum" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Aho-Corasick" })).not.toBeInTheDocument();
  });

  it("renders the solved indicator column for authenticated solvers", async () => {
    mocks.auth.isAuthenticated = true;
    apiMocks.getSolvedIds.mockResolvedValue({ solved: [1], attempted: [3] });
    render(
      <ProblemsListClient
        problems={CATALOG}
        fetchError={null}
        locale="en"
        totalCount={3}
        hasMore={false}
      />,
    );
    // "Solved" labels: the column header + the one solved row.
    const solvedMarks = await screen.findAllByLabelText("Solved");
    expect(solvedMarks).toHaveLength(2);
    expect(screen.getByLabelText("Attempted")).toBeInTheDocument();
    expect(screen.getByLabelText("Not attempted")).toBeInTheDocument();
  });

  it("hides solved rows when the hide-solved toggle is on", async () => {
    mocks.auth.isAuthenticated = true;
    apiMocks.getSolvedIds.mockResolvedValue({ solved: [1], attempted: [] });
    render(
      <ProblemsListClient
        problems={CATALOG}
        fetchError={null}
        locale="en"
        totalCount={3}
        hasMore={false}
      />,
    );
    const toggle = await screen.findByRole("button", { name: "Hide solved" });
    fireEvent.click(toggle);
    expect(screen.queryByRole("link", { name: "Two Sum" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Aho-Corasick" })).toBeInTheDocument();
  });

  it("renders curriculum grade chips and drills into chapters via the URL", async () => {
    const curriculum = [
      {
        id: 10,
        kind: "GRADE",
        slug: "g9",
        order: 10,
        name_i18n: { en: "Grade 9", ro: "Clasa a IX-a" },
        problem_count: 2,
        children: [
          {
            id: 11,
            kind: "CHAPTER",
            slug: "g9-elementary",
            order: 1,
            name_i18n: { en: "Elementary algorithms", ro: "Algoritmi elementari" },
            problem_count: 1,
          },
        ],
      },
    ];
    mocks.params = new URLSearchParams("curriculum=10");
    render(
      <ProblemsListClient
        problems={CATALOG}
        fetchError={null}
        locale="en"
        totalCount={3}
        hasMore={false}
        curriculum={curriculum}
      />,
    );
    expect(screen.getByRole("button", { name: /Grade 9/ })).toBeInTheDocument();
    // Chapter chips appear under the active grade.
    const chapter = await screen.findByRole("button", { name: /Elementary algorithms/i });
    fireEvent.click(chapter);
    expect(mocks.replace).toHaveBeenCalledWith(
      expect.stringContaining("curriculum=11"),
      expect.anything(),
    );
  });

  it("links first-run visitors to /start [ONB-1]", () => {
    render(
      <ProblemsListClient
        problems={CATALOG}
        fetchError={null}
        locale="en"
        totalCount={3}
        hasMore={false}
      />,
    );
    expect(
      screen.getByRole("link", { name: /Start with three classic problems/i }),
    ).toHaveAttribute("href", "/start");
  });
});
