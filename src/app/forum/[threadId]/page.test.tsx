import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { User } from "@/types";
import ThreadPage from "./page";

// Thread detail tests (frontend wiring wave): GET /forum/threads/{id}/ +
// GET /forum/threads/{id}/posts/ (oldest-first cursor pagination), reply via
// POST, votes via POST /forum/posts/{id}/vote/, reports via POST
// /forum/reports/. Unknown threads render the not-found state.

const api = vi.hoisted(() => ({
  getThread: vi.fn(),
  getPosts: vi.fn(),
  createPost: vi.fn(),
  votePost: vi.fn(),
  reportPost: vi.fn(),
}));

vi.mock("@/services/ApiService", () => ({
  FollowService: {
    toggleByUsername: vi.fn().mockResolvedValue({ following: true, followers: 1 }),
  },
  ForumService: {
    getThread: api.getThread,
    getPosts: api.getPosts,
    createPost: api.createPost,
    votePost: api.votePost,
    reportPost: api.reportPost,
  },
}));

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    user: { id: 1, username: "bob", email: "b@x.com", role: "BASIC_USER" } as User | null,
    login: vi.fn(),
    logout: vi.fn(),
  },
  params: { threadId: "3" },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => mocks.auth,
}));

vi.mock("next/navigation", () => ({
  useParams: () => mocks.params,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const THREAD = {
  id: 3,
  title: "Why does my Python solution get TLE?",
  problem: { id: 5, title_i18n: { en: "Merge Sort" } },
  author: "radu_bits",
  post_count: 2,
  is_pinned: false,
  is_locked: false,
  last_activity: "2026-10-20T10:00:00Z",
  created_at: "2026-10-18T09:30:00Z",
};

const POSTS = [
  {
    id: 1,
    thread_id: 3,
    author: "radu_bits",
    content: "First post",
    parent_id: null,
    is_edited: false,
    upvotes: 12,
    is_hidden: false,
    hidden_reason: "",
    created_at: "2026-10-18T09:30:00Z",
  },
  {
    id: 2,
    thread_id: 3,
    author: "mihai_dev",
    content: "Reply here",
    parent_id: 1,
    is_edited: true,
    upvotes: 8,
    is_hidden: false,
    hidden_reason: "",
    created_at: "2026-10-18T10:15:00Z",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.isAuthenticated = true;
  mocks.auth.user = { id: 1, username: "bob", email: "b@x.com", role: "BASIC_USER" };
  mocks.params.threadId = "3";
});

afterEach(cleanup);

describe("ForumThreadPage (live thread)", () => {
  it("renders the thread header and posts with vote counts and edited marker", async () => {
    api.getThread.mockResolvedValue(THREAD);
    api.getPosts.mockResolvedValue({ next: null, previous: null, results: POSTS });
    render(<ThreadPage />);

    expect(
      await screen.findByRole("heading", { name: "Why does my Python solution get TLE?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("🧩 Merge Sort")).toHaveAttribute("href", "/problems/5");
    expect(screen.getByText("First post")).toBeInTheDocument();
    expect(screen.getByText("(edited)")).toBeInTheDocument();
    expect(screen.getByText("2 posts")).toBeInTheDocument();
    // Oldest-first cursor page fully loaded -> no Load older posts button.
    expect(screen.queryByRole("button", { name: "Load older posts" })).not.toBeInTheDocument();
  });

  it("loads older posts via the cursor when next is present", async () => {
    api.getThread.mockResolvedValue(THREAD);
    api.getPosts
      .mockResolvedValueOnce({
        next: "http://localhost:8000/api/v1/forum/threads/3/posts/?cursor=abc",
        previous: null,
        results: POSTS,
      })
      .mockResolvedValueOnce({
        next: null,
        previous: null,
        results: [
          {
            id: 0,
            thread_id: 3,
            author: "old",
            content: "Oldest post",
            parent_id: null,
            is_edited: false,
            upvotes: 1,
            is_hidden: false,
            hidden_reason: "",
            created_at: "2026-10-17T10:00:00Z",
          },
        ],
      });
    render(<ThreadPage />);

    expect(await screen.findByText("First post")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load older posts" }));
    await waitFor(() => expect(screen.getByText("Oldest post")).toBeInTheDocument());
    expect(api.getPosts).toHaveBeenLastCalledWith("3", { cursor: "abc", pageSize: 25 });
  });

  it("posts a reply and appends it locally", async () => {
    api.getThread.mockResolvedValue(THREAD);
    api.getPosts.mockResolvedValue({ next: null, previous: null, results: POSTS });
    api.createPost.mockResolvedValue({
      id: 3,
      thread_id: 3,
      author: "bob",
      content: "My reply",
      parent_id: null,
      is_edited: false,
      upvotes: 0,
      is_hidden: false,
      hidden_reason: "",
      created_at: "2026-10-21T00:00:00Z",
    });
    render(<ThreadPage />);

    await screen.findByText("First post");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "My reply" } });
    fireEvent.click(screen.getByRole("button", { name: "Post Reply" }));
    // COM-1: the spoiler flag rides every reply (false for plain ones).
    await waitFor(() =>
      expect(api.createPost).toHaveBeenCalledWith("3", { content: "My reply", isSpoiler: false }),
    );
    await waitFor(() => expect(screen.getByText("My reply")).toBeInTheDocument());
  });

  it("surfaces the backend error when the reply is rejected (locked/hidden)", async () => {
    api.getThread.mockResolvedValue(THREAD);
    api.getPosts.mockResolvedValue({ next: null, previous: null, results: POSTS });
    api.createPost.mockRejectedValue(new Error("This thread is locked."));
    render(<ThreadPage />);

    await screen.findByText("First post");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "My reply" } });
    fireEvent.click(screen.getByRole("button", { name: "Post Reply" }));
    await waitFor(() => expect(screen.getByText("This thread is locked.")).toBeInTheDocument());
  });

  it("votes a post and updates the denormalized score", async () => {
    api.getThread.mockResolvedValue(THREAD);
    api.getPosts.mockResolvedValue({ next: null, previous: null, results: POSTS });
    api.votePost.mockResolvedValue({ upvotes: 13 });
    render(<ThreadPage />);

    await screen.findByText("First post");
    fireEvent.click(screen.getAllByRole("button", { name: "Upvote post" })[0]);
    await waitFor(() => expect(api.votePost).toHaveBeenCalledWith(1, 1));
    await waitFor(() => expect(screen.getByText("13")).toBeInTheDocument());
  });

  it("reports a post through the report endpoint", async () => {
    api.getThread.mockResolvedValue(THREAD);
    api.getPosts.mockResolvedValue({ next: null, previous: null, results: POSTS });
    api.reportPost.mockResolvedValue({
      id: 1,
      post_id: 1,
      reporter: "bob",
      reason: "spam",
      details: "",
      status: "OPEN",
      resolution_note: "",
      resolved_by: null,
      created_at: "2026-10-21T00:00:00Z",
    });
    render(<ThreadPage />);

    await screen.findByText("First post");
    fireEvent.click(screen.getAllByRole("button", { name: "⚑ Report" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(api.reportPost).toHaveBeenCalledWith(1, { reason: "spam", details: undefined }),
    );
    expect(
      await screen.findByText("Report submitted. A moderator will review it."),
    ).toBeInTheDocument();
  });

  it("renders the locked notice instead of the reply box for locked threads", async () => {
    api.getThread.mockResolvedValue({ ...THREAD, is_locked: true });
    api.getPosts.mockResolvedValue({ next: null, previous: null, results: POSTS });
    render(<ThreadPage />);

    expect(await screen.findByText(/This thread is locked/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Post Reply" })).not.toBeInTheDocument();
  });

  it("shows the login prompt instead of the reply box for anonymous visitors", async () => {
    mocks.auth.isAuthenticated = false;
    mocks.auth.user = null;
    api.getThread.mockResolvedValue(THREAD);
    api.getPosts.mockResolvedValue({ next: null, previous: null, results: POSTS });
    render(<ThreadPage />);

    expect(await screen.findByRole("link", { name: "Log in" })).toBeInTheDocument();
    expect(screen.getByText("to join the discussion.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Post Reply" })).not.toBeInTheDocument();
  });

  it("renders the not-found state for a missing thread", async () => {
    api.getThread.mockRejectedValue(new Error("Not found."));
    api.getPosts.mockResolvedValue({ next: null, previous: null, results: [] });
    render(<ThreadPage />);

    expect(
      await screen.findByText("This thread does not exist or was removed."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Back to Forum" })).toHaveAttribute("href", "/forum");
  });

  it("renders the error card with retry on a transient failure", async () => {
    api.getThread.mockRejectedValue(new Error("Service unavailable"));
    api.getPosts.mockResolvedValue({ next: null, previous: null, results: [] });
    render(<ThreadPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load thread: Service unavailable",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(api.getThread).toHaveBeenCalledTimes(2));
  });
});
