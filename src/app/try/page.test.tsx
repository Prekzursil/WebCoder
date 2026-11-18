import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

// [Wave G item 89] The guest try-it page: runs code through the anonymous
// guest endpoint, renders the verdict, and degrades gracefully on 429.

const api = vi.hoisted(() => ({ runGuest: vi.fn() }));

vi.mock('@/services/ApiService', () => ({
  ScratchService: api,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

async function renderPage() {
  const { default: TryItPage } = await import('@/app/try/page');
  render(<TryItPage />);
}

describe('TryItPage [item 89]', () => {
  it('renders the editor, starter code and the signup CTA', async () => {
    await renderPage();
    expect(screen.getByTestId('try-page')).toBeInTheDocument();
    expect(screen.getByLabelText(/guest code editor/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create a free account/i })).toBeInTheDocument();
    expect(screen.getByTestId('try-run')).toHaveTextContent(/run code/i);
  });

  it('runs the guest endpoint and shows the verdict + output', async () => {
    api.runGuest.mockResolvedValue({
      status: 'OK',
      output: 'Salut, world!',
      error: '',
      time_ms: 9,
      memory_kb: 1024,
    });
    await renderPage();
    fireEvent.click(screen.getByTestId('try-run'));
    const verdict = await screen.findByTestId('try-verdict');
    expect(verdict).toHaveTextContent(/ran successfully/i);
    expect(screen.getByText(/Salut, world!/)).toBeInTheDocument();
    expect(api.runGuest).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'python3', input: 'world' }),
    );
  });

  it('renders compile-error output from the error channel', async () => {
    api.runGuest.mockResolvedValue({
      status: 'COMPILE_ERROR',
      output: '',
      error: 'SyntaxError: invalid syntax',
      time_ms: -1,
      memory_kb: -1,
    });
    await renderPage();
    fireEvent.click(screen.getByTestId('try-run'));
    await screen.findByText(/compile error/i);
    expect(screen.getByText(/SyntaxError/)).toBeInTheDocument();
  });

  it('surfaces the throttle message on a 429', async () => {
    api.runGuest.mockRejectedValue(Object.assign(new Error('rate limited'), { status: 429 }));
    await renderPage();
    fireEvent.click(screen.getByTestId('try-run'));
    await screen.findByText(/limited/i);
  });

  it('shows the generic failure message otherwise', async () => {
    api.runGuest.mockRejectedValue(new Error('boom'));
    await renderPage();
    fireEvent.click(screen.getByTestId('try-run'));
    await screen.findByText(/failed/i);
  });
});
