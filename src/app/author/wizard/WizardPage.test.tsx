import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import AuthorWizardPage from '@/app/author/wizard/page';
import type { User } from '@/types';

// Wave F items 121/123/124/134 — the authoring wizard page.

const api = vi.hoisted(() => ({
  getWizardSteps: vi.fn(),
  statementLint: vi.fn(),
  getReadability: vi.fn(),
  getTranslationStatus: vi.fn(),
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
  api.getWizardSteps.mockReset();
  api.statementLint.mockReset();
  api.getReadability.mockReset();
  api.getTranslationStatus.mockReset();
});

afterEach(() => cleanup());

const STEPS = {
  count: 7,
  steps: [
    { key: 'basics', title_en: 'Basics', description_en: 'd', fields: [], complete: true },
    { key: 'review', title_en: 'Review', description_en: 'd', fields: [], complete: false },
  ],
};

describe('AuthorWizardPage', () => {
  it('renders the step checklist without a draft', async () => {
    api.getWizardSteps.mockResolvedValue(STEPS);
    render(<AuthorWizardPage />);
    expect(await screen.findByTestId('wizard-step-basics')).toBeTruthy();
    expect(screen.getByTestId('wizard-step-check-basics').textContent).toBe('✓');
    expect(screen.getByTestId('wizard-step-check-review').textContent).toBe('○');
  });

  it('loads lint + readability + translation for a chosen draft', async () => {
    api.getWizardSteps.mockResolvedValue(STEPS);
    api.statementLint.mockResolvedValue({
      count: 1,
      warnings: [{ code: 'missing_input_en', locale: 'en', message: 'No input section.' }],
    });
    api.getReadability.mockResolvedValue({
      locales: {
        en: { score: 71.2, band: 'plain', words: 40, sentences: 3 },
        ro: { score: 66.0, band: 'plain', words: 38, sentences: 3 },
      },
      consistent: true,
    });
    api.getTranslationStatus.mockResolvedValue({
      fields: ['title', 'statement', 'hints'],
      locales: {
        en: { title: true, statement: true, hints: true },
        ro: { title: true, statement: true, hints: false },
      },
      complete: false,
    });
    render(<AuthorWizardPage />);
    await screen.findByTestId('wizard-step-basics');
    fireEvent.change(screen.getByTestId('wizard-problem-input'), {
      target: { value: '9' },
    });
    await waitFor(() => expect(api.statementLint).toHaveBeenCalledWith(9));
    await waitFor(() => expect(screen.getByTestId('wizard-lint-missing_input_en')).toBeTruthy());
    expect(screen.getByTestId('wizard-readability-en').textContent).toContain('71.2');
    expect(screen.getByTestId('wizard-translation').textContent).toContain('hints ✗');
  });

  it('shows the creators-only note for basic users', () => {
    mocks.auth.user = { id: 2, username: 'bob', email: 'b@x.com', role: 'BASIC_USER' } as User;
    render(<AuthorWizardPage />);
    expect(screen.getByText(/creators and verifiers/i)).toBeTruthy();
    mocks.auth.user = {
      id: 1,
      username: 'author',
      email: 'a@x.com',
      role: 'PROBLEM_CREATOR',
    } as User;
  });
});
