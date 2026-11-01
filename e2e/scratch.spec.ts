// E2E [judge-fairness wave D, engine 2]: the Scratch layer — the
// playground's Scratch tab and a Scratch problem whose PROJECT JSON is
// submitted as language 'scratch' through the normal judge pipeline
// (mock mode: the submit POST is intercepted at the browser level; the
// real-stack judged round-trip — transpile to Python, AC + planted WA —
// runs in the live acceptance pass).

import { test, expect } from "@playwright/test";

test("the playground offers the Scratch engine and mounts its editor", async ({ page }) => {
  await page?.goto("/blocks");

  await page?.getByLabel(/engine/i).selectOption("scratch");
  await expect(page?.getByTestId("scratch-editor")).toBeVisible();
  // The Scratch toolbar (green flag / stop) is present.
  await expect(page?.getByTestId("scratch-green-flag")).toBeVisible();
  await expect(page?.getByTestId("scratch-stop")).toBeVisible();
  // The Blockly run panel is engine-specific: hidden for Scratch.
  await expect(page?.getByLabel(/input \(stdin\)/i)).toHaveCount(0);
});

test("a Scratch problem renders the Scratch editor and submits the project JSON", async ({
  page,
  context,
}) => {
  // The Scratch stack (scratch-vm/blocks/render) is a multi-MB lazy chunk;
  // compiling it in dev-mode on a cold CI runner can exceed the default
  // 30s test timeout even though the app is behaving correctly.
  test.setTimeout(240_000);
  await context?.addCookies([
    { name: "wc_access", value: "e2e-admin-access", domain: "localhost", path: "/" },
  ]);
  await page?.addInitScript(() => {
    localStorage.setItem(
      "user",
      JSON.stringify({
        id: 2,
        username: "admin_e2e",
        email: "admin@e2e.local",
        role: "ADMIN",
      }),
    );
  });

  // Intercept the submit POST: assert the payload is the sb3 project
  // JSON under language 'scratch', then fake the API response.
  let seenLanguage = "";
  let seenCode = "";
  await page?.route("**/api/v1/submissions/submit/", async (route) => {
    const body = route.request().postDataJSON() as {
      language: string;
      code: string;
    };
    seenLanguage = body.language;
    seenCode = body.code;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ id: 502, verdict: "PENDING" }),
    });
  });

  await page?.goto("/problems/12");

  // Scratch mode: the Scratch editor replaces the code editor and the
  // language selector is gone (the pseudo-language IS the mode). The
  // scratch-vm chunk is heavy — allow a slow first load (CI cold cache).
  await expect(page?.getByTestId("scratch-editor")).toBeVisible({
    timeout: 90_000,
  });
  await expect(page?.locator("#language-select")).toHaveCount(0);
  await expect(page?.getByText(/solve with scratch/i)).toBeVisible();

  // Submit the starter project (confirmation modal -> confirm).
  await page
    ?.getByRole("button", { name: /submit/i })
    .first()
    .click();
  await page?.getByRole("button", { name: /^confirm$/i }).click();

  await expect.poll(() => Promise.resolve(seenLanguage)).toBe("scratch");
  // The submitted code is a project JSON carrying the flag-script block.
  await expect
    .poll(() => {
      try {
        const project = JSON.parse(seenCode) as {
          targets: { blocks: Record<string, { opcode: string }> }[];
        };
        const opcodes = project.targets
          .flatMap((t) => Object.values(t.blocks || {}))
          .map((b) => b.opcode);
        return opcodes.includes("event_whenflagclicked") ? "ok" : seenCode;
      } catch {
        return seenCode.slice(0, 40);
      }
    })
    .toBe("ok");
});

test("a rejected Scratch submission surfaces the validation message", async ({ page, context }) => {
  test.setTimeout(240_000);
  await context?.addCookies([
    { name: "wc_access", value: "e2e-admin-access", domain: "localhost", path: "/" },
  ]);
  await page?.addInitScript(() => {
    localStorage.setItem(
      "user",
      JSON.stringify({
        id: 2,
        username: "admin_e2e",
        email: "admin@e2e.local",
        role: "ADMIN",
      }),
    );
  });

  // The server rejects a project using a block outside the problem's
  // curated set — the form must surface the message (the 400 path).
  await page?.route("**/api/v1/submissions/submit/", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        code: ["project uses blocks this problem does not allow: motion_movesteps"],
      }),
    });
  });

  await page?.goto("/problems/12");
  await expect(page?.getByTestId("scratch-editor")).toBeVisible({
    timeout: 90_000,
  });
  await page
    ?.getByRole("button", { name: /submit/i })
    .first()
    .click();
  await page?.getByRole("button", { name: /^confirm$/i }).click();

  await expect(page?.getByText(/does not allow: motion_movesteps/i)).toBeVisible();
});
