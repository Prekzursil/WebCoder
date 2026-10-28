import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import ArticlesPage from './page';

// EDT-6 — the article hub: rows with tag chips + license, tag filter,
// empty + error states.

const api = vi.hoisted(() => ({ getArticles: vi.fn() }));

vi.mock('@/services/ApiService', () => ({
  CommunityService: api,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

const ROW = {
  id: 1,
  title_i18n: { en: 'Hash tables 101', ro: 'Tabele de dispersie 101' },
  body_ro: 'Adresare deschisă.',
  body_en: 'Open addressing.',
  tags: [{ slug: 'hashing' }],
  author: 7,
  author_username: 'creator',
  status: 'APPROVED',
  verifier_feedback: '',
  is_hidden: false,
  license: 'CC BY-SA 4.0',
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
};

describe('ArticlesPage', () => {
  it('lists approved articles with the license line', async () => {
    api.getArticles.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [ROW],
    });
    render(<ArticlesPage />);

    expect(await screen.findByTestId('article-row-1')).toBeInTheDocument();
    expect(screen.getByText('Hash tables 101')).toBeInTheDocument();
    expect(screen.getByTestId('article-row-1')).toHaveTextContent('CC BY-SA 4.0');
    expect(screen.getByTestId('article-row-1')).toHaveTextContent('hashing');
  });

  it('filters by tag through the service params', async () => {
    api.getArticles.mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });
    render(<ArticlesPage />);
    await screen.findByText(/No articles yet/i);
    fireEvent.change(screen.getByLabelText(/filter by tag/i), {
      target: { value: 'hashing' },
    });
    fireEvent.click(screen.getByRole('button', { name: /filter/i }));
    await waitFor(() =>
      expect(api.getArticles).toHaveBeenCalledWith({ tag: 'hashing' })
    );
  });

  it('shows the error state on failure', async () => {
    api.getArticles.mockRejectedValue(new Error('boom'));
    render(<ArticlesPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
  });
});
