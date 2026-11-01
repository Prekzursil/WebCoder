import { test, expect } from "@playwright/test";

// Wave C community content (mock api): EDT-3 community editorials on the
// problem page (license note), EDT-6 /articles hub + the related-reading
// strip, and the Terms page's school DPA section.

test.describe("community content (Wave C, mock api)", () => {
  test("problem page shows community editorials + related reading", async ({ page }) => {
    await page.goto("/problems/1");

    const panel = page.getByTestId("community-editorials");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Two pointers, one pass");
    await expect(panel).toContainText("CC BY-SA 4.0");
    // The body opens on click.
    await page.getByTestId("ce-row-11").click();
    await expect(page.getByTestId("ce-body-11")).toContainText("Walk inward");

    await expect(page.getByTestId("related-articles")).toContainText("Hash tables 101");
  });

  test("/articles lists the hub with license + tag chips", async ({ page }) => {
    await page.goto("/articles");

    await expect(page.getByTestId("article-row-1")).toBeVisible();
    await expect(page.getByTestId("article-row-1")).toContainText("CC BY-SA 4.0");
    await expect(page.getByTestId("article-row-1")).toContainText("hashing");
  });

  test("article detail renders the bilingual body", async ({ page }) => {
    await page.goto("/articles/1");

    await expect(page.getByTestId("article-body")).toContainText("Open addressing vs chaining.");
  });

  test("terms page mentions the school data-processing template", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByText(/data-processing agreement/i)).toBeVisible();
  });
});

test.describe("authoring & integrity (Wave C JDG/UXP, mock api)", () => {
  test("problem page shows the statement-change banner and feed (UXP-4)", async ({ page }) => {
    await page.goto("/problems/1");

    const banner = page.getByTestId("statement-history");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/change history/i);
    await banner.getByRole("button").click();
    await expect(page.getByTestId("statement-history-feed")).toContainText("clarified constraints");
  });
});
