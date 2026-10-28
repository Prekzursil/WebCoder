import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import StatementHistory from './StatementHistory';

// UXP-4 — the statement-change banner + expandable feed.

const api = vi.hoisted(() => ({ getStatementRevisions: vi.fn() }));

vi.mock('@/services/ApiService', () => ({
  ToolingService: api,
}));

const ROWS = {
  count: 2,
  results: [
    { id: 2, note: 'clarified constraints', edited_by: 'admin', created_at: '2026-11-01T00:00:00Z' },
    { id: 1, note: '', edited_by: 'verif', created_at: '2026-10-01T00:00:00Z' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('StatementHistory', () => {
  it('stays hidden when there is no history', async () => {
    api.getStatementRevisions.mockResolvedValue({ count: 0, results: [] });
    const { container } = render(<StatementHistory problemId={1} />);
    await waitFor(() => expect(api.getStatementRevisions).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="statement-history"]')).toBeNull();
  });

  it('shows the banner and expands the feed on click', async () => {
    api.getStatementRevisions.mockResolvedValue(ROWS);
    render(<StatementHistory problemId={1} />);

    const banner = await screen.findByTestId('statement-history');
    expect(banner).toHaveTextContent(/2 revisions/i);
    fireEvent.click(banner.querySelector('button')!);
    await waitFor(() =>
      expect(screen.getByTestId('statement-history-feed')).toBeInTheDocument()
    );
    expect(screen.getByText(/clarified constraints/)).toBeInTheDocument();
  });

  it('fails soft when the history endpoint errors', async () => {
    api.getStatementRevisions.mockRejectedValue(new Error('boom'));
    const { container } = render(<StatementHistory problemId={1} />);
    await waitFor(() => expect(api.getStatementRevisions).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="statement-history"]')).toBeNull();
  });
});
