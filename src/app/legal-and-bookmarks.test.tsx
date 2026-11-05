// [LEG-1/UXP-6] Legal pages render localized sections; the bookmark star
// toggles optimistically and rolls back on failure.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useAuth } from "@/context/AuthContext";

const { setBookmarkMock, getBookmarkedIdsMock } = vi.hoisted(() => ({
  setBookmarkMock: vi.fn(),
  getBookmarkedIdsMock: vi.fn(),
}));

vi.mock("@/services/ApiService", () => ({
  ProblemService: {
    setBookmark: setBookmarkMock,
    getBookmarkedIds: getBookmarkedIdsMock,
  },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

import TermsPage from "./terms/page";
import PrivacyPage from "./privacy/page";
import BookmarkButton from "./problems/[problemId]/BookmarkButton";
import { cookies } from "next/headers";

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  getBookmarkedIdsMock.mockResolvedValue({ starred_ids: [] });
  vi.mocked(useAuth).mockReturnValue({
    isAuthenticated: true,
    user: { id: 1, username: "u", email: "u@example.com", role: "BASIC_USER" },
    login: vi.fn(),
    logout: vi.fn(),
  } as ReturnType<typeof useAuth>);
  vi.mocked(cookies).mockResolvedValue({
    get: () => ({ value: undefined }),
  } as never);
});

describe("TermsPage [LEG-1]", () => {
  it("renders the four sections in English by default", async () => {
    render(await TermsPage());
    expect(screen.getByRole("heading", { name: "Terms of Service" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Accounts" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Conduct" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your content" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Availability" })).toBeInTheDocument();
  });
});

describe("PrivacyPage [LEG-1]", () => {
  it("renders the data/cookies/rights/minors sections", async () => {
    render(await PrivacyPage());
    expect(screen.getByRole("heading", { name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What we store" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your rights" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Minors" })).toBeInTheDocument();
  });
});

describe("BookmarkButton [UXP-6]", () => {
  it("stars and unstars through the toggle endpoint", async () => {
    setBookmarkMock.mockResolvedValue({ problem: 7, starred: true, star_count: 1 });
    render(<BookmarkButton problemId="7" />);
    const star = await screen.findByRole("button", { name: /Bookmark this problem/i });
    expect(star).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(star);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Remove bookmark/i })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
    expect(setBookmarkMock).toHaveBeenCalledWith("7", true);
  });

  it("rolls back when the toggle fails", async () => {
    setBookmarkMock.mockRejectedValue(new Error("network"));
    render(<BookmarkButton problemId="7" />);
    const star = await screen.findByRole("button", { name: /Bookmark this problem/i });
    fireEvent.click(star);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Bookmark this problem/i })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });
  });

  it("is hidden for anonymous visitors", () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      user: null,
      login: vi.fn(),
      logout: vi.fn(),
    } as ReturnType<typeof useAuth>);
    const { container } = render(<BookmarkButton problemId="7" />);
    expect(container).toBeEmptyDOMElement();
  });
});
