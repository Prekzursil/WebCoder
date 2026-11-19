import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import AuthorToolsPage from '@/app/author/tools/page';
import type { User } from '@/types';

// Wave F items 122/126/128 — the author tools page.

const api = vi.hoisted(() => ({
  generateTests: vi.fn(),
  spawnVariant: vi.fn(),
  listVariants: vi.fn(),
  uploadAttachment: vi.fn(),
  listAttachments: vi.fn(),
}));

vi.mock('@/services/ApiService', () => ({
  // [wave G item 82/88] the palette/onboarding surfaces need these.
  SearchService: { federated: vi.fn().mockResolvedValue({ query: '', results: {} }) },
  OnboardingService: { get: vi.fn().mockResolvedValue({ steps: [], done: 0, total: 0 }) },
  ProblemService: api,
}));

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    user: { id: 1, username: 'author', email: 'a@x.com', role: 'PROBLEM_CREATOR' } as User | null,
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mocks.auth,
  AuthContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
    Consumer: ({ children }: { children: (value: unknown) => React.ReactNode }) =>
      children(mocks.auth),
    _currentValue: mocks.auth,
  },
}));

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
});

afterEach(() => cleanup());

describe('AuthorToolsPage', () => {
  it('runs the DSL generator and shows the first input', async () => {
    api.generateTests.mockResolvedValue({ created: 5, first: '42 7' });
    render(<AuthorToolsPage />);
    fireEvent.change(screen.getByTestId('tools-problem-input'), {
      target: { value: '9' },
    });
    await screen.findByTestId('tools-generate');
    fireEvent.click(screen.getByTestId('tools-generate'));
    await waitFor(() => expect(api.generateTests).toHaveBeenCalledWith(9, expect.any(String)));
    expect(screen.getByTestId('tools-message').textContent).toContain('42 7');
  });

  it('surfaces DSL errors from the server', async () => {
    api.generateTests.mockRejectedValue(new Error("line 1: cannot parse 'x'"));
    render(<AuthorToolsPage />);
    fireEvent.change(screen.getByTestId('tools-problem-input'), {
      target: { value: '9' },
    });
    fireEvent.click(screen.getByTestId('tools-generate'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('cannot parse'));
  });

  it('spawns a variant and lists the family', async () => {
    api.spawnVariant.mockResolvedValue({ variant_id: 12, root_id: 9, title: 'V' });
    api.listVariants.mockResolvedValue({
      root: 9,
      count: 2,
      variants: [
        { id: 9, title: 'Original', note: '', status: 'DRAFT' },
        { id: 12, title: 'Original — variant 1', note: '', status: 'DRAFT' },
      ],
    });
    api.listAttachments.mockResolvedValue({ count: 0, results: [] });
    render(<AuthorToolsPage />);
    fireEvent.change(screen.getByTestId('tools-problem-input'), {
      target: { value: '9' },
    });
    await screen.findByTestId('tools-spawn-variant');
    fireEvent.click(screen.getByTestId('tools-spawn-variant'));
    await waitFor(() => expect(api.spawnVariant).toHaveBeenCalledWith(9));
    await waitFor(() => expect(screen.getByTestId('variant-row-12')).toBeTruthy());
  });

  it('uploads an attachment and lists it', async () => {
    api.uploadAttachment.mockResolvedValue({ id: 3, name: 'fig.png' });
    api.listVariants.mockResolvedValue({ root: 9, count: 1, variants: [] });
    api.listAttachments.mockResolvedValue({
      count: 1,
      results: [{ id: 3, name: 'fig.png', kind: 'inline', size_bytes: 4, url: '/media/x' }],
    });
    render(<AuthorToolsPage />);
    fireEvent.change(screen.getByTestId('tools-problem-input'), {
      target: { value: '9' },
    });
    fireEvent.change(screen.getByTestId('tools-attachment-name'), {
      target: { value: 'fig.png' },
    });
    fireEvent.click(screen.getByTestId('tools-attachment-upload'));
    await waitFor(() => expect(api.uploadAttachment).toHaveBeenCalledWith(9, 'fig.png'));
    await waitFor(() => expect(screen.getByTestId('attachment-row-3')).toBeTruthy());
  });

  it('basic users get the creators-only note', () => {
    mocks.auth.user = { id: 2, username: 'b', email: 'b@x.com', role: 'BASIC_USER' } as User;
    render(<AuthorToolsPage />);
    expect(screen.getByText(/creators and verifiers/i)).toBeTruthy();
    mocks.auth.user = {
      id: 1,
      username: 'author',
      email: 'a@x.com',
      role: 'PROBLEM_CREATOR',
    } as User;
  });
});
