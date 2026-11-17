import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import SandboxReceiptsPage from './page';

// [wave E item 20] Sandbox receipts: the caller's own scratch/stress audit
// rows, paginated, with kind + status columns.

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: true, user: { id: 1, username: 'u', role: 'BASIC' } },
  mine: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/services/ApiService', () => ({
  ReceiptsService: { mine: mocks.mine },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/sandbox-receipts',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => mocks.mine.mockReset());
afterEach(cleanup);

describe('SandboxReceiptsPage', () => {
  it('renders the merged receipt rows with kind and status', async () => {
    mocks.mine.mockResolvedValue({
      count: 2,
      next: null,
      previous: null,
      results: [
        {
          kind: 'scratch',
          id: 5,
          language: 'python3',
          status: 'OK',
          time_ms: 42,
          memory_kb: 2048,
          created_at: '2026-11-17T10:00:00Z',
        },
        {
          kind: 'stress',
          id: 1,
          language: '',
          status: 'FOUND',
          time_ms: null,
          memory_kb: null,
          created_at: '2026-11-17T09:00:00Z',
        },
      ],
    });
    render(<SandboxReceiptsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('receipts-table')).toBeTruthy();
    });
    expect(screen.getByTestId('receipt-scratch-5').textContent).toContain('python3');
    expect(screen.getByTestId('receipt-scratch-5').textContent).toContain('42 ms');
    expect(screen.getByTestId('receipt-stress-1').textContent).toContain('FOUND');
  });

  it('shows the empty state when no runs exist', async () => {
    mocks.mine.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
    render(<SandboxReceiptsPage />);
    await waitFor(() => {
      expect(screen.getByText(/No sandbox runs yet/i)).toBeTruthy();
    });
  });

  it('pages through receipts', async () => {
    mocks.mine.mockResolvedValue({
      count: 30,
      next: null,
      previous: null,
      results: [
        {
          kind: 'scratch',
          id: 9,
          language: 'python3',
          status: 'OK',
          time_ms: 5,
          memory_kb: 512,
          created_at: '2026-11-17T10:00:00Z',
        },
      ],
    });
    render(<SandboxReceiptsPage />);
    await waitFor(() => {
      expect(screen.getByText((_, el) => el?.textContent?.trim() === '1 / 2')).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => {
      expect(mocks.mine).toHaveBeenLastCalledWith(2);
    });
  });
});
