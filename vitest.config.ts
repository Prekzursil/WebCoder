import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/vitest.setup.ts"],
    // e2e/ holds Playwright specs (*.spec.ts) — vitest's default include
    // (**/*.{test,spec}.* would try to run them under jsdom. Keep the rest
    // of the default excludes while opting e2e/ out.
    // wt-*/ holds linked git worktrees (parallel agent waves). They are full
    // repo copies with their own configs; swept by the default include they
    // run against THIS tree's @/ alias (root src/), which mismatches their
    // branch's code and fails spuriously.
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**", "wt-*/**"],
    // Cap parallel workers: on many-core hosts with little free RAM (~1.5-3GB,
    // measured 2026-10-21) one jsdom worker per core thrashes the machine and
    // tests time out at 5s despite passing individually. Two workers keep
    // runs deterministic on such hosts; the whole suite still finishes in
    // about a minute on CI.
    maxWorkers: 2,
    // Heavier pages (profile fires three parallel fetches, the problem
    // detail mounts CodeMirror + five panels) can exceed the 5s default
    // on RAM-constrained hosts under full-suite load — same rationale as
    // the worker cap above.
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
