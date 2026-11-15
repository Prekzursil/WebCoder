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

// react-native-webview: no native view under jest — a stub whose onMessage
// prop is captured so tests can drive the bridge, plus a test hook the
// BlocklyEditor tests use to fire messages.
jest.mock('react-native-webview', () => {
  // JSX compiles through the automatic runtime — no React binding needed
  // (an unused one fails the repo-wide oxlint gate).
  const { View } = require('react-native');
  const handlers = [];
  return {
    __handlers: handlers,
    WebView: (props) => {
      handlers.length = 0;
      handlers.push(props.onMessage);
      return <View testID="blockly-webview" />;
    },
  };
});

// expo-asset: assets resolve to an in-memory fake whose bytes the
// FileSystem mock below serves (per-module registry keyed by module id).
jest.mock('expo-asset', () => {
  const registry = new Map();
  return {
    __setAssetText: (module, text) => registry.set(module, text),
    Asset: {
      fromModule: (module) => ({
        downloaded: true,
        localUri: `asset://${module}`,
        downloadAsync: async () => undefined,
      }),
    },
    __registry: registry,
  };
});

// expo-file-system: the SDK-58 File API (the editor reads asset bytes
// with `new File(uri).text()`); text() serves the expo-asset registry.
jest.mock('expo-file-system', () => ({
  File: class {
    constructor(uri) {
      this.uri = uri;
    }
    async text() {
      const registry = require('expo-asset').__registry;
      const module = Number(this.uri.replace('asset://', ''));
      const text = registry.get(module);
      if (text === undefined) throw new Error(`asset not found: ${this.uri}`);
      return text;
    }
  },
}));
