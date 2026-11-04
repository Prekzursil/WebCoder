/* Global test setup: deterministic environment for the jest-expo runner. */

// Silence the expected RN LogBox noise in test output; actionable test
// failures still surface through expect().
jest.mock('react-native/Libraries/LogBox/LogBox', () => ({
  ignoreAllLogs: jest.fn(),
  install: jest.fn(),
}));

// expo-secure-store: native module absent under jest — provide an in-memory
// keychain so TokenStore tests run the real code path. The backing store
// lives INSIDE the factory (jest forbids out-of-scope references) and is
// driven via __set/__clear so tests never replace the implementations.
jest.mock('expo-secure-store', () => {
  const backing = new Map();
  return {
    setItemAsync: jest.fn(async (k, v) => {
      backing.set(k, v);
    }),
    getItemAsync: jest.fn(async (k) => backing.get(k) ?? null),
    deleteItemAsync: jest.fn(async (k) => {
      backing.delete(k);
    }),
    __set: (k, v) => backing.set(k, v),
    __clear: () => backing.clear(),
  };
});

// AsyncStorage: native module absent under jest — in-memory fallback so
// SettingsStore persistence tests run the real code path.
jest.mock('@react-native-async-storage/async-storage', () => {
  const backing = new Map();
  return {
    __reset: () => backing.clear(),
    setItem: jest.fn(async (k, v) => {
      backing.set(k, String(v));
    }),
    getItem: jest.fn(async (k) => backing.get(k) ?? null),
    removeItem: jest.fn(async (k) => {
      backing.delete(k);
    }),
    clear: jest.fn(async () => {
      backing.clear();
    }),
    getAllKeys: jest.fn(async () => [...backing.keys()]),
    multiGet: jest.fn(async () => []),
    multiSet: jest.fn(async () => {}),
  };
});

// expo-localization: stable device locale for i18n bootstrap tests.
jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en', languageTag: 'en-US' }]),
  getCalendars: jest.fn(() => []),
}));
