import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import i18n from "@/i18n";
import type { User } from "@/types";
import Footer from "./Footer";

// Footer tests [SPEC-GAPS A13]: site-wide link bars keyed to auth state, the
// language mirror, and the landmark/aria contract.

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: false,
    user: null as User | null,
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => mocks.auth,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.auth.isAuthenticated = false;
  mocks.auth.user = null;
  await i18n.changeLanguage("en");
});

afterEach(cleanup);

describe("Footer", () => {
  it("renders the landmark with platform links for everyone", () => {
    render(<Footer />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveAttribute("aria-label", "Site footer");
    for (const [name, href] of [
      ["Problems", "/problems"],
      ["Leaderboard", "/leaderboard"],
      ["Forum", "/forum"],
    ] as const) {
      expect(within(footer).getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });

  it("shows account links for anonymous visitors", () => {
    render(<Footer />);
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "Login" })).toHaveAttribute("href", "/login");
    expect(within(footer).getByRole("link", { name: "Register" })).toHaveAttribute(
      "href",
      "/register",
    );
    expect(within(footer).queryByText("Profile")).not.toBeInTheDocument();
  });

  it("shows account links for authenticated users", () => {
    mocks.auth.isAuthenticated = true;
    mocks.auth.user = { id: 1, username: "tester", email: "t@example.com", role: "BASIC_USER" };
    render(<Footer />);
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "Profile" })).toHaveAttribute(
      "href",
      "/profile",
    );
    expect(within(footer).getByRole("link", { name: "My Submissions" })).toHaveAttribute(
      "href",
      "/my-submissions",
    );
    expect(within(footer).queryByText("Login")).not.toBeInTheDocument();
  });

  it("mirrors the language switcher and renders a copyright row", () => {
    render(<Footer />);
    // [i18n wave] the two-button EN/RO toggle became the shared ten-locale
    // <select> picker; the footer mirrors it beside the copyright row.
    const picker = screen.getByRole("combobox", { name: "Language" });
    expect(picker).toBeInTheDocument();
    expect(within(picker).getByRole("option", { name: "Română" })).toBeInTheDocument();
    expect(within(picker).getByRole("option", { name: "Español" })).toBeInTheDocument();
    expect(screen.getByText(/© \d{4} WebCoder/)).toBeInTheDocument();
  });
});
