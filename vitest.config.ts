import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/vitest.setup.ts"],
    // e2e/ holds Playwright specs (*.spec.ts) — vitest's default include
    // (**/*.{test,spec}.*) would try to run them under jsdom. Keep the rest
    // of the default excludes while opting e2e/ out.
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
    // Cap parallel workers: on many-core hosts with little free RAM (~1.5-3GB,
    // measured 2026-10-21) one jsdom worker per core thrashes the machine and
    // tests time out at 5s despite passing individually. Two workers keep
    // runs deterministic on such hosts; the whole suite still finishes in
    // about a minute on CI.
    maxWorkers: 2,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
