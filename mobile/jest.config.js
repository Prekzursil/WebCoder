/** Jest config for the WebCoder Expo app.
 *
 * Coverage policy (owner bar): the services/state/utils layer must hold
 * 100% LINE coverage — the threshold below enforces exactly that metric
 * on those directories (plus the i18n registry) so a thin untested screen
 * can never water the number down. Branch/function/statement percentages
 * are reported by `npm run test:coverage` but not gated.
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
    },
  },
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
};
