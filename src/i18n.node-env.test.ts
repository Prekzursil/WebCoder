// @vitest-environment node
import { describe, it, expect } from 'vitest';
import i18n from './i18n';

// SSR bootstrap: under the node environment there is no window at all, so
// './i18n' takes the `typeof window === 'undefined'` branch — the browser
// LanguageDetector must NOT be attached (it reads window/document), yet the
// instance must still initialize from the bundled resources.

describe('i18n bootstrap (SSR / node)', () => {
  it('has no window in this environment', () => {
    expect(typeof window)?.toBe('undefined');
  });

  it('skips the browser language detector and still initializes', () => {
    expect(i18n?.isInitialized)?.toBe(true);
    expect(i18n?.services?.languageDetector)?.toBeUndefined();
  });

  it('translates from the bundled resources without any detector', () => {
    expect(i18n?.t('nav_home'))?.toBe('Home');
    expect(i18n?.t('nav_problems', { lng: 'ro' }))?.toBe('Probleme');
  });
});
