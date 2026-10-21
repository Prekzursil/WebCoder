import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Layout from "./layout";

// The root layout renders client components that use next/navigation hooks
// (Navbar -> usePathname/useRouter/useSearchParams). Those hooks only exist
// inside a live Next.js app context, so they are mocked for the jsdom smoke test.
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

describe("Root layout (smoke)", () => {
  it("renders the app shell with navbar, brand, and children", () => {
    render(<Layout>smoke-child-marker</Layout>);

    // Navbar brand + translated nav links render (i18n initialized via setup
    // file). Several links now also exist in the footer, so query with
    // getAllByRole.
    expect(screen.getAllByText("WebCoder").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Home" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Problems" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Login" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Register" }).length).toBeGreaterThan(0);

    // Layout children pass through the provider tree.
    expect(screen.getByText("smoke-child-marker")).toBeInTheDocument();

    // Language switcher is present for the anonymous navbar state — and now
    // mirrored in the footer, so "en"/"ro" each appear twice.
    expect(screen.getAllByRole("button", { name: "en" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("button", { name: "ro" }).length).toBeGreaterThanOrEqual(1);
    // App shell: skip link + single main landmark + footer (Q11/A13).
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main-content");
    expect(document.getElementById("main-content")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toHaveAttribute("aria-label", "Site footer");
  });
});
