// [OPS-7 Wave D] The /support page: cards render from the public
// dictionary, bilingual, with mailto CTAs and the no-payments note.

import { describe, expect, it, vi } from "vitest";

const cookie = vi.hoisted(() => ({ value: "en" }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "i18nextLng" ? { value: cookie.value } : undefined),
  }),
}));

import SupportPage from "./page";

function render(locale: "en" | "ro") {
  cookie.value = locale;
  return SupportPage();
}

describe("SupportPage [OPS-7]", () => {
  it("renders the three cards with mailto CTAs in English", async () => {
    const jsx = (await render("en")) as React.ReactElement;
    const html = JSON.stringify(jsx);
    expect(html).toContain("Sponsor a contest");
    expect(html).toContain("Hosted school contests");
    expect((html.match(/mailto:/g) ?? []).length).toBe(3);
    expect(html).toContain("processes no payments");
  });

  it("renders the Romanian variant from the locale cookie", async () => {
    const jsx = (await render("ro")) as React.ReactElement;
    const html = JSON.stringify(jsx);
    expect(html).toContain("Susține WebCoder");
    expect(html).toContain("Sponsorizează un concurs");
    expect(html).toContain("nu procesează plăți");
  });
});
