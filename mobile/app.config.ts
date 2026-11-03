import type { ExpoConfig } from 'expo/config';

/**
 * WebCoder mobile app configuration (Expo — one codebase, both stores).
 *
 * The app talks to the SAME Django API the web app uses; the base URL is
 * injectable via the `apiBase` extra (EAS build profiles set it per channel;
 * local dev defaults to the dockerized stack at 127.0.0.1:8010, reachable
 * from an emulator via 10.0.2.2).
 */
const config: ExpoConfig = {
  name: 'WebCoder',
  slug: 'webcoder',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  scheme: 'webcoder',
  ios: {
    bundleIdentifier: 'ro.webcoder.app',
    supportsTablet: true,
    infoPlist: {
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: true, // dev builds against http://10.0.2.2:8010
      },
    },
  },
  android: {
    package: 'ro.webcoder.app',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0f172a',
    },
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/splash.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#0f172a',
      },
    ],
  ],
  experiments: {
    typedRoutes: false,
  },
  extra: {
    // 10.0.2.2 = host loopback from the Android emulator; iOS simulators
    // share the host network so 127.0.0.1 works there.
    apiBase:
      process.env.EXPO_PUBLIC_API_BASE ?? 'http://10.0.2.2:8010/api/v1',
    eas: {
      projectId: '', // filled by `eas init` (owner step — see docs/IOS-RUNBOOK.md)
    },
  },
};

export default config;
