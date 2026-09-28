// Ported from frontend/webcoder_ui/src/services/ApiService.ts (CRA reference).
// Next.js adaptation: the API base URL comes from NEXT_PUBLIC_API_BASE
// (default http://localhost:8000). The /api/v1 prefix is preserved from the
// reference — every endpoint path below is relative to it.
//
// NEW (not in the CRA reference): apiFetch wraps every request with a
// refresh-token flow — on a 401 it POSTs the simplejwt refresh endpoint
// once, retries the original request once, and reports refresh failures to
// AuthContext via the registered unauthorized handler. See apiFetch below.

import {
  AdminStatsResponse,
  CreateSubmissionResponse,
  GetAdminUsersResponse,
  GetProblemDetailResponse,
  GetProblemsResponse,
  GetSubmissionDetailResponse,
  GetSubmissionsResponse,
  GetTagsResponse,
  LoginResponse,
  RegisterResponse,
  UpdateProblemResponse,
} from '@/types/api';
import { TestCaseType, User } from '@/types';

const API_BASE_URL = `${process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000'}/api/v1`;

// simplejwt refresh endpoint (backend/webcoder_api/urls.py: api/v1/token/refresh/).
const REFRESH_ENDPOINT = '/token/refresh/';

// NOTE (hardening follow-up, deliberately out of scope here): tokens remain
// in localStorage exactly as in the CRA reference. Migrating them to
// httpOnly cookies is tracked as a separate hardening item.

type UnauthorizedHandler = () => void;

// AuthContext registers its logout() here on mount (and unregisters on
// unmount) so the service layer can clear React auth state when a refresh
// fails. Injected via setter instead of importing the context to avoid a
// circular dependency (AuthContext -> ApiService).
let unauthorizedHandler: UnauthorizedHandler | null = null;

export const setUnauthorizedHandler = (handler: UnauthorizedHandler | null): void => {
  unauthorizedHandler = handler;
};

// Single-flight refresh: while one refresh POST is pending, concurrent 401s
// await the same promise instead of stampeding the refresh endpoint.
let refreshInFlight: Promise<boolean> | null = null;

const refreshAccessToken = (): Promise<boolean> => {
  if (!refreshInFlight) {
    const attempt = (async () => {
      const storedRefresh = localStorage.getItem('refreshToken');
      if (!storedRefresh) {
        return false;
      }
      try {
        let response = await fetch(`${API_BASE_URL}${REFRESH_ENDPOINT}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh: storedRefresh }),
        });
        if (!response.ok) {
          return false;
        }
        const data: { access?: string } = await response.json().catch(() => ({}));
        if (!data.access) {
          return false;
        }
        localStorage.setItem('accessToken', data.access);
        return true;
      } catch {
        // A network failure during refresh behaves like a failed refresh.
        return false;
      }
    })();
    refreshInFlight = attempt;
    // Free the slot once the attempt settles. The reset must live OUTSIDE the
    // async body: on the no-refresh-token path the body completes
    // synchronously, so an in-body `finally` would clear the slot BEFORE the
    // `refreshInFlight = attempt` assignment lands — that assignment would
    // then pin the settled promise in the slot forever, silently disabling
    // all future refreshes. The identity guard keeps a concurrent newer
    // attempt from being clobbered.
    const clear = () => {
      if (refreshInFlight === attempt) {
        refreshInFlight = null;
      }
    };
    attempt.then(clear, clear);
  }
  return refreshInFlight;
};

const authenticatedFetch = async (url: string, options: RequestInit): Promise<Response> => {
  const token = localStorage.getItem('accessToken');
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (options.body) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers,
  });
};

const apiFetch = async <T>(url: string, options: RequestInit = {}): Promise<T> => {
  let response = await authenticatedFetch(url, options);

  if (response.status === 401) {
    // One refresh attempt, then exactly one retry of the ORIGINAL request.
    // The retried response is never fed back into this branch, so a 401 on
    // the retry surfaces as a normal error — no retry loop is possible.
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await authenticatedFetch(url, options);
    } else {
      // Refresh failed (expired/blacklisted refresh token, network error, or
      // none stored): the session is dead — let AuthContext log the user out.
      unauthorizedHandler?.();
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || response.statusText);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
};

export const AuthService = {
    register: (userData: Record<string, unknown>) => apiFetch<RegisterResponse>('/users/register/', { method: 'POST', body: JSON.stringify(userData) }),
    login: (credentials: Record<string, unknown>) => apiFetch<LoginResponse>('/auth/login/', { method: 'POST', body: JSON.stringify(credentials) }),
    getMe: () => apiFetch<User>('/users/me/'),
    getUser: (userId: number | string) => apiFetch<User>(`/users/${userId}/`),
    changePassword: (passwordData: Record<string, unknown>) => apiFetch<{ detail?: string }>('/users/password/change/', { method: 'POST', body: JSON.stringify(passwordData) }),
};

export const ProblemService = {
    getProblems: (filters: { status?: string, authorId?: number | string } = {}) => {
        const params = new URLSearchParams();
        if (filters.status !== undefined) params.set('status', filters.status);
        if (filters.authorId !== undefined) params.set('authorId', String(filters.authorId));
        return apiFetch<GetProblemsResponse>(`/problems/problems/?${params.toString()}`);
    },
    getProblemDetail: (id: number | string) => apiFetch<GetProblemDetailResponse>(`/problems/problems/${id}/`),
    createProblem: (problemData: Record<string, unknown>) => apiFetch<GetProblemDetailResponse>('/problems/problems/', { method: 'POST', body: JSON.stringify(problemData) }),
    updateProblem: (id: number | string, problemData: Record<string, unknown>) => apiFetch<UpdateProblemResponse>(`/problems/problems/${id}/`, { method: 'PATCH', body: JSON.stringify(problemData) }),
    deleteProblem: (id: number | string) => apiFetch<void>(`/problems/problems/${id}/`, { method: 'DELETE' }),

    submitForApproval: (id: number | string) => apiFetch<GetProblemDetailResponse>(`/problems/problems/${id}/submit-for-approval/`, { method: 'POST' }),
    approveProblem: (id: number | string, feedbackData: { feedback?: string }) => apiFetch<GetProblemDetailResponse>(`/problems/problems/${id}/approve/`, { method: 'POST', body: JSON.stringify(feedbackData) }),
    rejectProblem: (id: number | string, feedbackData: { feedback: string }) => apiFetch<GetProblemDetailResponse>(`/problems/problems/${id}/reject/`, { method: 'POST', body: JSON.stringify(feedbackData) }),

    getTags: () => apiFetch<GetTagsResponse>('/problems/tags/'),
};

export const SubmissionService = {
    createSubmission: (submissionData: Record<string, unknown>) => apiFetch<CreateSubmissionResponse>('/submissions/submit/', { method: 'POST', body: JSON.stringify(submissionData) }),
    getSubmissions: (filters: { problemId?: number, userId?: number, language?: string } = {}) => {
        const params = new URLSearchParams();
        if (filters.problemId !== undefined) params.set('problemId', String(filters.problemId));
        if (filters.userId !== undefined) params.set('userId', String(filters.userId));
        if (filters.language !== undefined) params.set('language', filters.language);
        return apiFetch<GetSubmissionsResponse>(`/submissions/submissions/?${params.toString()}`);
    },
    getSubmissionDetail: (id: number | string) => apiFetch<GetSubmissionDetailResponse>(`/submissions/submissions/${id}/`),
};

export const TestCaseService = {
    createTestCase: (testCaseData: Record<string, unknown>) => apiFetch<TestCaseType>('/problems/testcases/', { method: 'POST', body: JSON.stringify(testCaseData) }),
    updateTestCase: (id: number | string, testCaseData: Record<string, unknown>) => apiFetch<TestCaseType>(`/problems/testcases/${id}/`, { method: 'PATCH', body: JSON.stringify(testCaseData) }),
    deleteTestCase: (id: number | string) => apiFetch<void>(`/problems/testcases/${id}/`, { method: 'DELETE' }),
};

export const AdminService = {
    getUsers: () => apiFetch<GetAdminUsersResponse>(`/users/admin/manage/`),
    updateUser: (userId: number | string, userData: { role?: string, is_active?: boolean }) => apiFetch<{ detail?: string }>(`/users/admin/manage/${userId}/`, { method: 'PATCH', body: JSON.stringify(userData) }),
    getStats: () => apiFetch<AdminStatsResponse>('/users/admin/stats/'),
};
