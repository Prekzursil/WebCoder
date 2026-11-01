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
  AssignmentGrid,
  Clarification,
  ClassMembershipRow,
  ClassRoom,
  ArticleRow,
  ClassroomAssignment,
  CommunityEditorialRow,
  FeedResponse,
  HonorResponse,
  SolutionsResponse,
  WeeklyBoardRow,
  DeliverableRow,
  ExamModeStatus,
  MCQItemRow,
  QuizSheet,
  QuizSubmitResult,
  Contest,
  ContestProblemRow,
  CreateSubmissionResponse,
  CursorPaginatedResponse,
  ForumPost,
  ForumReport,
  ForumThread,
  GetAdminUsersResponse,
  GetContestsResponse,
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
  MyClassRow,
  MyLeaderboardEntry,
  MyRating,
  PaginatedResponse,
  RatingBand,
  RatingChangeRow,
  RatingLadderRow,
  RegisterResponse,
  ContestAwardsResponse,
  StandingsResponse,
  UpdateProblemResponse,
  cursorParamFromUrl,
  AssignmentSolutionsResponse,
  FollowingResponse,
  LanguageRow,
  TagProfile,
  ApiConversation,
  ApiPrivateMessage,
  ApiBlock,
  ApiMessageReport,
  ApiAdminConversation,
  ApiFlaggedMessage,
  GetConversationsResponse,
  GetPrivateMessagesResponse,
  GetBlocksResponse,
  GetMessageReportsResponse,
  GetAdminConversationsResponse,
} from "@/types/api";
import { TestCaseType, User } from "@/types";
import { API_V1_URL } from "@/lib/api-config";

const API_BASE_URL = API_V1_URL;

// dj-rest-auth cookie-aware refresh endpoint: an EMPTY-body POST; the
// server reads the wc_refresh httpOnly cookie, rotates it, and re-sets the
// wc_access cookie.
const REFRESH_ENDPOINT = "/auth/token/refresh/";
const CSRF_ENDPOINT = "/auth/csrf/";
const LOGOUT_ENDPOINT = "/auth/logout/";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

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
        // codeql[js/request-forgery] — URL is two module constants; no user
        // input (owner triage: alert #122, false positive, 2026-10-27).
        const response = await fetch(`${API_BASE_URL}${REFRESH_ENDPOINT}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
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
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("csrftoken="));
  return match ? decodeURIComponent(match.slice("csrftoken=".length)) : null;
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
        // codeql[js/request-forgery] — URL is two module constants; no user
        // input (owner triage: alert #121, false positive, 2026-10-27).
        await fetch(`${API_BASE_URL}${CSRF_ENDPOINT}`, { credentials: "include" });
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
    headers.set("Content-Type", "application/json");
  }
  // Cookie-authenticated unsafe methods require the double-submit CSRF
  // header (backend JWT_AUTH_COOKIE_USE_CSRF).
  const method = (options.method || "GET").toUpperCase();
  if (UNSAFE_METHODS.has(method)) {
    const csrfToken = await ensureCsrfToken();
    if (csrfToken && !headers.has("X-CSRFToken")) {
      headers.set("X-CSRFToken", csrfToken);
    }
  }

  // codeql[js/request-forgery] — url originates solely from this module's own
  // typed service methods over the fixed API_BASE_URL (owner triage: alert
  // #120, false positive, 2026-10-27).
  return fetch(`${API_BASE_URL}${url}`, {
    ...options,
    credentials: "include",
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
    throw new Error(extractErrorMessage(errorData) || response.statusText);
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
  if (typeof errorData !== "object" || errorData === null) return "";
  const data = errorData as Record<string, unknown>;
  if (typeof data.detail === "string") return data.detail;
  const nonField = data.non_field_errors;
  if (Array.isArray(nonField) && nonField.length > 0) return String(nonField[0]);
  for (const value of Object.values(data)) {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
      return value[0];
    }
  }
  return "";
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
  fetchPage: (page: number) => Promise<PaginatedResponse<T>>,
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
  fetchPage: (cursor: string | null) => Promise<CursorPaginatedResponse<T>>,
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
  register: (userData: Record<string, unknown>) =>
    apiFetch<RegisterResponse>("/users/register/", {
      method: "POST",
      body: JSON.stringify(userData),
    }),
  login: (credentials: Record<string, unknown>) =>
    apiFetch<LoginResponse>("/auth/login/", { method: "POST", body: JSON.stringify(credentials) }),
  getMe: () => apiFetch<User>("/users/me/"),
  /** RO-3/LEG-2: the self-service identity slice (county/school/is_minor). */
  updateMe: (data: { county?: string; school?: string; isMinor?: boolean }) =>
    apiFetch<User>("/users/me/", {
      method: "PATCH",
      body: JSON.stringify({
        county: data.county,
        school: data.school,
        ...(data.isMinor !== undefined ? { is_minor: data.isMinor } : {}),
      }),
    }),
  // [F5] Solved/attempted problem-id sets for the catalog indicator column.
  getSolvedIds: () => apiFetch<{ solved: number[]; attempted: number[] }>("/users/me/solved-ids/"),
  // [B5/RAT-4/5/6] Practice statistics + derivations for the profile page.
  getMyStatistics: () =>
    apiFetch<{
      solved: number;
      attempted: number;
      total_submissions: number;
      acceptance_rate: number | null;
      per_difficulty: Record<string, { solved: number; attempted: number }>;
      per_language: Record<string, number>;
      active_dates_90d: string[];
      current_streak: number;
      max_streak: number;
      total_active_days: number;
      ladder: { points: number; level: number; next_level_points: number; progress: number };
      badges: string[];
      /** RAT-7: per-tag skill profile + practice-next strip. */
      tag_profile: TagProfile;
    }>("/users/me/statistics/"),
  // [LEG-1/X5] GDPR account control.
  exportAccount: () => apiFetch<{ detail?: string }>("/users/me/export/", { method: "POST" }),
  deleteAccount: () =>
    apiFetch<{ detail: string }>("/users/me/delete/", {
      method: "POST",
      body: JSON.stringify({ confirm: "DELETE" }),
    }),
  getUser: (userId: number | string) => apiFetch<User>(`/users/${userId}/`),
  changePassword: (passwordData: Record<string, unknown>) =>
    apiFetch<{ detail?: string }>("/users/password/change/", {
      method: "POST",
      body: JSON.stringify(passwordData),
    }),
  // [SP1] Cookie-mode logout: dj-rest-auth blacklists the rotated refresh
  // cookie and clears wc_access/wc_refresh. Fire-and-forget safe.
  logout: () => apiFetch<{ detail?: string }>(LOGOUT_ENDPOINT, { method: "POST" }),
  // [OPS-2 Wave D] TOTP two-factor enrollment lifecycle.
  totpBegin: () =>
    apiFetch<{ secret: string; otpauth_uri: string }>("/users/me/totp/begin/", { method: "POST" }),
  totpVerify: (code: string) =>
    apiFetch<{ detail: string }>("/users/me/totp/verify/", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  totpDisable: (code: string, currentPassword: string) =>
    apiFetch<{ detail: string }>("/users/me/totp/disable/", {
      method: "POST",
      body: JSON.stringify({ code, current_password: currentPassword }),
    }),
  // [OPS-2 Wave D] Personal API tokens (public-API companion credential).
  getApiTokens: () =>
    apiFetch<{ count: number; results: { key_hint: string; created: string }[] }>(
      "/users/me/tokens/",
    ),
  createApiToken: () =>
    apiFetch<{ detail: string; key: string; created: string }>("/users/me/tokens/", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  revokeApiToken: () => apiFetch<{ detail: string }>("/users/me/tokens/", { method: "DELETE" }),
};

export const ToolingService = {
  getStatementRevisions: (problemId: number | string) =>
    apiFetch<{
      count: number;
      results: { id: number; note: string; edited_by: string | null; created_at: string }[];
    }>(`/problems/problems/${problemId}/statement-revisions/`),
  getSamplesBundle: (problemId: number | string) =>
    apiFetch<{ count: number; filename: string; content: string }>(
      `/problems/${problemId}/samples/`,
    ),
};

export const CommunityService = {
  getFeed: (page = 1) => apiFetch<FeedResponse>(`/community/feed/?page=${page}`),
  getSolutions: (problemId: number | string) =>
    apiFetch<SolutionsResponse>(`/community/problems/${problemId}/solutions/`),
  getHonor: (username: string) => apiFetch<HonorResponse>(`/community/honor/${username}/`),
  getMyHonor: () => apiFetch<HonorResponse>("/community/honor/me/"),
  getWeeklyBoard: () =>
    apiFetch<{ count: number; window_days: number; results: WeeklyBoardRow[] }>(
      "/community/leaderboard/weekly/",
    ),

  getCommunityEditorials: (
    problemId: number | string,
    params: { lang?: string; page?: number } = {},
  ) => {
    const search = new URLSearchParams();
    if (params.lang) search.set("lang", params.lang);
    search.set("page", String(params.page ?? 1));
    return apiFetch<PaginatedResponse<CommunityEditorialRow>>(
      `/problems/${problemId}/community-editorials/?${search.toString()}`,
    );
  },
  createCommunityEditorial: (
    problemId: number | string,
    data: { title: string; body: string; lang: string; submit?: boolean },
  ) =>
    apiFetch<CommunityEditorialRow>(`/problems/${problemId}/community-editorials/`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getRelatedArticles: (problemId: number | string) =>
    apiFetch<{ count: number; results: ArticleRow[] }>(`/problems/${problemId}/related-articles/`),
  getArticles: (params: { tag?: string; page?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.tag) search.set("tag", params.tag);
    search.set("page", String(params.page ?? 1));
    return apiFetch<PaginatedResponse<ArticleRow>>(`/problems/articles/?${search.toString()}`);
  },
  getArticle: (id: number | string) => apiFetch<ArticleRow>(`/problems/articles/${id}/`),
};

export const ProblemService = {
  getProblems: (
    filters: { status?: string; authorId?: number | string; curriculumNode?: number | string } = {},
    page: { page?: number; pageSize?: number } = {},
  ) => {
    const params = new URLSearchParams();
    if (filters.status !== undefined) params.set("status", filters.status);
    if (filters.authorId !== undefined) params.set("authorId", String(filters.authorId));
    if (filters.curriculumNode !== undefined)
      params.set("curriculum_node", String(filters.curriculumNode));
    if (page.page !== undefined) params.set("page", String(page.page));
    if (page.pageSize !== undefined) params.set("page_size", String(page.pageSize));
    const qs = params.toString();
    return apiFetch<GetProblemsResponse>(`/problems/problems/${qs ? `?${qs}` : ""}`);
  },
  getProblemDetail: (id: number | string) =>
    apiFetch<GetProblemDetailResponse>(`/problems/problems/${id}/`),
  createProblem: (problemData: Record<string, unknown>) =>
    apiFetch<GetProblemDetailResponse>("/problems/problems/", {
      method: "POST",
      body: JSON.stringify(problemData),
    }),
  updateProblem: (id: number | string, problemData: Record<string, unknown>) =>
    apiFetch<UpdateProblemResponse>(`/problems/problems/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(problemData),
    }),
  deleteProblem: (id: number | string) =>
    apiFetch<void>(`/problems/problems/${id}/`, { method: "DELETE" }),

  submitForApproval: (id: number | string) =>
    apiFetch<GetProblemDetailResponse>(`/problems/problems/${id}/submit-for-approval/`, {
      method: "POST",
    }),
  approveProblem: (id: number | string, feedbackData: { feedback?: string }) =>
    apiFetch<GetProblemDetailResponse>(`/problems/problems/${id}/approve/`, {
      method: "POST",
      body: JSON.stringify(feedbackData),
    }),
  rejectProblem: (id: number | string, feedbackData: { feedback: string }) =>
    apiFetch<GetProblemDetailResponse>(`/problems/problems/${id}/reject/`, {
      method: "POST",
      body: JSON.stringify(feedbackData),
    }),

  // [UXP-6] Private bookmarks: toggle + starred-id set.
  setBookmark: (id: number | string, starred: boolean) =>
    apiFetch<{ problem: number; starred: boolean; star_count: number }>(
      `/problems/problems/${id}/bookmark/`,
      { method: starred ? "POST" : "DELETE" },
    ),
  getBookmarkedIds: () => apiFetch<{ starred_ids: number[] }>("/problems/problems/bookmarked/"),

  getTags: (page: { page?: number; pageSize?: number } = {}) => {
    const params = new URLSearchParams();
    if (page.page !== undefined) params.set("page", String(page.page));
    if (page.pageSize !== undefined) params.set("page_size", String(page.pageSize));
    const qs = params.toString();
    return apiFetch<GetTagsResponse>(`/problems/tags/${qs ? `?${qs}` : ""}`);
  },

  // [roadmap EDT-1] Editorial with its lock state intact: 403 + locked
  // (publish policy) and 404 (none) are UI states, not error toasts, so
  // this bypasses apiFetch's message-only error and throws typed markers.
  getEditorial: async (id: number | string) => {
    const response = await authenticatedFetch(`/problems/problems/${id}/editorial/`, {
      method: "GET",
    });
    if (response.status === 403) {
      const body = (await response.json().catch(() => ({}))) as {
        detail?: string;
        locked?: boolean;
        publish_policy?: string;
      };
      const err = new Error(body.detail ?? "editorial locked") as Error & {
        responseLocked: boolean;
        policy?: string;
      };
      err.responseLocked = Boolean(body.locked);
      err.policy = body.publish_policy;
      throw err;
    }
    if (response.status === 404) {
      const err = new Error("no editorial") as Error & { notFound: boolean };
      err.notFound = true;
      throw err;
    }
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    return (await response.json()) as {
      content_ro: string;
      content_en: string;
      publish_policy: string;
    };
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
      { method: "POST", body: JSON.stringify({ rating }) },
    ),

  // [roadmap ONB-1] First-run trio: one easy APPROVED problem per paradigm
  // (curriculum chapter), in tree order — the /start page's data source.
  getStarterProblems: () => apiFetch<GetProblemDetailResponse[]>("/problems/problems/starters/"),

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
    >("/problems/curriculum/"),
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
    }>("/scratch/", { method: "POST", body: JSON.stringify(payload) }),
};

export const SubmissionService = {
  createSubmission: (submissionData: Record<string, unknown>) =>
    apiFetch<CreateSubmissionResponse>("/submissions/submit/", {
      method: "POST",
      body: JSON.stringify(submissionData),
    }),
  getSubmissions: (
    filters: { problemId?: number; userId?: number; language?: string } = {},
    page: { cursor?: string | null; pageSize?: number } = {},
  ) => {
    const params = new URLSearchParams();
    if (filters.problemId !== undefined) params.set("problemId", String(filters.problemId));
    if (filters.userId !== undefined) params.set("userId", String(filters.userId));
    if (filters.language !== undefined) params.set("language", filters.language);
    if (page.cursor) params.set("cursor", page.cursor);
    if (page.pageSize !== undefined) params.set("page_size", String(page.pageSize));
    const qs = params.toString();
    return apiFetch<GetSubmissionsResponse>(`/submissions/submissions/${qs ? `?${qs}` : ""}`);
  },
  getSubmissionDetail: (id: number | string) =>
    apiFetch<GetSubmissionDetailResponse>(`/submissions/submissions/${id}/`),
};

export const TestCaseService = {
  createTestCase: (testCaseData: Record<string, unknown>) =>
    apiFetch<TestCaseType>("/problems/testcases/", {
      method: "POST",
      body: JSON.stringify(testCaseData),
    }),
  updateTestCase: (id: number | string, testCaseData: Record<string, unknown>) =>
    apiFetch<TestCaseType>(`/problems/testcases/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(testCaseData),
    }),
  deleteTestCase: (id: number | string) =>
    apiFetch<void>(`/problems/testcases/${id}/`, { method: "DELETE" }),
};

export const AdminService = {
  getUsers: (page: { page?: number; pageSize?: number } = {}) => {
    const params = new URLSearchParams();
    if (page.page !== undefined) params.set("page", String(page.page));
    if (page.pageSize !== undefined) params.set("page_size", String(page.pageSize));
    const qs = params.toString();
    return apiFetch<GetAdminUsersResponse>(`/users/admin/manage/${qs ? `?${qs}` : ""}`);
  },
  updateUser: (userId: number | string, userData: { role?: string; is_active?: boolean }) =>
    apiFetch<{ detail?: string }>(`/users/admin/manage/${userId}/`, {
      method: "PATCH",
      body: JSON.stringify(userData),
    }),
  // [ANA-1 Wave D] Owner product analytics: live activation snapshot +
  // weekly frozen trend.
  getActivation: () =>
    apiFetch<{
      total_users: number;
      users_with_submission: number;
      users_with_ac: number;
      activation_rate: number | null;
      first_ac_rate: number | null;
      d1_active: number;
      d7_active: number;
      d1_rate: number | null;
      d7_rate: number | null;
      submissions_per_day_30d: Record<string, number>;
      total_submissions: number;
    }>("/users/admin/activation/"),
  getActivationHistory: (weeks = 12) =>
    apiFetch<{
      weeks: number;
      history: {
        week: string;
        captured_at: string;
        total_users: number;
        users_with_submission: number;
        users_with_ac: number;
        d1_active: number;
        d7_active: number;
        total_submissions: number;
      }[];
    }>(`/users/admin/activation/history/?weeks=${weeks}`),
  getStats: () => apiFetch<AdminStatsResponse>("/users/admin/stats/"),
};

// =================================
// Leaderboard Service (backend/leaderboard)
// =================================

export const LeaderboardService = {
  /** Public standings, window-ranked, 50 rows/page. */
  getLeaderboard: (
    page: {
      page?: number;
      pageSize?: number;
      friends?: boolean;
      /** RO-3: county/school segment filters (Olympiad geography). */
      county?: string;
      school?: string;
    } = {},
  ) => {
    const params = new URLSearchParams();
    if (page.page !== undefined) params.set("page", String(page.page));
    if (page.pageSize !== undefined) params.set("page_size", String(page.pageSize));
    // COM-4: friends-only board (viewer + followed); ignored when anon.
    if (page.friends) params.set("friends", "1");
    if (page.county) params.set("county", page.county);
    if (page.school) params.set("school", page.school);
    const qs = params.toString();
    return apiFetch<GetLeaderboardResponse>(`/leaderboard/${qs ? `?${qs}` : ""}`);
  },
  /** The caller's own rank + stats (authenticated). */
  getMyEntry: () => apiFetch<MyLeaderboardEntry>("/leaderboard/me/"),
};

// =================================
// Follow Service (COM-4 — friends graph)
// =================================

export const PublicService = {
  /** JDG-9: the public judge registry (toolchain docs). */
  getLanguages: () =>
    apiFetch<{ notice: string; count: number; results: LanguageRow[] }>("/public/languages/"),
};

export const FollowService = {
  /** Toggle the viewer's follow edge; returns the new state + count. */
  toggle: (userId: number) =>
    apiFetch<{ following: boolean; followers: number }>(`/users/${userId}/follow/`, {
      method: "POST",
    }),
  /** By-handle lane: public surfaces render usernames, not ids. */
  toggleByUsername: (username: string) =>
    apiFetch<{ following: boolean; followers: number }>(
      `/users/username/${encodeURIComponent(username)}/follow/`,
      { method: "POST" },
    ),
  /** The viewer's follow list (id + username rows). */
  getFollowing: () => apiFetch<FollowingResponse>("/users/me/following/"),
};

// =================================
// Forum Service (backend/forum)
// =================================

export const ForumService = {
  /** Public thread list, ordered pinned-then-last-activity, 20/page. */
  getThreads: (
    params: {
      page?: number;
      pageSize?: number;
      problemId?: number | string;
      /** EDT-4: writing-language filter (ro/en). */
      lang?: string;
      /** COM-2: 'problem' | 'editorial' topic axis. */
      topic?: string;
      /** COM-6: the admin news feed (announcement threads only). */
      announcements?: boolean;
    } = {},
  ) => {
    const search = new URLSearchParams();
    if (params.page !== undefined) search.set("page", String(params.page));
    if (params.pageSize !== undefined) search.set("page_size", String(params.pageSize));
    if (params.problemId !== undefined) search.set("problem_id", String(params.problemId));
    if (params.lang) search.set("lang", params.lang);
    if (params.topic) search.set("topic", params.topic);
    if (params.announcements) search.set("announcements", "1");
    const qs = search.toString();
    return apiFetch<GetForumThreadsResponse>(`/forum/threads/${qs ? `?${qs}` : ""}`);
  },
  getThread: (threadId: number | string) => apiFetch<ForumThread>(`/forum/threads/${threadId}/`),
  /** Creates the thread + its first post atomically ({title, content, problem?}). */
  createThread: (data: { title: string; content: string; problem?: number | null }) =>
    apiFetch<ForumThread>("/forum/threads/", { method: "POST", body: JSON.stringify(data) }),
  /** Posts inside a thread, oldest-first cursor pagination. */
  getPosts: (
    threadId: number | string,
    page: { cursor?: string | null; pageSize?: number } = {},
  ) => {
    const params = new URLSearchParams();
    if (page.cursor) params.set("cursor", page.cursor);
    if (page.pageSize !== undefined) params.set("page_size", String(page.pageSize));
    const qs = params.toString();
    return apiFetch<GetForumPostsResponse>(
      `/forum/threads/${threadId}/posts/${qs ? `?${qs}` : ""}`,
    );
  },
  /** Reply to a thread ({content, parent?} — parent must be in the same thread). */
  createPost: (
    threadId: number | string,
    data: { content: string; parent?: number | null; isSpoiler?: boolean },
  ) =>
    apiFetch<ForumPost>(`/forum/threads/${threadId}/posts/`, {
      method: "POST",
      // COM-1: the API speaks snake_case for the spoiler flag.
      body: JSON.stringify({ ...data, is_spoiler: data.isSpoiler ?? false }),
    }),
  getPost: (postId: number | string) => apiFetch<ForumPost>(`/forum/posts/${postId}/`),
  updatePost: (postId: number | string, data: { content: string }) =>
    apiFetch<ForumPost>(`/forum/posts/${postId}/`, { method: "PATCH", body: JSON.stringify(data) }),
  /** Vote: 1 = up, -1 = down, 0 = remove the vote. Returns the new net score. */
  votePost: (postId: number | string, value: 1 | -1 | 0) =>
    apiFetch<{ upvotes: number }>(`/forum/posts/${postId}/vote/`, {
      method: "POST",
      body: JSON.stringify({ value }),
    }),
  /** Report a post (duplicate reporter+post → 409). */
  reportPost: (postId: number | string, data: { reason: string; details?: string }) =>
    apiFetch<ForumReport>(`/forum/reports/`, {
      method: "POST",
      body: JSON.stringify({ post: postId, ...data }),
    }),
};

// =================================
// Messaging Service (COM-5 private 1:1 threads + safety stack)
// =================================

export const MessagingService = {
  /** The viewer's threads (block-hidden ones excluded by the backend). */
  getThreads: (page: { cursor?: string | null } = {}) => {
    const params = new URLSearchParams();
    if (page.cursor) params.set("cursor", page.cursor);
    const qs = params.toString();
    return apiFetch<GetConversationsResponse>(`/messages/threads/${qs ? `?${qs}` : ""}`);
  },
  /** Start (or fetch) a 1:1 thread; blocks/minor policy answer 403 with {detail: code}. */
  startThread: (data: { userId?: number; username?: string }) =>
    apiFetch<ApiConversation>("/messages/threads/", {
      method: "POST",
      body: JSON.stringify(
        data.userId !== undefined ? { user_id: data.userId } : { username: data.username ?? "" },
      ),
    }),
  getThread: (threadId: number | string) =>
    apiFetch<ApiConversation>(`/messages/threads/${threadId}/`),
  /** Message history, newest-first cursor pagination. */
  getMessages: (
    threadId: number | string,
    page: { cursor?: string | null; pageSize?: number } = {},
  ) => {
    const params = new URLSearchParams();
    if (page.cursor) params.set("cursor", page.cursor);
    if (page.pageSize !== undefined) params.set("page_size", String(page.pageSize));
    const qs = params.toString();
    return apiFetch<GetPrivateMessagesResponse>(
      `/messages/threads/${threadId}/messages/${qs ? `?${qs}` : ""}`,
    );
  },
  /** Send a plain-text message (30/hour budget server-side). */
  sendMessage: (threadId: number | string, body: string) =>
    apiFetch<ApiPrivateMessage>(`/messages/threads/${threadId}/send/`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),
  /** Mark the other party's messages read (idempotent). */
  markRead: (threadId: number | string) =>
    apiFetch<{ marked_read: number }>(`/messages/threads/${threadId}/read/`, {
      method: "POST",
    }),
  /** Report a message into the moderation queue (duplicate → 409). */
  reportMessage: (
    messageId: number | string,
    data: { reason: "SPAM" | "ABUSE" | "GROOMING" | "OTHER"; details?: string },
  ) =>
    apiFetch<ApiMessageReport>(`/messages/messages/${messageId}/report/`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  // -- Blocks (mute list) --
  getBlocks: () => apiFetch<GetBlocksResponse>("/messages/blocks/"),
  blockUser: (data: { userId?: number; username?: string }) =>
    apiFetch<ApiBlock>("/messages/blocks/", {
      method: "POST",
      body: JSON.stringify(
        data.userId !== undefined ? { user_id: data.userId } : { username: data.username ?? "" },
      ),
    }),
  unblockUser: (userId: number) =>
    apiFetch<void>(`/messages/blocks/${userId}/`, { method: "DELETE" }),
  // -- Moderation queue (VERIFIER/ADMIN) --
  getReports: (status?: string) =>
    apiFetch<GetMessageReportsResponse>(
      `/messages/moderation/reports/${status ? `?status=${status}` : ""}`,
    ),
  resolveReport: (reportId: number | string, action: "resolved" | "dismissed", note = "") =>
    apiFetch<ApiMessageReport>(`/messages/moderation/reports/${reportId}/resolve/`, {
      method: "POST",
      body: JSON.stringify({ action, note }),
    }),
  getFlagged: () => apiFetch<PaginatedResponse<ApiFlaggedMessage>>("/messages/moderation/flagged/"),
  // -- Admin audit (metadata only; transcripts behind an explicit report) --
  getAdminThreads: () => apiFetch<GetAdminConversationsResponse>("/messages/admin/threads/"),
  getTranscript: (threadId: number | string) =>
    apiFetch<{
      conversation: ApiAdminConversation;
      messages: Array<ApiPrivateMessage & { is_flagged?: boolean }>;
    }>(`/messages/admin/threads/${threadId}/transcript/`),
};

// =================================
// Notification Service (backend/notifications)
// =================================

export const NotificationService = {
  /** The caller's own notifications, newest-first cursor pagination. */
  getNotifications: (
    params: { cursor?: string | null; unreadOnly?: boolean; pageSize?: number } = {},
  ) => {
    const search = new URLSearchParams();
    if (params.cursor) search.set("cursor", params.cursor);
    if (params.unreadOnly) search.set("unread", "true");
    if (params.pageSize !== undefined) search.set("page_size", String(params.pageSize));
    const qs = search.toString();
    return apiFetch<GetNotificationsResponse>(`/notifications/${qs ? `?${qs}` : ""}`);
  },
  getNotification: (id: number | string) => apiFetch<ApiNotification>(`/notifications/${id}/`),
  markRead: (id: number | string) =>
    apiFetch<ApiNotification>(`/notifications/${id}/mark-read/`, { method: "POST" }),
  markAllRead: () =>
    apiFetch<{ marked: number }>("/notifications/mark-all-read/", { method: "POST" }),
  getUnreadCount: () => apiFetch<{ count: number }>("/notifications/unread-count/"),
};

// =================================
// Contests (backend contests app, Wave B CON-1..10 + RAT)
// =================================

export const ContestService = {
  getContests: (
    filters: { state?: "UPCOMING" | "RUNNING" | "FINISHED" } = {},
    page: { page?: number; pageSize?: number } = {},
  ) => {
    const params = new URLSearchParams();
    if (filters.state) params.set("state", filters.state);
    if (page.page !== undefined) params.set("page", String(page.page));
    if (page.pageSize !== undefined) params.set("page_size", String(page.pageSize));
    const qs = params.toString();
    return apiFetch<GetContestsResponse>(`/contests/contests/${qs ? `?${qs}` : ""}`);
  },
  getContest: (id: number | string) => apiFetch<Contest>(`/contests/contests/${id}/`),
  register: (id: number | string, accessCode?: string) =>
    apiFetch<{ contest: number; user: number }>(`/contests/contests/${id}/register/`, {
      method: "POST",
      body: JSON.stringify(accessCode ? { access_code: accessCode } : {}),
    }),
  startPersonalClock: (id: number | string) =>
    apiFetch<{ virtual_start: string; effective_end: string }>(`/contests/contests/${id}/start/`, {
      method: "POST",
    }),
  getProblems: (id: number | string) =>
    apiFetch<ContestProblemRow[]>(`/contests/contests/${id}/problems/`),
  getStandings: (
    id: number | string,
    page = 1,
    section?: "official" | "virtual",
    friends = false,
  ) => {
    const params = new URLSearchParams({ page: String(page) });
    if (section) params.set("section", section);
    // COM-4: friends-only standings (viewer + followed).
    if (friends) params.set("friends", "1");
    return apiFetch<StandingsResponse>(`/contests/contests/${id}/standings/?${params.toString()}`);
  },
  startVirtual: (id: number | string) =>
    apiFetch<{ virtual_start: string; effective_end: string; is_virtual: boolean }>(
      `/contests/contests/${id}/virtual-start/`,
      { method: "POST" },
    ),
  getAwards: (id: number | string) =>
    apiFetch<ContestAwardsResponse>(`/contests/contests/${id}/awards/`),
  createContest: (data: Record<string, unknown>) =>
    apiFetch<Contest>("/contests/contests/", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  unfreeze: (id: number | string) =>
    apiFetch<{ detail: string }>(`/contests/contests/${id}/unfreeze/`, { method: "POST" }),
  getClarifications: (id: number | string) =>
    apiFetch<{ results: Clarification[]; canned_answers?: string[] }>(
      `/contests/contests/${id}/clarifications/`,
    ),
  askClarification: (id: number | string, question: string, problemId?: number | null) =>
    apiFetch<Clarification>(`/contests/contests/${id}/clarifications/`, {
      method: "POST",
      body: JSON.stringify({ question, problem: problemId ?? null }),
    }),
  answerClarification: (
    id: number | string,
    clarificationId: number,
    answer: string,
    broadcast: boolean,
  ) =>
    apiFetch<Clarification>(`/contests/contests/${id}/clarifications/${clarificationId}/answer/`, {
      method: "POST",
      body: JSON.stringify({ answer, is_broadcast: broadcast }),
    }),
  getRatingChanges: (id: number | string) =>
    apiFetch<{
      contest: number;
      is_rated: boolean;
      discarded: boolean;
      changes: RatingChangeRow[];
    }>(`/contests/contests/${id}/rating-changes/`),
};

// =================================
// Ratings (backend ratings app, RAT-1/2/3)
// =================================

export const RatingService = {
  getLadder: (page = 1) =>
    apiFetch<PaginatedResponse<RatingLadderRow>>(`/ratings/ratings/?page=${page}`),
  getColors: () => apiFetch<{ bands: RatingBand[] }>("/ratings/ratings/colors/"),
  getMyRating: () => apiFetch<MyRating>("/ratings/ratings/me/"),
};

// =================================
// Classroom (backend classroom app, Wave B EDU-1/2/3/5/6)
// =================================

export const ClassroomService = {
  getClasses: (page = 1) =>
    apiFetch<PaginatedResponse<ClassRoom>>(`/classroom/classes/?page=${page}`),
  createClass: (data: { name: string; school?: string; join_password?: string }) =>
    apiFetch<ClassRoom>("/classroom/classes/", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getClass: (id: number | string) => apiFetch<ClassRoom>(`/classroom/classes/${id}/`),
  updateClass: (id: number | string, data: Record<string, unknown>) =>
    apiFetch<ClassRoom>(`/classroom/classes/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteClass: (id: number | string) =>
    apiFetch<void>(`/classroom/classes/${id}/`, { method: "DELETE" }),
  getMembers: (id: number | string) =>
    apiFetch<ClassMembershipRow[]>(`/classroom/classes/${id}/members/`),
  joinClass: (code: string, password?: string) =>
    apiFetch<{ detail: string; classroom_id: number }>("/classroom/classes/join/", {
      method: "POST",
      body: JSON.stringify({ code, password: password ?? "" }),
    }),
  getMyClasses: () => apiFetch<{ results: MyClassRow[] }>("/classroom/classes/my-classes/"),
  getAssignments: (classroomId?: number | string, page = 1) => {
    const params = new URLSearchParams({ page: String(page) });
    if (classroomId !== undefined) params.set("classroomId", String(classroomId));
    return apiFetch<PaginatedResponse<ClassroomAssignment>>(
      `/classroom/assignments/?${params.toString()}`,
    );
  },
  createAssignment: (data: Record<string, unknown>) =>
    apiFetch<ClassroomAssignment>("/classroom/assignments/", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateAssignment: (id: number | string, data: Record<string, unknown>) =>
    apiFetch<ClassroomAssignment>(`/classroom/assignments/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteAssignment: (id: number | string) =>
    apiFetch<void>(`/classroom/assignments/${id}/`, { method: "DELETE" }),
  getAssignment: (id: number | string) =>
    apiFetch<ClassroomAssignment>(`/classroom/assignments/${id}/`),
  getMcqItems: (params: { discipline?: string; grade?: string; bacYear?: string } = {}) => {
    const search = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][],
    );
    return apiFetch<PaginatedResponse<MCQItemRow>>(`/classroom/mcq/?${search.toString()}`);
  },
  getQuizSheet: (id: number | string) => apiFetch<QuizSheet>(`/classroom/assignments/${id}/quiz/`),
  submitQuiz: (id: number | string, answers: Record<string, number>) =>
    apiFetch<QuizSubmitResult>(`/classroom/assignments/${id}/quiz/submit/`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    }),
  getDeliverables: (id: number | string) =>
    apiFetch<{ assignment: number; results: DeliverableRow[] }>(
      `/classroom/assignments/${id}/deliverables/`,
    ),
  uploadDeliverable: (id: number | string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<{ id: number; original_filename: string }>(
      `/classroom/assignments/${id}/deliverables/`,
      { method: "POST", body: form },
    );
  },
  getExamMode: () => apiFetch<ExamModeStatus>("/classroom/exam-mode/"),
  getGrid: (id: number | string) => apiFetch<AssignmentGrid>(`/classroom/assignments/${id}/grid/`),
  /** JDG-13 v1: structured solutions of a temă (the diff-view data). */
  getAssignmentSolutionsJson: (assignmentId: number | string) =>
    apiFetch<AssignmentSolutionsResponse>(
      `/problems/tools/assignment-solutions/${assignmentId}/?format=json`,
    ),
  getMyAssignments: () =>
    apiFetch<{ results: ClassroomAssignment[] }>("/classroom/assignments/my-assignments/"),
  /** EDU-6: CSV gradebook download (browser navigates; auth cookie rides). */
  exportCsvUrl: (id: number | string) => `${API_V1_URL}/classroom/assignments/${id}/export/`,
};
