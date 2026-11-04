import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import TranslateForm from './TranslateForm';

// Propose-form tests: the EN-original panel ("prefilled from the EN
// source"), the picker fed by the translatable catalog minus already
// published languages, the happy-path submit, and the three error
// mappings (login required / duplicate pending / language published).

const api = vi.hoisted(() => ({
  getLanguages: vi.fn(),
  propose: vi.fn(),
}));

vi.mock('@/services/ApiService', () => ({
  TranslationsService: api,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mocks.auth,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const mocks = vi.hoisted(() => ({
  auth: {
    user: null as null | { id: number; username: string; role: string },
    isAuthenticated: true,
    isHydrated: true,
  },
}));
// Seed the signed-in default after the typed declaration.
mocks.auth.user = { id: 1, username: 'alice', role: 'BASIC' };

const LANGS = {
  results: [
    { code: 'ro', endonym: 'Română', english: 'Romanian' },
    { code: 'hu', endonym: 'Magyar', english: 'Hungarian' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getLanguages.mockResolvedValue(LANGS);
  api.propose.mockResolvedValue({});
});

afterEach(cleanup);

describe('TranslateForm', () => {
  it('shows the English original and a picker fed by the catalog', async () => {
    render(
      <TranslateForm
        problemId={7}
        englishTitle="Two Sum"
        englishStatement="Return indices of the two numbers."
        existingLanguages={['en']}
      />
    );
    expect(await screen.findByText('English original')).toBeVisible();
    expect(screen.getByText('Two Sum')).toBeVisible();
    expect(screen.getByText('Return indices of the two numbers.')).toBeVisible();
    // The viewer's UI locale (en, from the test i18n) is not translatable,
    // so the first catalog language is preselected.
    await waitFor(() => expect(screen.getByLabelText('Target language')).toHaveValue('ro'));
    expect(screen.getByRole('option', { name: /Romanian/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Hungarian/ })).toBeInTheDocument();
  });

  it('excludes languages that already have a published translation', async () => {
    render(
      <TranslateForm
        problemId={7}
        englishTitle="Two Sum"
        englishStatement="EN"
        existingLanguages={['en', 'ro']}
      />
    );
    await screen.findByLabelText('Target language');
    expect(screen.queryByRole('option', { name: /Romanian/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Hungarian/ })).toBeInTheDocument();
  });

  it('submits the proposal and confirms', async () => {
    render(
      <TranslateForm
        problemId={7}
        englishTitle="Two Sum"
        englishStatement="EN"
        existingLanguages={['en']}
      />
    );
    await screen.findByLabelText('Translated title');
    fireEvent.change(screen.getByLabelText('Translated title'), { target: { value: 'Suma a două numere' } });
    fireEvent.change(screen.getByLabelText(/Translated statement/), { target: { value: 'EN -> RO' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit translation' }));
    await waitFor(() =>
      expect(api.propose).toHaveBeenCalledWith({
        problemId: 7,
        language: 'ro',
        title: 'Suma a două numere',
        statement: 'EN -> RO',
      })
    );
    expect(await screen.findByText(/Thank you! Your translation was submitted/)).toBeVisible();
  });

  it('maps a duplicate-pending API error to the dedicated message', async () => {
    api.propose.mockRejectedValue(
      new Error('You already have a pending proposal for this problem and language — wait for a decision.')
    );
    render(
      <TranslateForm problemId={7} englishTitle="T" englishStatement="S" existingLanguages={['en']} />
    );
    await screen.findByLabelText('Translated title');
    fireEvent.change(screen.getByLabelText('Translated title'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText(/Translated statement/), { target: { value: 'Y' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit translation' }));
    expect(
      await screen.findByText(/You already have a pending translation for this problem and language/)
    ).toBeVisible();
  });

  it('maps an auth error to the login hint', async () => {
    api.propose.mockRejectedValue(new Error('Authentication credentials were not provided.'));
    render(
      <TranslateForm problemId={7} englishTitle="T" englishStatement="S" existingLanguages={['en']} />
    );
    await screen.findByLabelText('Translated title');
    fireEvent.change(screen.getByLabelText('Translated title'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText(/Translated statement/), { target: { value: 'Y' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit translation' }));
    expect(await screen.findByText(/Log in to propose a translation/)).toBeVisible();
  });

  it('shows the login hint instead of the form when signed out', async () => {
    mocks.auth.user = null;
    mocks.auth.isAuthenticated = false;
    render(
      <TranslateForm problemId={7} englishTitle="T" englishStatement="S" existingLanguages={['en']} />
    );
    expect(await screen.findByText('Log in to propose a translation.')).toBeVisible();
    expect(screen.queryByLabelText('Translated title')).not.toBeInTheDocument();
    mocks.auth.user = { id: 1, username: 'alice', role: 'BASIC' };
    mocks.auth.isAuthenticated = true;
  });

  it('surfaces a catalog load failure', async () => {
    api.getLanguages.mockRejectedValue(new Error('down'));
    render(
      <TranslateForm problemId={7} englishTitle="T" englishStatement="S" existingLanguages={['en']} />
    );
    expect(
      await screen.findByText('Failed to load translation proposals.')
    ).toBeVisible();
  });
});
