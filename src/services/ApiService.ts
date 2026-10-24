// Ported from frontend/webcoder_ui/src/services/ApiService.ts (CRA reference).
// Next.js adaptation: the API base URL comes from the centralized
// src/lib/api-config.ts module (which reads NEXT_PUBLIC_API_BASE).
// The /api/v1 prefix is preserved from the reference — every endpoint path
// below is relative to it.
//
// [SP1] httpOnly-cookie auth: every request is sent with
// `credentials: 'include'` and NO Authorization header / localStorage token.
// The backend authenticates via the wc_access httpOnly cookie; on 401 the
// wrapper POSTs the dj-rest-auth cookie refresh endpoint once (EMPTY body —
// the server reads the wc_refresh cookie), retries the original request
// once, and reports refresh failures to AuthContext via the registered
// unauthorized handler. Unsafe methods additionally carry the X-CSRFToken
// double-submit header (seeded via GET /auth/csrf/).

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

// dj-rest-auth cookie-aware refresh endpoint: an EMPTY-body POST; the
// server reads the wc_refresh httpOnly cookie, rotates it, and re-sets the
// wc_access cookie.
const REFRESH_ENDPOINT = '/auth/token/refresh/';
const CSRF_ENDPOINT = '/auth/csrf/';
const LOGOUT_ENDPOINT = '/auth/logout/';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

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
      try {
        const response = await fetch(`${API_BASE_URL}${REFRESH_ENDPOINT}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        return response.ok;
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

// ---------- CSRF double-submit header (cookie-auth unsafe methods) ------

function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('csrftoken='));
  return match ? decodeURIComponent(match.slice('csrftoken='.length)) : null;
}

let csrfSeedInFlight: Promise<string | null> | null = null;

const ensureCsrfToken = (): Promise<string | null> => {
  const fromCookie = readCsrfCookie();
  if (fromCookie) return Promise.resolve(fromCookie);
  if (!csrfSeedInFlight) {
    csrfSeedInFlight = (async () => {
      try {
        // GET /auth/csrf/ makes Django set the csrftoken cookie; any
        // failure (e.g. a mock backend without the endpoint) just means
        // "no header available" — the request proceeds without it.
        await fetch(`${API_BASE_URL}${CSRF_ENDPOINT}`, { credentials: 'include' });
      } catch {
        /* best-effort */
      }
      return readCsrfCookie();
    })();
    const clear = () => {
      csrfSeedInFlight = null;
    };
    csrfSeedInFlight.then(clear, clear);
  }
  return csrfSeedInFlight;
};

const authenticatedFetch = async (url: string, options: RequestInit): Promise<Response> => {
  const headers = new Headers(options.headers || {});
  if (options.body) {
    headers.set('Content-Type', 'application/json');
  }
  // Cookie-authenticated unsafe methods require the double-submit CSRF
  // header (backend JWT_AUTH_COOKIE_USE_CSRF).
  const method = (options.method || 'GET').toUpperCase();
  if (UNSAFE_METHODS.has(method)) {
    const csrfToken = await ensureCsrfToken();
    if (csrfToken && !headers.has('X-CSRFToken')) {
      headers.set('X-CSRFToken', csrfToken);
    }
  }

  return fetch(`${API_BASE_URL}${url}`, {
    ...options,
    credentials: 'include',
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
    // [F5] Solved/attempted problem-id sets for the catalog indicator column.
    getSolvedIds: () =>
        apiFetch<{ solved: number[]; attempted: number[] }>('/users/me/solved-ids/'),
    getUser: (userId: number | string) => apiFetch<User>(`/users/${userId}/`),
    changePassword: (passwordData: Record<string, unknown>) => apiFetch<{ detail?: string }>('/users/password/change/', { method: 'POST', body: JSON.stringify(passwordData) }),
    // [SP1] Cookie-mode logout: dj-rest-auth blacklists the rotated refresh
    // cookie and clears wc_access/wc_refresh. Fire-and-forget safe.
    logout: () => apiFetch<{ detail?: string }>(LOGOUT_ENDPOINT, { method: 'POST' }),
};

export const ProblemService = {
    getProblems: (
        filters: { status?: string, authorId?: number | string, curriculumNode?: number | string } = {},
        page: { page?: number, pageSize?: number } = {}
    ) => {
        const params = new URLSearchParams();
        if (filters.status !== undefined) params.set('status', filters.status);
        if (filters.authorId !== undefined) params.set('authorId', String(filters.authorId));
        if (filters.curriculumNode !== undefined) params.set('curriculum_node', String(filters.curriculumNode));
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

    // [roadmap EDT-1] Editorial with its lock state intact: 403 + locked
    // (publish policy) and 404 (none) are UI states, not error toasts, so
    // this bypasses apiFetch's message-only error and throws typed markers.
    getEditorial: async (id: number | string) => {
        const response = await authenticatedFetch(`/problems/problems/${id}/editorial/`, { method: 'GET' });
        if (response.status === 403) {
            const body = (await response.json().catch(() => ({}))) as { detail?: string; locked?: boolean; publish_policy?: string };
            const err = new Error(body.detail ?? 'editorial locked') as Error & {
                responseLocked: boolean;
                policy?: string;
            };
            err.responseLocked = Boolean(body.locked);
            err.policy = body.publish_policy;
            throw err;
        }
        if (response.status === 404) {
            const err = new Error('no editorial') as Error & { notFound: boolean };
            err.notFound = true;
            throw err;
        }
        if (!response.ok) {
            throw new Error(response.statusText);
        }
        return (await response.json()) as { content_ro: string; content_en: string; publish_policy: string };
    },

    // [roadmap UXP-7/X9] Per-problem statistics + satisfaction vote.
    getStatistics: (id: number | string) =>
        apiFetch<{
            problem: number;
            tried: number;
            solved: number;
            acceptance_rate: number | null;
            verdict_distribution: Record<string, number>;
            language_counts: Record<string, number>;
            rating_avg: number | null;
            rating_count: number;
        }>(`/problems/problems/${id}/statistics/`),
    rate: (id: number | string, rating: 1 | 2 | 3) =>
        apiFetch<{ rating_avg: number | null; rating_count: number; your_rating: number }>(
            `/problems/problems/${id}/rate/`,
            { method: 'POST', body: JSON.stringify({ rating }) }
        ),

    // [roadmap ONB-1] First-run trio: one easy APPROVED problem per paradigm
    // (curriculum chapter), in tree order — the /start page's data source.
    getStarterProblems: () =>
        apiFetch<GetProblemDetailResponse[]>('/problems/problems/starters/'),

    // [roadmap EDU-9] Curriculum tree (grades with nested chapters + APPROVED
    // problem counts) for the catalog's second browse axis.
    getCurriculum: () =>
        apiFetch<
            PaginatedResponse<{
                id: number;
                kind: string;
                name_i18n: Record<string, string>;
                slug: string;
                order: number;
                problem_count: number;
                children: {
                    id: number;
                    kind: string;
                    name_i18n: Record<string, string>;
                    slug: string;
                    order: number;
                    problem_count: number;
                }[];
            }>
        >('/problems/curriculum/'),
};

// [roadmap JDG-6/X7] Custom invocation — run code on user input without a
// submission. The endpoint owns its strict 'scratch' throttle.
export const ScratchService = {
    run: (payload: { language: string; code: string; input?: string }) =>
        apiFetch<{
            id: number;
            status: string;
            output: string;
            error: string;
            time_ms?: number;
            memory_kb?: number;
        }>('/scratch/', { method: 'POST', body: JSON.stringify(payload) }),
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
