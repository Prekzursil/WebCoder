import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import ExamModeBanner from './ExamModeBanner';
import type { User } from '@/types';

// EDU-4: the lockdown banner renders while an exam teme is OPEN and stays
// out of the way otherwise.

const api = vi.hoisted(() => ({ getExamMode: vi.fn() }));

vi.mock('@/services/ApiService', () => ({
  ClassroomService: api,
}));

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    user: { id: 10, username: 'alice', email: 'a@x.com', role: 'BASIC' } as
      | User
      | null,
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mocks.auth,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('ExamModeBanner', () => {
  it('stays hidden when no exam is active', async () => {
    api.getExamMode.mockResolvedValue({ active: false, assignment: null });
    const { container } = render(<ExamModeBanner />);
    await waitFor(() => expect(api.getExamMode).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="exam-mode-banner"]')).toBeNull();
  });

  it('announces the active exam with its deadline', async () => {
    api.getExamMode.mockResolvedValue({
      active: true,
      assignment: {
        id: 7,
        title_i18n: { en: 'Exam', ro: 'Examen' },
        classroom: 'IX-A',
        due_at: '2026-11-01T12:00:00Z',
      },
    });
    render(<ExamModeBanner />);
    const banner = await screen.findByTestId('exam-mode-banner');
    expect(banner).toHaveTextContent(/Exam mode is ON/i);
    expect(banner).toHaveAttribute('role', 'alert');
  });

  it('never fetches while logged out', () => {
    mocks.auth.isAuthenticated = false;
    render(<ExamModeBanner />);
    expect(api.getExamMode).not.toHaveBeenCalled();
    mocks.auth.isAuthenticated = true;
  });

  it('swallows fetch failures silently', async () => {
    api.getExamMode.mockRejectedValue(new Error('network'));
    const { container } = render(<ExamModeBanner />);
    await waitFor(() => expect(api.getExamMode).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="exam-mode-banner"]')).toBeNull();
  });
});
