import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { User } from "@/types";
import NotificationsPage from "./page";

// Notifications page tests (frontend wiring wave): the page consumes
// GET /notifications/ (newest-first cursor pagination, ?unread=true), POST
// /{id}/mark-read/ and POST /mark-all-read/. Verb + data payload are
// translated into the displayed title/body; the generic target becomes the
// click-through link. The old mock list / fake incoming-notification timer /
// delete button (no endpoint) are gone.

const api = vi.hoisted(() => ({
  getNotifications: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  getUnreadCount: vi.fn(),
}));

vi.mock("@/services/ApiService", () => ({
  NotificationService: {
    getNotifications: api.getNotifications,
    markRead: api.markRead,
    markAllRead: api.markAllRead,
    getUnreadCount: api.getUnreadCount,
  },
}));

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    user: { id: 1, username: "bob", email: "b@x.com", role: "BASIC_USER" } as User | null,
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => mocks.auth,
}));

const notif = (id: number, partial: Record<string, unknown> = {}) => ({
  id,
  verb: "SYSTEM",
  actor: null,
  target_type: null,
  target_id: null,
  data: {},
  read_at: null,
  created_at: "2026-10-21T00:00:00Z",
  ...partial,
});

const NOTIFICATIONS = [
  notif(1, {
    verb: "SUBMISSION_JUDGED",
    target_type: "submission",
    target_id: 101,
    data: { verdict: "AC", problem_id: 5, submission_id: 101 },
  }),
  notif(2, {
    verb: "THREAD_REPLY",
    actor: "mihai_dev",
    target_type: "thread",
    target_id: 3,
    data: { post_id: 9, title: "Dijkstra help" },
    read_at: "2026-10-20T00:00:00Z",
  }),
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.isAuthenticated = true;
  mocks.auth.user = { id: 1, username: "bob", email: "b@x.com", role: "BASIC_USER" };
});

afterEach(cleanup);

describe("NotificationsPage (live events)", () => {
  it("renders the notification list derived from verb + data payload", async () => {
    api.getNotifications.mockResolvedValue({ next: null, previous: null, results: NOTIFICATIONS });
    render(<NotificationsPage />);

    // SUBMISSION_JUDGED -> verdict chip, derived title/body, submission link.
    expect(await screen.findByText("Submission AC")).toBeInTheDocument();
    expect(
      screen.getByText(/Your submission #101 on problem #5 was judged AC/),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Submission AC/ });
    expect(link).toHaveAttribute("href", "/submissions/101");
    expect(screen.getByText("Verdict")).toBeInTheDocument();

    // THREAD_REPLY -> reply chip with actor, thread link.
    expect(
      screen.getByText('mihai_dev replied to your thread "Dijkstra help"'),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /mihai_dev replied/ })).toHaveAttribute(
      "href",
      "/forum/3",
    );

    // Unread badge shows the unread count (1 of 2).
    expect(screen.getByText("1 new")).toBeInTheDocument();
  });

  it("requires login for the list (anonymous empty state)", () => {
    mocks.auth.isAuthenticated = false;
    mocks.auth.user = null;
    render(<NotificationsPage />);
    expect(screen.getByText("Log in to see your notifications.")).toBeInTheDocument();
    expect(api.getNotifications).not.toHaveBeenCalled();
  });

  it("marks one notification read through the endpoint", async () => {
    api.getNotifications.mockResolvedValue({
      next: null,
      previous: null,
      results: [NOTIFICATIONS[0]],
    });
    api.markRead.mockResolvedValue({ ...NOTIFICATIONS[0], read_at: "2026-10-21T01:00:00Z" });
    render(<NotificationsPage />);

    expect(await screen.findByText("Submission AC")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "✓ Read" }));
    await waitFor(() => expect(api.markRead).toHaveBeenCalledWith(1));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "✓ Read" })).not.toBeInTheDocument(),
    );
  });

  it("marks everything read through the bulk endpoint", async () => {
    api.getNotifications.mockResolvedValue({ next: null, previous: null, results: NOTIFICATIONS });
    api.markAllRead.mockResolvedValue({ marked: 1 });
    render(<NotificationsPage />);

    expect(await screen.findByText("Mark all read")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Mark all read"));
    await waitFor(() => expect(api.markAllRead).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("Mark all read")).not.toBeInTheDocument());
  });

  it("refetches with unread=true when the unread filter is toggled", async () => {
    api.getNotifications.mockResolvedValue({ next: null, previous: null, results: [] });
    render(<NotificationsPage />);

    await waitFor(() =>
      expect(api.getNotifications).toHaveBeenLastCalledWith({ unreadOnly: false, pageSize: 25 }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Unread only" }));
    await waitFor(() =>
      expect(api.getNotifications).toHaveBeenLastCalledWith({ unreadOnly: true, pageSize: 25 }),
    );
  });

  it("loads the next cursor page on Load more", async () => {
    api.getNotifications
      .mockResolvedValueOnce({
        next: "http://localhost:8000/api/v1/notifications/?cursor=cur1",
        previous: null,
        results: NOTIFICATIONS,
      })
      .mockResolvedValueOnce({
        next: null,
        previous: null,
        results: [
          notif(3, {
            verb: "PROBLEM_APPROVED",
            actor: "verifier",
            target_type: "problem",
            target_id: 7,
            data: { problem_id: 7 },
          }),
        ],
      });
    render(<NotificationsPage />);

    expect(await screen.findByText("Submission AC")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() =>
      expect(screen.getByText("verifier approved your problem")).toBeInTheDocument(),
    );
    expect(api.getNotifications).toHaveBeenLastCalledWith({
      cursor: "cur1",
      unreadOnly: false,
      pageSize: 25,
    });
  });

  it("renders the error card with retry when the API fails", async () => {
    api.getNotifications.mockRejectedValue(new Error("Unauthorized"));
    render(<NotificationsPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load notifications: Unauthorized",
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("renders the empty state when there are no notifications", async () => {
    api.getNotifications.mockResolvedValue({ next: null, previous: null, results: [] });
    render(<NotificationsPage />);
    expect(await screen.findByText("No notifications here.")).toBeInTheDocument();
  });
});
