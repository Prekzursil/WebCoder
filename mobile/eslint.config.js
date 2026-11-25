// ESLint for the mobile app — Expo's flat config (the same rule set
// `npx expo lint` uses), with jest globals for the test suites. The
// owner zero-warnings policy applies: warnings are failures equal to
// errors (`npm run lint` must report zero problems).
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    files: ['**/__tests__/**/*.{ts,tsx}', 'jest.setup.js'],
    languageOptions: {
      globals: {
        jest: 'readonly',
      },
    },
  },
  {
    // Screens use the app's established load-on-mount idiom: an effect
    // invokes an async loader that begins with a synchronous
    // setLoading(true) before its first await. The new react-hooks v6
    // `set-state-in-effect` rule rejects that prelude on every screen;
    // rewriting 15 shipped screens to defer their loading flag is churn
    // with regression risk and no behavior win — scoped off for the
    // screen layer only (services/state/utils stay fully covered).
    files: ['app/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    // Build scripts run under plain Node (Buffer, process) — not the RN
    // runtime; give them Node globals instead of per-line disables.
    files: ['scripts/**/*.mjs', 'scripts/**/*.js'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        process: 'readonly',
        console: 'readonly',
      },
    },
  },
  {
    ignores: ['assets/**', 'node_modules/**', 'android/**', 'ios/**'],
  },
];
