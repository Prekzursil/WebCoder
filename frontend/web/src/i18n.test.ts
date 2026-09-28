import { describe, it, expect } from 'vitest';
import i18n from './i18n';

// Browser-side bootstrap (the setup file already imported './i18n' inside
// jsdom, taking the `typeof window !== 'undefined'` TRUE branch). The SSR
// branch — window absent, detector skipped — is covered by
// i18n.node-env.test.ts, which runs under the node environment.

describe('i18n bootstrap (browser)', () => {
  it('initializes i18next with the bundled resources', () => {
    expect(i18n.isInitialized).toBe(true);
    expect(i18n.t('nav_home')).toBe('Home');
    expect(i18n.t('app_title')).toBe('WebCoder');
  });

  it('wires the browser language detector when window exists', () => {
    // i18next only exposes services.languageDetector when a detector module
    // was registered via .use() — the window-present branch of the guard.
    expect(i18n.services.languageDetector).toBeTruthy();
  });

  it('interpolates and falls back to English for unsupported locales', () => {
    expect(i18n.t('nav_welcome_user', { username: 'Ada', lng: 'en' })).toBe('Welcome, Ada!');
    expect(i18n.t('nav_problems', { lng: 'xx' })).toBe('Problems');
    expect(i18n.t('nav_problems', { lng: 'ro' })).toBe('Probleme');
  });
});
