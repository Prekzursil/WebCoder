import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Layout from "./layout";

// The root layout renders client components that use next/navigation hooks
// (Navbar -> usePathname/useRouter/useSearchParams). Those hooks only exist
// inside a live Next.js app context, so they are mocked for the jsdom smoke test.
vi?.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({
    push: vi?.fn(),
    replace: vi?.fn(),
    refresh: vi?.fn(),
    back: vi?.fn(),
    forward: vi?.fn(),
    prefetch: vi?.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("Root layout (smoke)", () => {
  it("renders the app shell with navbar, brand, and children", () => {
    render(<Layout>smoke-child-marker</Layout>);

    // Navbar brand + translated nav links render (i18n initialized via setup file).
    expect(screen?.getAllByText("WebCoder")?.length)?.toBeGreaterThan(0);
    expect(screen?.getByRole("link", { name: "Home" }))?.toBeInTheDocument();
    expect(screen?.getByRole("link", { name: "Problems" }))?.toBeInTheDocument();
    expect(screen?.getByRole("link", { name: "Login" }))?.toBeInTheDocument();
    expect(screen?.getByRole("link", { name: "Register" }))?.toBeInTheDocument();

    // Layout children pass through the provider tree.
    expect(screen?.getByText("smoke-child-marker"))?.toBeInTheDocument();

    // Language switcher is present for the anonymous navbar state.
    expect(screen?.getByRole("button", { name: "EN" }))?.toBeInTheDocument();
    expect(screen?.getByRole("button", { name: "RO" }))?.toBeInTheDocument();
  });
});
