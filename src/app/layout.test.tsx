import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import Layout from "./layout";

// [i18n wave] RootLayout is async and reads the i18next locale cookie via
// next/headers for <html lang>; outside a live Next request scope that
// store does not exist, so the mock serves an empty cookie jar (locale
// falls back to English, exactly like a first-time visitor).

// The root layout renders client components that use next/navigation hooks
// (Navbar -> usePathname/useRouter/useSearchParams). Those hooks only exist
// inside a live Next.js app context, so they are mocked for the jsdom smoke test.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
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

describe("Root layout (smoke)", () => {
  it("renders the app shell with navbar, brand, and children", async () => {
    // [i18n wave] RootLayout is an async Server Component (reads the locale
    // cookie for <html lang>); awaiting it here renders the resolved JSX.
    render(await Layout({ children: "smoke-child-marker" }));

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

    // Language switcher (shared grouped <select>) is present in the
    // anonymous navbar state and mirrored in the footer. [i18n full-locale
    // wave] the picker groups options by script/region; an RTL locale
    // (Arabic) is present inside its optgroup.
    const pickers = screen.getAllByRole("combobox", { name: "Language" });
    expect(pickers.length).toBeGreaterThanOrEqual(2); // navbar + footer
    expect(within(pickers[0]).getByRole("option", { name: "Română" })).toBeInTheDocument();
    expect(within(pickers[0]).getByRole("option", { name: "العربية" })).toBeInTheDocument();
    // App shell: skip link + single main landmark + footer (Q11/A13).
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(document.getElementById("main-content")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toHaveAttribute("aria-label", "Site footer");
  });
});
