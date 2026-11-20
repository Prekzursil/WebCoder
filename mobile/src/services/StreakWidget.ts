// StreakWidget — wave G item 97: the home-screen streak widget (Android,
// via expo-widget) + the in-app card that shares the same text provider.
//
// The widget provider runs in a headless JS context (no React): it reads
// the cached streak from AsyncStorage and asks the OS to re-render the
// widget. The native side needs the expo-widget config plugin (see
// app.config.ts); EAS/devel builds pick it up, Expo Go renders the in-app
// card only.
import * as Widget from 'expo-widget';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const STREAK_CACHE_KEY = 'wc_streak_cache';

export interface StreakSnapshot {
  current: number;
  best: number;
  updatedAt: number;
}

export function cacheStreak(current: number, best: number): Promise<void> {
  const snapshot: StreakSnapshot = { current, best, updatedAt: Date.now() };
  return AsyncStorage.setItem(STREAK_CACHE_KEY, JSON.stringify(snapshot));
}

export async function readStreak(): Promise<StreakSnapshot | null> {
  const raw = await AsyncStorage.getItem(STREAK_CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StreakSnapshot;
  } catch {
    return null;
  }
}

/** The shared widget text (also asserted by jest). */
export function streakWidgetText(snap: StreakSnapshot | null): {
  headline: string;
  sub: string;
} {
  if (snap === null) {
    return { headline: '—', sub: 'Solve today to start a streak' };
  }
  const dayWord = snap.current === 1 ? 'day' : 'days';
  return {
    headline: `${snap.current} ${dayWord}`,
    sub: `Best: ${snap.best} — keep going!`,
  };
}

/** Headless widget reload target (called by the OS widget scheduler). */
export async function streakWidgetTask(): Promise<void> {
  const snap = await readStreak();
  const { headline, sub } = streakWidgetText(snap);
  try {
    Widget.setWidgetData({ name: 'StreakWidget', headline, sub });
  } catch {
    // Widget module unavailable (Expo Go / iOS-side pending) — the
    // in-app card still renders from the same cache.
  }
}
