import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cookies } from 'next/headers';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

import {
  createTranslator,
  getLocale,
  interpolate,
  normalizeLocale,
} from './public-i18n';

function mockCookie(value: string | undefined) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      name === 'i18nextLng' ? (value === undefined ? undefined : { value }) : undefined,
  } as Awaited<ReturnType<typeof cookies>>);
}

beforeEach(() => {
  vi.mocked(cookies).mockReset();
});

describe('normalizeLocale', () => {
  it('maps "ro" and regional Romanian tags to ro', () => {
    expect(normalizeLocale('ro')).toBe('ro');
    expect(normalizeLocale('ro-RO')).toBe('ro');
  });

  it('maps English, unknown locales and missing values to en', () => {
    expect(normalizeLocale('en')).toBe('en');
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('fr')).toBe('en');
    expect(normalizeLocale(undefined)).toBe('en');
  });
});

describe('getLocale', () => {
  it('reads the i18nextLng cookie', async () => {
    mockCookie('ro');
    expect(await getLocale()).toBe('ro');
  });

  it('defaults to en when the cookie is absent', async () => {
    mockCookie(undefined);
    expect(await getLocale()).toBe('en');
  });
});

describe('interpolate', () => {
  it('returns the template untouched when no vars are given', () => {
    expect(interpolate('Submission {{id}} sent')).toBe('Submission {{id}} sent');
  });

  it('substitutes {{name}} placeholders', () => {
    expect(interpolate('Submission {{id}} sent', { id: 42 })).toBe('Submission 42 sent');
  });

  it('drops placeholders whose variable is missing', () => {
    expect(interpolate('Submission {{id}} sent', {})).toBe('Submission  sent');
  });
});

describe('createTranslator', () => {
  it('returns the localized value for keys present in the dictionary', () => {
    expect(createTranslator('en')('welcome_message', 'fallback')).toBe('Welcome to WebCoder');
    expect(createTranslator('ro')('welcome_message', 'fallback')).toBe('Bun venit la WebCoder');
    expect(createTranslator('ro')('problem_list_header', 'fallback')).toBe('Probleme');
  });

  it('falls back to the default value for keys absent from the dictionary', () => {
    expect(createTranslator('ro')('homepage_subtitle', 'The subtitle')).toBe('The subtitle');
    expect(createTranslator('en')('no_problems_available', 'None here')).toBe('None here');
  });

  it('falls back to the raw key when no default is provided', () => {
    expect(createTranslator('en')('some_missing_key')).toBe('some_missing_key');
  });

  it('interpolates variables into the resolved string', () => {
    const t = createTranslator('en');
    expect(t('submission_successful_pending', 'Sent ({{id}})', { id: 7 })).toBe('Sent (7)');
  });
});
