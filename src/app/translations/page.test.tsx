import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import React from 'react';
import TranslationsPage from './page';

// Curation-surface tests: anonymous visitors get the login state, the
// verifier queue lists pending proposals with the contributor + AI column,
// approve/reject round-trip through the service, and the contributor's
// "mine" list carries the decision and the reviewer note.

const api = vi.hoisted(() => ({
  getLanguages: vi.fn(),
  getProposals: vi.fn(),
  getMine: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
}));

vi.mock('@/services/ApiService', () => ({
  TranslationsService: api,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mocks.auth,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/translations',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
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
// Seed the verifier default after the typed declaration.
mocks.auth.user = { id: 2, username: 'vera', role: 'VERIFIER' };

const proposal = (id: number, partial: Record<string, unknown> = {}) => ({
  id,
  problem_id: 1,
  problem_title_en: 'Two Sum',
  language: 'ro',
  language_name: 'Romanian',
  title: 'Suma a două numere',
  statement: 'Returnează indicii.',
  status: 'PENDING',
  contributor_username: 'alice',
  reviewer_username: null,
  review_note: '',
  reviewed_at: null,
  ai_verdict: '',
  ai_confidence: null,
  ai_notes: '',
  created_at: '2026-10-31T10:00:00Z',
  updated_at: '2026-10-31T10:00:00Z',
  ...partial,
});

const empty = { count: 0, next: null, previous: null, results: [] };

beforeEach(() => {
  vi.clearAllMocks();
  api.getProposals.mockResolvedValue(empty);
  api.getMine.mockResolvedValue(empty);
  api.approve.mockResolvedValue({});
  api.reject.mockResolvedValue({});
});

afterEach(cleanup);

describe('TranslationsPage', () => {
  it('anonymous visitors get the login state without touching the queue', async () => {
    mocks.auth.user = null;
    mocks.auth.isAuthenticated = false;
    render(<TranslationsPage />);
    expect(
      await screen.findByText('Log in as a verifier to curate translations.')
    ).toBeVisible();
    expect(api.getProposals).not.toHaveBeenCalled();
    mocks.auth.user = { id: 2, username: 'vera', role: 'VERIFIER' };
    mocks.auth.isAuthenticated = true;
  });

  it('verifier queue lists pending proposals with contributor and AI column', async () => {
    api.getProposals.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        proposal(5),
        proposal(6, { ai_verdict: 'approve', ai_confidence: 0.93, ai_notes: 'Faithful translation.' }),
      ],
    });
    render(<TranslationsPage />);
    expect(await screen.findByTestId('proposal-row-5')).toBeVisible();
    expect(screen.getByTestId('proposal-row-5')).toHaveTextContent('@alice');
    expect(screen.getByTestId('proposal-status-5')).toHaveTextContent('Pending');
    expect(screen.getByText('not screened')).toBeVisible();
    expect(screen.getByText(/AI: looks good/)).toBeVisible();
    expect(api.getProposals).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PENDING' })
    );
  });

  it('approve posts the decision, confirms and reloads the queue', async () => {
    api.getProposals.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [proposal(5)],
    });
    render(<TranslationsPage />);
    const row = await screen.findByTestId('proposal-row-5');
    fireEvent.click(within(row).getByTestId('approve-btn'));
    await waitFor(() => expect(api.approve).toHaveBeenCalledWith(5));
    expect(await screen.findByTestId('decided-ok')).toBeVisible();
  });

  it('reject sends the reviewer note', async () => {
    api.getProposals.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [proposal(5)],
    });
    render(<TranslationsPage />);
    const row = await screen.findByTestId('proposal-row-5');
    fireEvent.change(within(row).getByTestId('reject-note-input'), {
      target: { value: 'Keep the math notation.' },
    });
    fireEvent.click(within(row).getByTestId('reject-btn'));
    await waitFor(() =>
      expect(api.reject).toHaveBeenCalledWith(5, 'Keep the math notation.')
    );
    expect(await screen.findByTestId('decided-ok')).toBeVisible();
  });

  it('a failed decision surfaces the error line', async () => {
    api.getProposals.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [proposal(5)],
    });
    api.approve.mockRejectedValue(new Error('boom'));
    render(<TranslationsPage />);
    const row = await screen.findByTestId('proposal-row-5');
    fireEvent.click(within(row).getByTestId('approve-btn'));
    expect(await screen.findByText('Could not save the decision.')).toBeVisible();
  });

  it('basic users land on "mine" and never fetch the verifier queue', async () => {
    mocks.auth.user = { id: 1, username: 'alice', role: 'BASIC' };
    api.getMine.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [proposal(9, { contributor_username: 'alice', status: 'REJECTED', review_note: 'Add samples.' })],
    });
    render(<TranslationsPage />);
    expect(await screen.findByTestId('proposal-row-9')).toBeVisible();
    expect(screen.getByTestId('proposal-row-9')).toHaveTextContent('Add samples.');
    expect(api.getProposals).not.toHaveBeenCalled();
    mocks.auth.user = { id: 2, username: 'vera', role: 'VERIFIER' };
  });

  it('empty mine list renders the guidance empty state', async () => {
    mocks.auth.user = { id: 1, username: 'alice', role: 'BASIC' };
    render(<TranslationsPage />);
    expect(
      await screen.findByText('You have not proposed any translations yet.')
    ).toBeVisible();
    mocks.auth.user = { id: 2, username: 'vera', role: 'VERIFIER' };
  });
});
