import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import ForumPage from "./page";

// Forum index tests (frontend wiring wave): threads come from
// GET /forum/threads/ (page-number paginated, ordered pinned-then-activity).
// Covers: thread rows with real backend fields (problem link, post_count,
// pinned/locked badges), problem/general filters, client-side search,
// Load-more following `next`, and the error/retry state.

const api = vi.hoisted(() => ({ getThreads: vi.fn() }));

vi.mock("@/services/ApiService", () => ({
  ForumService: { getThreads: api.getThreads },
}));

const thread = (id: number, partial: Record<string, unknown> = {}) => ({
  id,
  title: `Thread ${id}`,
  problem: null,
  author: "author_a",
  post_count: 2,
  is_pinned: false,
  is_locked: false,
  last_activity: "2026-10-20T10:00:00Z",
  created_at: "2026-10-19T10:00:00Z",
  ...partial,
});

const THREADS = [
  thread(1, { title: "Pinned welcome", is_pinned: true, author: "admin" }),
  thread(2, {
    title: "Dijkstra help",
    problem: { id: 7, title_i18n: { en: "Graph Shortest Path" } },
    author: "mihai_dev",
  }),
  thread(3, { title: "Locked bug thread", is_locked: true }),
];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("ForumPage (live threads)", () => {
  it("renders real thread rows: badges, problem chip, author, post count", async () => {
    api.getThreads.mockResolvedValue({ count: 3, next: null, previous: null, results: THREADS });
    render(<ForumPage />);

    expect(await screen.findByText("Pinned welcome")).toBeInTheDocument();
    expect(screen.getByText("📌 Pinned")).toBeInTheDocument();
    expect(screen.getByText("🔒 Locked")).toBeInTheDocument();
    // Problem-linked thread shows the linked problem chip, linking to the problem.
    expect(screen.getByText("🧩 Graph Shortest Path")).toHaveAttribute("href", "/problems/7");
    expect(screen.getByText("mihai_dev")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dijkstra help" })).toHaveAttribute("href", "/forum/2");
    // No Load more without next.
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("filters problem-linked vs general threads", async () => {
    api.getThreads.mockResolvedValue({ count: 3, next: null, previous: null, results: THREADS });
    render(<ForumPage />);
    await screen.findByText("Dijkstra help");

    fireEvent.click(screen.getByRole("button", { name: /Problem threads/ }));
    expect(screen.getByText("Dijkstra help")).toBeInTheDocument();
    expect(screen.queryByText("Pinned welcome")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /General/ }));
    expect(screen.getByText("Pinned welcome")).toBeInTheDocument();
    expect(screen.queryByText("Dijkstra help")).not.toBeInTheDocument();
  });

  it("searches the loaded rows client-side", async () => {
    api.getThreads.mockResolvedValue({ count: 3, next: null, previous: null, results: THREADS });
    render(<ForumPage />);
    await screen.findByText("Dijkstra help");

    fireEvent.change(screen.getByLabelText("Search threads"), { target: { value: "dijkstra" } });
    expect(screen.getByText("Dijkstra help")).toBeInTheDocument();
    expect(screen.queryByText("Pinned welcome")).not.toBeInTheDocument();
  });

  it("appends the next page on Load more", async () => {
    api.getThreads
      .mockResolvedValueOnce({
        count: 4,
        next: "http://localhost:8000/api/v1/forum/threads/?page=2",
        previous: null,
        results: THREADS,
      })
      .mockResolvedValueOnce({
        count: 4,
        next: null,
        previous: null,
        results: [thread(4, { title: "Second page thread" })],
      });
    render(<ForumPage />);

    expect(await screen.findByText("Dijkstra help")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getByText("Second page thread")).toBeInTheDocument());
    expect(api.getThreads).toHaveBeenLastCalledWith({ page: 2 });
    expect(screen.getByText(/Showing 4 of 4 threads/)).toBeInTheDocument();
  });

  it("renders the error card with retry when the API fails", async () => {
    api.getThreads.mockRejectedValue(new Error("Service unavailable"));
    render(<ForumPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load threads: Service unavailable",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(api.getThreads).toHaveBeenCalledTimes(2));
  });

  it("renders the empty state for an empty forum", async () => {
    api.getThreads.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
    render(<ForumPage />);
    expect(await screen.findByText("No threads yet.")).toBeInTheDocument();
  });
});
