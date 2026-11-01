import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { ProblemType } from "@/types";
import MyCreatedProblemsRoute, { MyCreatedProblemsPage } from "./page";

// Shared mutable auth state: useAuth() returns this object, so tests can flip
// fields (e.g. flip isAuthenticated) between render and interaction, exactly like a
// logout happening mid-session.
const authState = vi.hoisted(() => ({
  isAuthenticated: true,
  user: {
    id: 7,
    username: "creator",
    email: "creator@example.com",
    role: "PROBLEM_CREATOR",
  } as { id: number; username: string; email: string; role: string } | null,
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => authState,
}));

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: nav.push,
    replace: nav.replace,
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/my-created-problems",
  useParams: () => ({}),
}));

const api = vi.hoisted(() => ({
  getProblems: vi.fn(),
  submitForApproval: vi.fn(),
  getTags: vi.fn(),
}));

// collectAllPages mock: single page — the tests only ever provide one page
// of envelope data (the real helper follows `next`; the cap is covered by
// the ApiService unit tests).
vi.mock("@/services/ApiService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/ApiService")>();
  return {
    ...actual,
    collectAllPages: async (fetchPage: (page: number) => Promise<{ results: unknown[] }>) => {
      const response = await fetchPage(1);
      return response.results;
    },
    ProblemService: {
      getProblems: api.getProblems,
      submitForApproval: api.submitForApproval,
      getTags: api.getTags,
    },
  };
});

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("react-hot-toast", () => ({
  // The ported pages use the default import (`import toast from ...`),
  // so the mock must provide both shapes.
  default: toasts,
  toast: toasts,
}));

// author.id = 7 matches the authenticated creator (the page filters the
// paginated list client-side because the backend ignores ?authorId=).
const PROBLEMS: ProblemType[] = [
  {
    id: 1,
    title_i18n: { en: "Two Sum", ro: "Suma a Două" },
    difficulty: "EASY",
    status: "DRAFT",
    author: { id: 7, username: "creator" },
  },
  {
    id: 2,
    title_i18n: { en: "Segments" },
    difficulty: "MEDIUM",
    status: "PRIVATE",
    verifier_feedback: "Statement too vague.",
    author: { id: 7, username: "creator" },
  },
  {
    id: 3,
    title_i18n: { en: "Max Flow" },
    difficulty: "HARD",
    status: "APPROVED",
    author: { id: 7, username: "creator" },
  },
  {
    id: 4,
    title_i18n: { en: "No Feedback" },
    difficulty: "EASY",
    status: "PRIVATE",
    author: { id: 7, username: "creator" },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  authState.isAuthenticated = true;
  authState.user = {
    id: 7,
    username: "creator",
    email: "creator@example.com",
    role: "PROBLEM_CREATOR",
  };
  api.getProblems.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
});

// vitest runs with globals: false, so @testing-library auto-cleanup never
// registers on its own; unmount explicitly or the DOM leaks across tests.
afterEach(() => {
  cleanup();
});

describe("MyCreatedProblemsPage (/my-created-problems)", () => {
  it("renders the spinner while fetching, then the problems table", async () => {
    let resolveProblems!: (v: {
      count: number;
      next: null;
      previous: null;
      results: ProblemType[];
    }) => void;
    api.getProblems.mockImplementation(
      () =>
        new Promise<{ count: number; next: null; previous: null; results: ProblemType[] }>(
          (res) => {
            resolveProblems = res;
          },
        ),
    );
    const { container } = render(<MyCreatedProblemsRoute />);

    expect(screen.getByText("Loading...")).toBeInTheDocument();
    await act_resolve(resolveProblems, {
      count: 1,
      next: null,
      previous: null,
      results: [PROBLEMS[0]],
    });

    expect(await screen.findByText("My Created Problems")).toBeInTheDocument();
    expect(api.getProblems).toHaveBeenCalledWith({}, { page: 1, pageSize: 100 });
    expect(container.querySelector('a[href="/problems/1"]')?.textContent).toBe("Two Sum");
    expect(container.querySelector('a[href="/problems/1/edit"]')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit for Approval" })).toBeInTheDocument();
    expect(screen.getByText("DRAFT")).toBeInTheDocument();
    expect(screen.getByText("EASY")).toBeInTheDocument();
  });

  it("renders the empty state when the author has no problems", async () => {
    api.getProblems.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
    render(<MyCreatedProblemsRoute />);

    expect(await screen.findByText("You have not created any problems yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows the table headers and per-status actions", async () => {
    api.getProblems.mockResolvedValue({
      count: PROBLEMS.length,
      next: null,
      previous: null,
      results: PROBLEMS,
    });
    render(<MyCreatedProblemsRoute />);

    expect(await screen.findByText("Two Sum")).toBeInTheDocument();
    for (const header of ["Title", "Status", "Difficulty", "Actions"]) {
      expect(screen.getByText(header)).toBeInTheDocument();
    }

    // Edit links exist for DRAFT and PRIVATE rows only (3 of 4).
    expect(screen.getAllByRole("link", { name: "Edit" })).toHaveLength(3);

    // Submit-for-Approval only on the DRAFT row.
    expect(screen.getAllByRole("button", { name: "Submit for Approval" })).toHaveLength(1);

    // PRIVATE with feedback renders the feedback line; PRIVATE without does not.
    expect(screen.getByText("Feedback: Statement too vague.")).toBeInTheDocument();
    expect(screen.queryByText(/Feedback: $/)).not.toBeInTheDocument();
    expect(screen.getByText("APPROVED")).toBeInTheDocument();
  });

  it("shows the server error message when fetching fails", async () => {
    api.getProblems.mockRejectedValue(new Error("Network down"));
    render(<MyCreatedProblemsRoute />);

    const error = await screen.findByText("Network down");
    expect(error).toBeInTheDocument();
    // colour now comes from the theme token var(--danger) (#f87171); jsdom does
    // not resolve CSS custom properties, so assert the inline style verbatim.
    expect((error as HTMLElement).style.color).toBe("var(--danger)");
  });

  it("falls back to the generic message when the failure has none", async () => {
    api.getProblems.mockRejectedValue({});
    render(<MyCreatedProblemsRoute />);

    expect(await screen.findByText("Failed to load your problems.")).toBeInTheDocument();
  });

  it("shows an auth error without fetching when unauthenticated", async () => {
    authState.isAuthenticated = false;
    render(<MyCreatedProblemsRoute />);

    expect(await screen.findByText("Authentication required.")).toBeInTheDocument();
    expect(api.getProblems).not.toHaveBeenCalled();
  });

  it("does not fetch when authenticated without a user", async () => {
    authState.user = null;
    // Rendered via the inner component: through the guarded route a null user
    // null-renders before this branch could execute.
    render(<MyCreatedProblemsPage />);

    expect(screen.getByText("Loading...")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 0));
    expect(api.getProblems).not.toHaveBeenCalled();
  });

  it("renders nothing through the guarded route when fully signed out", async () => {
    authState.isAuthenticated = false;
    authState.user = null;
    const { container } = render(<MyCreatedProblemsRoute />);

    // ProtectedRoute null-renders without a user; no fetch ever fires.
    expect(container).toBeEmptyDOMElement();
    await new Promise((r) => setTimeout(r, 0));
    expect(api.getProblems).not.toHaveBeenCalled();
  });

  it("submits a draft for approval: optimistic flip + success toast", async () => {
    // Second row (different id) exercises the untouched-row side of the flip.
    api.getProblems.mockResolvedValue({
      count: 2,
      next: null,
      previous: null,
      results: [PROBLEMS[0], PROBLEMS[2]],
    });
    render(<MyCreatedProblemsRoute />);
    await screen.findByText("Two Sum");

    fireEvent.click(screen.getByRole("button", { name: "Submit for Approval" }));

    await waitFor(() => expect(api.submitForApproval).toHaveBeenCalledWith(1));
    expect(await screen.findByText("PENDING_APPROVAL")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit for Approval" })).not.toBeInTheDocument();
    expect(toasts.success).toHaveBeenCalledWith("Problem submitted for approval!");
  });

  it("shows the server message in the error toast when submission fails", async () => {
    api.getProblems.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [PROBLEMS[0]],
    });
    api.submitForApproval.mockRejectedValue(new Error("boom"));
    render(<MyCreatedProblemsRoute />);
    await screen.findByText("Two Sum");

    fireEvent.click(screen.getByRole("button", { name: "Submit for Approval" }));

    await waitFor(() =>
      expect(toasts.error).toHaveBeenCalledWith("Failed to submit for approval: boom"),
    );
    expect(screen.getByText("DRAFT")).toBeInTheDocument();
  });

  it("falls back to Unknown error when the failure has no message", async () => {
    api.getProblems.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [PROBLEMS[0]],
    });
    api.submitForApproval.mockRejectedValue({});
    render(<MyCreatedProblemsRoute />);
    await screen.findByText("Two Sum");

    fireEvent.click(screen.getByRole("button", { name: "Submit for Approval" }));

    await waitFor(() =>
      expect(toasts.error).toHaveBeenCalledWith("Failed to submit for approval: Unknown error"),
    );
  });

  it("blocks the submit action with a toast when the session disappeared", async () => {
    api.getProblems.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [PROBLEMS[0]],
    });
    render(<MyCreatedProblemsRoute />);
    await screen.findByText("Two Sum");

    authState.isAuthenticated = false;
    fireEvent.click(screen.getByRole("button", { name: "Submit for Approval" }));

    await waitFor(() =>
      expect(toasts.error).toHaveBeenCalledWith("Authentication required for this action."),
    );
    expect(api.submitForApproval).not.toHaveBeenCalled();
  });

  it("renders the localized title when present, falling back to English", async () => {
    const { default: i18n } = await import("@/i18n");
    api.getProblems.mockResolvedValue({
      count: [
        {
          id: 10,
          title_i18n: { en: "Only EN", ro: "Doar RO" },
          difficulty: "EASY",
          status: "DRAFT",
          author: { id: 7, username: "creator" },
        },
        {
          id: 11,
          title_i18n: { en: "EN Fallback" },
          difficulty: "EASY",
          status: "DRAFT",
          author: { id: 7, username: "creator" },
        },
      ].length,
      next: null,
      previous: null,
      results: [
        {
          id: 10,
          title_i18n: { en: "Only EN", ro: "Doar RO" },
          difficulty: "EASY",
          status: "DRAFT",
          author: { id: 7, username: "creator" },
        },
        {
          id: 11,
          title_i18n: { en: "EN Fallback" },
          difficulty: "EASY",
          status: "DRAFT",
          author: { id: 7, username: "creator" },
        },
      ],
    });
    render(<MyCreatedProblemsRoute />);

    await screen.findByText("Only EN");
    await act_async(() => i18n.changeLanguage("ro"));
    expect(await screen.findByText("Doar RO")).toBeInTheDocument();
    expect(screen.getByText("EN Fallback")).toBeInTheDocument();
    await act_async(() => i18n.changeLanguage("en"));
  });

  it("redirects to /login when there is no user (guard)", async () => {
    authState.user = null;
    render(<MyCreatedProblemsRoute />);

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("My Created Problems")).not.toBeInTheDocument();
    expect(api.getProblems).not.toHaveBeenCalled();
  });

  it("redirects to / when the role is not authorized (guard)", async () => {
    authState.user = { id: 8, username: "basic", email: "b@example.com", role: "BASIC_USER" };
    render(<MyCreatedProblemsRoute />);

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/"));
    expect(screen.queryByText("My Created Problems")).not.toBeInTheDocument();
    expect(api.getProblems).not.toHaveBeenCalled();
  });
});

// Small helpers so the deferred-promise and language switches run inside act().
async function act_resolve<T>(resolve: (v: T) => void, value: T) {
  const { act } = await import("@testing-library/react");
  await act(async () => {
    resolve(value);
  });
}

async function act_async(fn: () => unknown | Promise<unknown>) {
  const { act } = await import("@testing-library/react");
  await act(async () => {
    await fn();
  });
}
