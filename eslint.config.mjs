// eslint-config-next 16 ships native ESLint flat-config arrays
// (eslint-config-next/core-web-vitals and /typescript), so the legacy
// @eslint/eslintrc FlatCompat bridge is no longer needed — and in fact
// breaks on eslint 10 (the eslintrc validator misreads the flat config
// as a circular 'react' reference). Spread the flat exports directly.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      'node_modules/**',
      // The Expo app (mobile/) has its own toolchain; the Next.js lint
      // rules must not run against React Native sources.
      'mobile/**',
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      // Generated e2e artifacts (report bundles + failure traces contain
      // bundled vendor JS that must not be linted).
      'playwright-report/**',
      'test-results/**',
      // Linked git worktrees (parallel agent waves) are full repo copies —
      // including, in some, a Python .venv and coverage HTML — none of which
      // belongs to this tree's lint surface.
      'wt-*/**',
      // Backend pytest coverage HTML (scripts/verify generates backend/htmlcov
      // in the SAME job, right before `npm run lint` runs — generated vendor
      // JS must never enter the lint surface). The documented backend gate
      // also runs from the repo ROOT (RUNBOOK §test batteries), which drops
      // htmlcov/ at the root — ignore both locations.
      'backend/htmlcov/**',
      'htmlcov/**',
      // Local agent scratch space (untracked): session temp files are not
      // product sources.
      '.remember/**',
    ],
  },
  {
    // eslint-config-next 16 turns on the React Compiler hooks rules. The
    // fetch-on-mount pattern (`useEffect(() => { load(); }, [load])` where
    // load setStates) is used across ~57 client pages and needs a dedicated
    // architectural migration (derived state / fetch-cache), tracked in the
    // issue referenced from the PR that introduced this block. The rule is
    // deliberately OFF until that wave lands — NOT a permanent dismissal.
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
];

export default eslintConfig;
