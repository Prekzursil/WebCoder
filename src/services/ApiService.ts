// Ported from frontend/webcoder_ui/src/services/ApiService.ts (CRA reference).
// Next.js adaptation: the API base URL comes from the centralized
// src/lib/api-config.ts module (which reads NEXT_PUBLIC_API_BASE).
// The /api/v1 prefix is preserved from the reference — every endpoint path
// below is relative to it.
//
// NEW (not in the CRA reference): apiFetch wraps every request with a
// refresh-token flow — on a 401 it POSTs the simplejwt refresh endpoint
// once, retries the original request once, and reports refresh failures to
// AuthContext via the registered unauthorized handler. See apiFetch below.

import {
  AdminStatsResponse,
  ApiNotification,
  CreateSubmissionResponse,
  CursorPaginatedResponse,
  cursorParamFromUrl,
  ForumPost,
  ForumReport,
  ForumThread,
  GetAdminUsersResponse,
  GetForumPostsResponse,
  GetForumThreadsResponse,
  GetLeaderboardResponse,
  GetNotificationsResponse,
  GetProblemDetailResponse,
  GetProblemsResponse,
  GetSubmissionDetailResponse,
  GetSubmissionsResponse,
  GetTagsResponse,
  LoginResponse,
  MyLeaderboardEntry,
  PaginatedResponse,
  RegisterResponse,
  UpdateProblemResponse,
} from '@/types/api';
import { TestCaseType, User } from '@/types';
import { API_V1_URL } from '@/lib/api-config';

const API_BASE_URL = API_V1_URL;

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
        const response = await fetch(`${API_BASE_URL}${REFRESH_ENDPOINT}`, {
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
    // Free the slot once the attempt settles.
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
  // An explicitly provided Authorization header wins (e.g. the login flow
  // fetching /users/me/ with the token it JUST received, before any state
  // has been persisted — [Q13]).
  if (token && !headers.has('Authorization')) {
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
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await authenticatedFetch(url, options);
    } else {
      unauthorizedHandler?.();
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    // [Q13] Real Django responses carry errors as `detail` (auth), as
    // `non_field_errors: [..]` (dj-rest-auth login/registration), or as a
    // {field: [messages]} map (serializer validation). Surfacing only
    // `detail` turned every real login failure into a bare "Bad Request".
    throw new Error(
      extractErrorMessage(errorData) || response.statusText
    );
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
};

/**
 * Human-readable message from a DRF error body: detail > non_field_errors >
 * first field-error value. Empty string when nothing recognizable.
 */
function extractErrorMessage(errorData: unknown): string {
  if (typeof errorData !== 'object' || errorData === null) return '';
  const data = errorData as Record<string, unknown>;
  if (typeof data.detail === 'string') return data.detail;
  const nonField = data.non_field_errors;
  if (Array.isArray(nonField) && nonField.length > 0) return String(nonField[0]);
  for (const value of Object.values(data)) {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
      return value[0];
    }
  }
  return '';
}

// =================================
// Pagination helpers (SPEC-GAPS B4)
// =================================

/** Hard ceiling for collectAllPages: 50 pages x max_page_size (100) = 5000
 * rows. Bounded so a "collect everything" caller can never loop a hostile
 * next-chain forever; the cap is documented at every call site. */
const COLLECT_ALL_MAX_PAGES = 50;

/**
 * Follow a page-number paginated endpoint's `next` links until exhausted or
 * the COLLECT_ALL_MAX_PAGES ceiling is hit. Use only for small bounded lists
 * (filter dropdowns, tag pickers, admin user tables); anything user-facing
 * and unbounded should page through the envelope instead.
 */
export async function collectAllPages<T>(
  fetchPage: (page: number) => Promise<PaginatedResponse<T>>
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= COLLECT_ALL_MAX_PAGES; page += 1) {
    const response = await fetchPage(page);
    out.push(...response.results);
    if (!response.next) break;
  }
  return out;
}

/**
 * Follow a cursor-paginated endpoint's `next` links until exhausted or the
 * COLLECT_ALL_MAX_PAGES ceiling is hit. The cursor is re-extracted from the
 * absolute next URL because apiFetch addresses endpoints relative to the
 * API base.
 */
export async function collectAllCursorPages<T>(
  fetchPage: (cursor: string | null) => Promise<CursorPaginatedResponse<T>>
): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < COLLECT_ALL_MAX_PAGES; i += 1) {
    const response = await fetchPage(cursor);
    out.push(...response.results);
    cursor = cursorParamFromUrl(response.next);
    if (!cursor) break;
  }
  return out;
}

export const AuthService = {
    register: (userData: Record<string, unknown>) => apiFetch<RegisterResponse>('/users/register/', { method: 'POST', body: JSON.stringify(userData) }),
    login: (credentials: Record<string, unknown>) => apiFetch<LoginResponse>('/auth/login/', { method: 'POST', body: JSON.stringify(credentials) }),
    getMe: () => apiFetch<User>('/users/me/'),
    // [Q13] /users/me/ with an explicit token — the login flow needs the
    // full profile (id, role) before tokens reach localStorage/state.
    getMeWithToken: (token: string) =>
      apiFetch<User>('/users/me/', { headers: { Authorization: `Bearer ${token}` } }),
    getUser: (userId: number | string) => apiFetch<User>(`/users/${userId}/`),
    changePassword: (passwordData: Record<string, unknown>) => apiFetch<{ detail?: string }>('/users/password/change/', { method: 'POST', body: JSON.stringify(passwordData) }),
};

export const ProblemService = {
    getProblems: (
        filters: { status?: string, authorId?: number | string } = {},
        page: { page?: number, pageSize?: number } = {}
    ) => {
        const params = new URLSearchParams();
        if (filters.status !== undefined) params.set('status', filters.status);
        if (filters.authorId !== undefined) params.set('authorId', String(filters.authorId));
        if (page.page !== undefined) params.set('page', String(page.page));
        if (page.pageSize !== undefined) params.set('page_size', String(page.pageSize));
        const qs = params.toString();
        return apiFetch<GetProblemsResponse>(`/problems/problems/${qs ? `?${qs}` : ''}`);
    },
    getProblemDetail: (id: number | string) => apiFetch<GetProblemDetailResponse>(`/problems/problems/${id}/`),
    createProblem: (problemData: Record<string, unknown>) => apiFetch<GetProblemDetailResponse>('/problems/problems/', { method: 'POST', body: JSON.stringify(problemData) }),
    updateProblem: (id: number | string, problemData: Record<string, unknown>) => apiFetch<UpdateProblemResponse>(`/problems/problems/${id}/`, { method: 'PATCH', body: JSON.stringify(problemData) }),
    deleteProblem: (id: number | string) => apiFetch<void>(`/problems/problems/${id}/`, { method: 'DELETE' }),

    submitForApproval: (id: number | string) => apiFetch<GetProblemDetailResponse>(`/problems/problems/${id}/submit-for-approval/`, { method: 'POST' }),
    approveProblem: (id: number | string, feedbackData: { feedback?: string }) => apiFetch<GetProblemDetailResponse>(`/problems/problems/${id}/approve/`, { method: 'POST', body: JSON.stringify(feedbackData) }),
    rejectProblem: (id: number | string, feedbackData: { feedback: string }) => apiFetch<GetProblemDetailResponse>(`/problems/problems/${id}/reject/`, { method: 'POST', body: JSON.stringify(feedbackData) }),

    getTags: (page: { page?: number, pageSize?: number } = {}) => {
        const params = new URLSearchParams();
        if (page.page !== undefined) params.set('page', String(page.page));
        if (page.pageSize !== undefined) params.set('page_size', String(page.pageSize));
        const qs = params.toString();
        return apiFetch<GetTagsResponse>(`/problems/tags/${qs ? `?${qs}` : ''}`);
    },
};

export const SubmissionService = {
    createSubmission: (submissionData: Record<string, unknown>) => apiFetch<CreateSubmissionResponse>('/submissions/submit/', { method: 'POST', body: JSON.stringify(submissionData) }),
    getSubmissions: (
        filters: { problemId?: number, userId?: number, language?: string } = {},
        page: { cursor?: string | null, pageSize?: number } = {}
    ) => {
        const params = new URLSearchParams();
        if (filters.problemId !== undefined) params.set('problemId', String(filters.problemId));
        if (filters.userId !== undefined) params.set('userId', String(filters.userId));
        if (filters.language !== undefined) params.set('language', filters.language);
        if (page.cursor) params.set('cursor', page.cursor);
        if (page.pageSize !== undefined) params.set('page_size', String(page.pageSize));
        const qs = params.toString();
        return apiFetch<GetSubmissionsResponse>(`/submissions/submissions/${qs ? `?${qs}` : ''}`);
    },
    getSubmissionDetail: (id: number | string) => apiFetch<GetSubmissionDetailResponse>(`/submissions/submissions/${id}/`),
};

export const TestCaseService = {
    createTestCase: (testCaseData: Record<string, unknown>) => apiFetch<TestCaseType>('/problems/testcases/', { method: 'POST', body: JSON.stringify(testCaseData) }),
    updateTestCase: (id: number | string, testCaseData: Record<string, unknown>) => apiFetch<TestCaseType>(`/problems/testcases/${id}/`, { method: 'PATCH', body: JSON.stringify(testCaseData) }),
    deleteTestCase: (id: number | string) => apiFetch<void>(`/problems/testcases/${id}/`, { method: 'DELETE' }),
};

export const AdminService = {
    getUsers: (page: { page?: number, pageSize?: number } = {}) => {
        const params = new URLSearchParams();
        if (page.page !== undefined) params.set('page', String(page.page));
        if (page.pageSize !== undefined) params.set('page_size', String(page.pageSize));
        const qs = params.toString();
        return apiFetch<GetAdminUsersResponse>(`/users/admin/manage/${qs ? `?${qs}` : ''}`);
    },
    updateUser: (userId: number | string, userData: { role?: string, is_active?: boolean }) => apiFetch<{ detail?: string }>(`/users/admin/manage/${userId}/`, { method: 'PATCH', body: JSON.stringify(userData) }),
    getStats: () => apiFetch<AdminStatsResponse>('/users/admin/stats/'),
};

// =================================
// Leaderboard Service (backend/leaderboard)
// =================================

export const LeaderboardService = {
    /** Public standings, window-ranked, 50 rows/page. */
    getLeaderboard: (page: { page?: number, pageSize?: number } = {}) => {
        const params = new URLSearchParams();
        if (page.page !== undefined) params.set('page', String(page.page));
        if (page.pageSize !== undefined) params.set('page_size', String(page.pageSize));
        const qs = params.toString();
        return apiFetch<GetLeaderboardResponse>(`/leaderboard/${qs ? `?${qs}` : ''}`);
    },
    /** The caller's own rank + stats (authenticated). */
    getMyEntry: () => apiFetch<MyLeaderboardEntry>('/leaderboard/me/'),
};

// =================================
// Forum Service (backend/forum)
// =================================

export const ForumService = {
    /** Public thread list, ordered pinned-then-last-activity, 20/page. */
    getThreads: (params: { page?: number, pageSize?: number, problemId?: number | string } = {}) => {
        const search = new URLSearchParams();
        if (params.page !== undefined) search.set('page', String(params.page));
        if (params.pageSize !== undefined) search.set('page_size', String(params.pageSize));
        if (params.problemId !== undefined) search.set('problem_id', String(params.problemId));
        const qs = search.toString();
        return apiFetch<GetForumThreadsResponse>(`/forum/threads/${qs ? `?${qs}` : ''}`);
    },
    getThread: (threadId: number | string) => apiFetch<ForumThread>(`/forum/threads/${threadId}/`),
    /** Creates the thread + its first post atomically ({title, content, problem?}). */
    createThread: (data: { title: string, content: string, problem?: number | null }) =>
        apiFetch<ForumThread>('/forum/threads/', { method: 'POST', body: JSON.stringify(data) }),
    /** Posts inside a thread, oldest-first cursor pagination. */
    getPosts: (threadId: number | string, page: { cursor?: string | null, pageSize?: number } = {}) => {
        const params = new URLSearchParams();
        if (page.cursor) params.set('cursor', page.cursor);
        if (page.pageSize !== undefined) params.set('page_size', String(page.pageSize));
        const qs = params.toString();
        return apiFetch<GetForumPostsResponse>(`/forum/threads/${threadId}/posts/${qs ? `?${qs}` : ''}`);
    },
    /** Reply to a thread ({content, parent?} — parent must be in the same thread). */
    createPost: (threadId: number | string, data: { content: string, parent?: number | null }) =>
        apiFetch<ForumPost>(`/forum/threads/${threadId}/posts/`, { method: 'POST', body: JSON.stringify(data) }),
    getPost: (postId: number | string) => apiFetch<ForumPost>(`/forum/posts/${postId}/`),
    updatePost: (postId: number | string, data: { content: string }) =>
        apiFetch<ForumPost>(`/forum/posts/${postId}/`, { method: 'PATCH', body: JSON.stringify(data) }),
    /** Vote: 1 = up, -1 = down, 0 = remove the vote. Returns the new net score. */
    votePost: (postId: number | string, value: 1 | -1 | 0) =>
        apiFetch<{ upvotes: number }>(`/forum/posts/${postId}/vote/`, { method: 'POST', body: JSON.stringify({ value }) }),
    /** Report a post (duplicate reporter+post → 409). */
    reportPost: (postId: number | string, data: { reason: string, details?: string }) =>
        apiFetch<ForumReport>(`/forum/reports/`, { method: 'POST', body: JSON.stringify({ post: postId, ...data }) }),
};

// =================================
// Notification Service (backend/notifications)
// =================================

export const NotificationService = {
    /** The caller's own notifications, newest-first cursor pagination. */
    getNotifications: (params: { cursor?: string | null, unreadOnly?: boolean, pageSize?: number } = {}) => {
        const search = new URLSearchParams();
        if (params.cursor) search.set('cursor', params.cursor);
        if (params.unreadOnly) search.set('unread', 'true');
        if (params.pageSize !== undefined) search.set('page_size', String(params.pageSize));
        const qs = search.toString();
        return apiFetch<GetNotificationsResponse>(`/notifications/${qs ? `?${qs}` : ''}`);
    },
    getNotification: (id: number | string) => apiFetch<ApiNotification>(`/notifications/${id}/`),
    markRead: (id: number | string) => apiFetch<ApiNotification>(`/notifications/${id}/mark-read/`, { method: 'POST' }),
    markAllRead: () => apiFetch<{ marked: number }>('/notifications/mark-all-read/', { method: 'POST' }),
    getUnreadCount: () => apiFetch<{ count: number }>('/notifications/unread-count/'),
};
