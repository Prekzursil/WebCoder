import fs from "node:fs";

import { BatchInfo, Configuration, Eyes, Target } from "@applitools/eyes-playwright";
import { test } from "@playwright/test";

import { preparePublicVisualState, stabilizeRoute } from "./support/publicApp";

function numberOrZero(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
  return 0;
}

function buildConfiguration(): Configuration {
  const configuration = new Configuration();
  configuration.setApiKey(process.env.APPLITOOLS_API_KEY || "");
  configuration.setAppName("WebCoder");
  configuration.setBatch(new BatchInfo(process.env.APPLITOOLS_BATCH_NAME || `WebCoder-${process.env.GITHUB_SHA || "local"}`));
  configuration.setMatchLevel("Strict");
  return configuration;
}

const routes = [
  { name: "Home", path: "/" },
  { name: "Login", path: "/login" },
  { name: "Register", path: "/register" },
  { name: "Problems", path: "/problems" },
];

test("capture public routes with Applitools", async ({ page }) => {
  test.skip(!process.env.APPLITOOLS_API_KEY, "APPLITOOLS_API_KEY is required");

  await preparePublicVisualState(page);

  const resultsPath = process.env.APPLITOOLS_RESULTS_PATH || "applitools/results.json";
  const eyes = new Eyes();
  eyes.setConfiguration(buildConfiguration());

  await eyes.open(page, "WebCoder", "public-routes", { width: 1366, height: 900 });

  try {
    for (const route of routes) {
      await stabilizeRoute(page, route.path);
      await eyes.check(route.name, Target.window().fully());
    }

    const closeResult = await eyes.close();
    const payload = {
      unresolved: numberOrZero((closeResult as any)?.getUnresolved?.() ?? (closeResult as any)?.unresolved),
      mismatches: numberOrZero((closeResult as any)?.getMismatches?.() ?? (closeResult as any)?.mismatches),
      missing: numberOrZero((closeResult as any)?.getMissing?.() ?? (closeResult as any)?.missing),
    };

    fs.mkdirSync("applitools", { recursive: true });
    fs.writeFileSync(resultsPath, JSON.stringify(payload, null, 2));

    if (payload.unresolved || payload.mismatches || payload.missing) {
      throw new Error(`Applitools visual diff detected: ${JSON.stringify(payload)}`);
    }
  } finally {
    await eyes.abortIfNotClosed();
  }
});
