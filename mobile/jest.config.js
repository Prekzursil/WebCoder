/** Jest config for the WebCoder Expo app.
 *
 * Coverage policy (owner bar, raised 2026-11-15): the services/state/utils
 * layer (plus the i18n registry) must hold 100% LINES, STATEMENTS and
 * FUNCTIONS — a never-invoked function or an unexercised statement arm is
 * a hole even when every line technically runs, so all three metrics gate.
 * Branch percentages are reported by `npm run test:coverage` but not
 * gated (the owner bar names lines/statements/functions).
 */
module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg)|react-native-safe-area-context|react-native-screens)',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/services/**/*.{ts,tsx}',
    'src/state/**/*.{ts,tsx}',
    'src/utils/**/*.{ts,tsx}',
    'src/i18n/index.ts',
  ],
  coverageThreshold: {
    global: {
      lines: 100,
      statements: 100,
      functions: 100,
    },
  },
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
};
