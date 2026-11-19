import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import A11yModePicker, { applyA11yMode, readStoredA11yMode } from './A11yModePicker';
import OnboardingChecklist from './OnboardingChecklist';
import CommandPalette from './CommandPalette';

// [Wave G items 82/88/91] Federated palette results, the onboarding
// checklist and the a11y display modes.

const api = vi.hoisted(() => ({
  getProblems: vi.fn(),
  federated: vi.fn(),
  onboarding: vi.fn(),
}));

vi.mock('@/services/ApiService', () => ({
  ProblemService: { getProblems: api.getProblems },
  SearchService: { federated: api.federated },
  OnboardingService: { get: api.onboarding },
}));

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    user: {
      id: 2,
      username: 'ana',
      email: 'a@x.com',
      role: 'BASIC',
    } as import('@/types').User | null,
    login: vi.fn(),
    logout: vi.fn(),
  },
  router: { push: vi.fn() },
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mocks.auth,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-a11y');
});

afterEach(cleanup);

describe('A11yModePicker [item 91]', () => {
  it('applies the picked mode to <html> and persists it', async () => {
    render(<A11yModePicker />);
    const select = await screen.findByTestId('a11y-mode');
    expect(select).toHaveValue('default');
    fireEvent.change(select, { target: { value: 'dyslexia' } });
    expect(document.documentElement.getAttribute('data-a11y')).toBe('dyslexia');
    expect(window.localStorage.getItem('wc-a11y-mode')).toBe('dyslexia');
    fireEvent.change(select, { target: { value: 'contrast' } });
    expect(document.documentElement.getAttribute('data-a11y')).toBe('contrast');
    fireEvent.change(select, { target: { value: 'default' } });
    expect(document.documentElement.hasAttribute('data-a11y')).toBe(false);
  });

  it('helpers degrade safely', () => {
    expect(readStoredA11yMode()).toBe('default');
    expect(() => applyA11yMode('contrast')).not.toThrow();
  });
});

describe('OnboardingChecklist [item 88]', () => {
  it('renders the computed steps with progress', async () => {
    api.onboarding.mockResolvedValue({
      steps: [
        { key: 'account', done: true },
        { key: 'first_submission', done: true },
        { key: 'first_ac', done: false },
        { key: 'first_contest', done: false },
        { key: 'profile_bio', done: false },
        { key: 'joined_class', done: false },
      ],
      done: 2,
      total: 6,
    });
    render(<OnboardingChecklist />);
    const card = await screen.findByTestId('onboarding-checklist');
    expect(card).toHaveTextContent('2/6');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
    // The unfinished steps deep-link to their surface.
    expect(screen.getByRole('link', { name: /register for a contest/i })).toHaveAttribute(
      'href',
      '/contests',
    );
  });

  it('stays hidden for guests and on failure', () => {
    mocks.auth.isAuthenticated = false;
    const { container } = render(<OnboardingChecklist />);
    expect(container.querySelector('[data-testid="onboarding-checklist"]')).toBeNull();
    mocks.auth.isAuthenticated = true;
    api.onboarding.mockRejectedValue(new Error('down'));
    const { container: second } = render(<OnboardingChecklist />);
    expect(second.querySelector('[data-testid="onboarding-checklist"]')).toBeNull();
  });
});

describe('CommandPalette federated results [item 82]', () => {
  it('offers threads/contests/users from the federated endpoint', async () => {
    api.getProblems.mockResolvedValue({ results: [] });
    api.federated.mockResolvedValue({
      query: 'sum',
      results: {
        problems: [],
        threads: [{ id: 7, title: 'Sum thread', problem: null }],
        articles: [{ id: 3, title: 'Two pointers' }],
        contests: [{ id: 9, title: 'Sum Cup', start_at: '2026-12-01T10:00:00Z' }],
        users: [{ id: 4, username: 'sumfan' }],
      },
    });
    render(<CommandPalette />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    await screen.findByTestId('command-palette');
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'sum' } });
    await screen.findByText('Sum thread');
    expect(screen.getByText('Sum Cup')).toBeInTheDocument();
    expect(screen.getByText('sumfan')).toBeInTheDocument();
    expect(screen.getByText('Two pointers')).toBeInTheDocument();
    expect(api.federated).toHaveBeenCalledWith('sum', 'en');
  });
});
