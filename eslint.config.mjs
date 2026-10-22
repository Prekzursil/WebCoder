import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Generated e2e artifacts (report bundles + failure traces contain
      // bundled vendor JS that must not be linted).
      "playwright-report/**",
      "test-results/**",
      // Linked git worktrees (parallel agent waves) are full repo copies —
      // including, in some, a Python .venv and coverage HTML — none of which
      // belongs to this tree's lint surface.
      "wt-*/**",
    ],
  },
];

export default eslintConfig;
