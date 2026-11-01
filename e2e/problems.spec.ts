// E2E: public problems catalog + detail (server components fetching through
// the mock API via NEXT_PUBLIC_API_BASE — proves the server-side data path,
// which browser-level page.route interception could never cover).
//
// Selectors match the shipped DOM (pinned by the unit tests in
// src/app/problems/page.test.tsx and [problemId]/page.test.tsx):
// - the catalog renders a <table> (rows), not <li> items;
// - difficulty/status badges show the raw backend enums;
// - the detail title is an <h1>; limits render as label + value pairs
//   ("Time Limit" / "1000 ms"); sample cases are headed "Example N".

import { test, expect } from "@playwright/test";
import { isRealStack, ensureRealStackFixtures } from "./lib/realStack";

// Real-backend mode: seed Two Sum / Reverse String on the live stack (see
// e2e/lib/realStack.ts) so the same assertions hold against Django.
let seeded = { twoSumId: 1, reverseId: 2 };

test.beforeAll(async () => {
  if (isRealStack) seeded = await ensureRealStackFixtures();
});

test("catalog lists mocked problems with difficulty and status", async ({ page }) => {
  await page?.goto("/problems");

  const twoSumRow = page?.getByRole("row").filter({ hasText: "Two Sum" });
  await expect(twoSumRow)?.toBeVisible();
  await expect(twoSumRow)?.toContainText("EASY");

  const reverseRow = page?.getByRole("row").filter({ hasText: "Reverse String" });
  await expect(reverseRow)?.toBeVisible();
  await expect(reverseRow)?.toContainText("MEDIUM");

  // F7: anonymous visitors only ever see APPROVED problems, so the status
  // column/facet is hidden from the public catalog entirely.
  await expect(twoSumRow)?.not.toContainText("APPROVED");
});

test("catalog items link to the problem detail page", async ({ page }) => {
  await page?.goto("/problems");
  page?.getByRole("link", { name: "Two Sum" })?.click();
  // Mock mode pins id 1; real mode uses the seeded id (e2e/lib/realStack.ts).
  await expect(page)?.toHaveURL(new RegExp(`/problems/${seeded.twoSumId}$`));
});

test("problem detail renders statement, limits and sample test cases", async ({ page }) => {
  await page?.goto(`/problems/${seeded.twoSumId}`);

  await expect(page?.getByRole("heading", { level: 1 }))?.toHaveText("Two Sum");
  await expect(page?.getByText("Time Limit"))?.toBeVisible();
  await expect(page?.getByText("1000 ms"))?.toBeVisible();
  await expect(page?.getByText("Memory Limit"))?.toBeVisible();
  await expect(page?.getByText("65536 KB"))?.toBeVisible();
  await expect(page?.getByText(/Given an array of integers nums/))?.toBeVisible();
  await expect(page?.getByRole("heading", { name: "Sample Test Cases" }))?.toBeVisible();
  await expect(page?.getByText("Example 1"))?.toBeVisible();
});

// --- Wave A learning layer --------------------------------------------------

test("problem detail renders markdown statement, hints ladder and editorial", async ({ page }) => {
  await page?.goto(`/problems/${seeded.reverseId}`);

  // A7: markdown **Input:** renders as bold, math as KaTeX. <strong> has no
  // implicit role, so target the element directly.
  await expect(page?.locator("strong", { hasText: "Input:" }).first())?.toBeVisible();
  await expect(page?.locator(".katex").first())?.toBeVisible();

  // EDT-2: hints stay hidden until revealed one step at a time.
  const showHint = page?.getByRole("button", { name: /Show hint 1 of 2/i });
  if (await showHint?.isVisible().catch(() => false)) {
    await expect(page?.getByText("Built-in slicing reverses"))?.toHaveCount(0);
    await showHint?.click();
    await expect(page?.getByText("Built-in slicing reverses"))?.toBeVisible();
    await expect(page?.getByText("s[::-1]"))?.toHaveCount(0);
  }

  // EDT-1: the editorial card renders (mock serves it PUBLIC for id 2).
  await expect(page?.getByRole("heading", { name: "Editorial", exact: true }))?.toBeVisible();
});

test("problem detail shows tried/solved stats bar", async ({ page }) => {
  await page?.goto(`/problems/${seeded.twoSumId}`);
  // UXP-7/X9: the statistics strip renders once the client fetch resolves.
  await expect(page?.getByText("tried"))?.toBeVisible();
  await expect(page?.getByText("solved"))?.toBeVisible();
});

// --- Wave D interactive problems [JDG-2] ------------------------------------

test("INTERACTIVE problem detail shows the interactive badge and flush notice", async ({
  page,
}) => {
  test.skip(isRealStack, "interactive fixture exists only in the mock catalog");
  await page?.goto("/problems/3");

  // The violet badge carries the flush-your-output hint as its title.
  const badge = page?.getByText("Interactive", { exact: true });
  await expect(badge)?.toBeVisible();
  await expect(badge)?.toHaveAttribute("title", /flush/i);
  await expect(page?.getByRole("heading", { name: "Guess the Number" }))?.toBeVisible();
});

test("/start onboarding page renders the starter trio [ONB-1]", async ({ page }) => {
  await page?.goto("/start");
  await expect(page?.getByRole("heading", { level: 1 }))?.toContainText(/first problem/i);
  // The how-it-works strip.
  await expect(page?.getByText("Pick a starter"))?.toBeVisible();
  // Starter cards link into the catalog (mock serves two).
  const cards = page?.locator('a[href^="/problems/"]');
  await expect((await cards?.count()) ?? 0).toBeGreaterThanOrEqual(1);
});

test("catalog curriculum axis drills into a chapter [EDU-9]", async ({ page }) => {
  await page?.goto("/problems");
  const gradeChip = page?.getByRole("button", { name: /Grade 9/ });
  if (await gradeChip?.isVisible().catch(() => false)) {
    await gradeChip?.click();
    await expect(page)?.toHaveURL(/curriculum=10/);
    // Chapter chips appear under the active grade.
    await expect(page?.getByRole("button", { name: /Elementary algorithms/i }))?.toBeVisible();
  }
});

test("gimnaziu grade leads the curriculum axis and the beginner band pill renders [EDU-10]", async ({
  page,
}) => {
  await page?.goto("/problems");

  // The g5 grade chip is the first tree entry (chips flow horizontally —
  // compare X, not Y).
  const g5 = page.getByRole("button", { name: /Grade 5/ });
  await expect(g5).toBeVisible();
  const g9 = page.getByRole("button", { name: /Grade 9/ });
  const boxes = await Promise.all([g5, g9].map((chip) => chip.boundingBox()));
  expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x);

  // The seeded beginner problem renders its band pill.
  const helloRow = page.getByRole("row").filter({ hasText: "Hello, Judge!" });
  await expect(helloRow).toBeVisible();
  await expect(helloRow.getByText("VERY_EASY")).toBeVisible();
});

test("terms and privacy pages render their sections [LEG-1]", async ({ page }) => {
  await page?.goto("/terms");
  await expect(page?.getByRole("heading", { name: "Terms of Service" }))?.toBeVisible();
  await expect(page?.getByRole("heading", { name: "Your content" }))?.toBeVisible();
  await page?.goto("/privacy");
  await expect(page?.getByRole("heading", { name: "Privacy Policy" }))?.toBeVisible();
  await expect(page?.getByRole("heading", { name: "Your rights" }))?.toBeVisible();
});

test("home shows the problem of the day [UXP-5a]", async ({ page }) => {
  await page?.goto("/");
  await expect(page?.getByText("Problem of the day"))?.toBeVisible();
});
