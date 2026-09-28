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
    // Enum-badge keys are deliberately absent from MESSAGES (they render the
    // raw backend code via defaultValue — see the note in public-i18n.ts), so
    // they are stable fixtures for the fallback path. Real copy keys such as
    // homepage_subtitle / no_problems_available ARE in the dictionary now.
    expect(createTranslator('ro')('difficulty_easy', 'Easy Mode')).toBe('Easy Mode');
    expect(createTranslator('en')('status_approved', 'Approved!')).toBe('Approved!');
  });

  it('falls back to the raw key when no default is provided', () => {
    expect(createTranslator('en')('some_missing_key')).toBe('some_missing_key');
  });

  it('interpolates variables into the resolved string', () => {
    const t = createTranslator('en');
    expect(t('submission_successful_pending', 'Sent ({{id}})', { id: 7 })).toBe('Sent (7)');
  });
});
