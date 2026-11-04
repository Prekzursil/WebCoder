// Domain services — faithful ports of the web ApiService's endpoint maps
// (same paths, same envelopes, same snake_case bodies). Only the surfaces
// the mobile app ships are ported; the paths match
// src/services/ApiService.ts on the web exactly.
import { apiFetch } from "./ApiClient";
import type {
  ApiNotification,
  ClassroomAssignment,
  Contest,
  ContestProblemRow,
  CreateSubmissionResponse,
  CursorPaginatedResponse,
  ForumPost,
  ForumThread,
  GetContestsResponse,
  GetForumPostsResponse,
  GetForumThreadsResponse,
  GetLeaderboardResponse,
  GetNotificationsResponse,
  GetProblemDetailResponse,
  GetProblemsResponse,
  GetSubmissionsResponse,
  GetSubmissionDetailResponse,
  GetTranslationLanguagesResponse,
  LanguageRow,
  MyClassRow,
  StandingsResponse,
  TranslationProposalRow,
} from "../types/api";

// =================================
// Problems
// =================================

export const ProblemService = {
  getProblems: (
    filters: {
      search?: string;
      difficulty?: string;
      status?: string;
      tag?: string;
    } = {},
    page: { page?: number; pageSize?: number } = {},
  ) => {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.difficulty) params.set("difficulty", filters.difficulty);
    if (filters.status !== undefined) params.set("status", filters.status);
    if (filters.tag) params.set("tag", filters.tag);
    if (page.page !== undefined) params.set("page", String(page.page));
    if (page.pageSize !== undefined) params.set("page_size", String(page.pageSize));
    const qs = params.toString();
    return apiFetch<GetProblemsResponse>(`/problems/problems/${qs ? `?${qs}` : ""}`);
  },
  getProblemDetail: (id: number | string) =>
    apiFetch<GetProblemDetailResponse>(`/problems/problems/${id}/`),
  getBookmarkedIds: () => apiFetch<{ starred_ids: number[] }>("/problems/problems/bookmarked/"),
};

// =================================
// Submissions
// =================================

export const SubmissionService = {
  createSubmission: (submissionData: { problem: number; language: string; code: string }) =>
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

// =================================
// Leaderboard
// =================================

export const LeaderboardService = {
  getLeaderboard: (page: { page?: number; pageSize?: number } = {}) => {
    const params = new URLSearchParams();
    if (page.page !== undefined) params.set("page", String(page.page));
    if (page.pageSize !== undefined) params.set("page_size", String(page.pageSize));
    const qs = params.toString();
    return apiFetch<GetLeaderboardResponse>(`/leaderboard/${qs ? `?${qs}` : ""}`);
  },
};

// =================================
// Language registry (expanded picker + per-language limits)
// =================================

export const PublicService = {
  /** JDG-9: the public judge registry (14 languages, rate-limited per IP). */
  getLanguages: () =>
    apiFetch<{ notice: string; count: number; results: LanguageRow[] }>("/public/languages/"),
};

// =================================
// Forum (read + post)
// =================================

export const ForumService = {
  getThreads: (
    params: {
      page?: number;
      pageSize?: number;
      problemId?: number | string;
      lang?: string;
      topic?: string;
    } = {},
  ) => {
    const search = new URLSearchParams();
    if (params.page !== undefined) search.set("page", String(params.page));
    if (params.pageSize !== undefined) search.set("page_size", String(params.pageSize));
    if (params.problemId !== undefined) search.set("problem_id", String(params.problemId));
    if (params.lang) search.set("lang", params.lang);
    if (params.topic) search.set("topic", params.topic);
    const qs = search.toString();
    return apiFetch<GetForumThreadsResponse>(`/forum/threads/${qs ? `?${qs}` : ""}`);
  },
  getThread: (threadId: number | string) => apiFetch<ForumThread>(`/forum/threads/${threadId}/`),
  createThread: (data: { title: string; content: string; problem?: number | null }) =>
    apiFetch<ForumThread>("/forum/threads/", {
      method: "POST",
      body: JSON.stringify(data),
    }),
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
  createPost: (
    threadId: number | string,
    data: { content: string; parent?: number | null; isSpoiler?: boolean },
  ) =>
    apiFetch<ForumPost>(`/forum/threads/${threadId}/posts/`, {
      method: "POST",
      // The API speaks snake_case for the spoiler flag (COM-1).
      body: JSON.stringify({
        content: data.content,
        parent: data.parent ?? null,
        is_spoiler: data.isSpoiler ?? false,
      }),
    }),
};

// =================================
// Notifications
// =================================

export const NotificationService = {
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
  markRead: (id: number | string) =>
    apiFetch<ApiNotification>(`/notifications/${id}/mark-read/`, {
      method: "POST",
    }),
  markAllRead: () =>
    apiFetch<{ marked: number }>("/notifications/mark-all-read/", {
      method: "POST",
    }),
  getUnreadCount: () => apiFetch<{ count: number }>("/notifications/unread-count/"),
};

// =================================
// Contests (Wave B surfaces)
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
  getProblems: (id: number | string) =>
    apiFetch<ContestProblemRow[]>(`/contests/contests/${id}/problems/`),
  getStandings: (id: number | string, page = 1) =>
    apiFetch<StandingsResponse>(`/contests/contests/${id}/standings/?page=${page}`),
};

// =================================
// Classroom (Wave B surfaces — read + assignments)
// =================================

export const ClassroomService = {
  getMyClasses: () => apiFetch<{ results: MyClassRow[] }>("/classroom/classes/my-classes/"),
  getMyAssignments: () =>
    apiFetch<{ results: ClassroomAssignment[] }>("/classroom/assignments/my-assignments/"),
};

// =================================
// Community translations (i18n wave — the contribution entry point)
// =================================

export const TranslationsService = {
  getLanguages: () => apiFetch<GetTranslationLanguagesResponse>("/translations/languages/"),
  getMine: (params: { page?: number; pageSize?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.page !== undefined) search.set("page", String(params.page));
    if (params.pageSize !== undefined) search.set("page_size", String(params.pageSize));
    const qs = search.toString();
    return apiFetch<{ count: number; results: TranslationProposalRow[] }>(
      `/translations/proposals/mine/${qs ? `?${qs}` : ""}`,
    );
  },
  propose: (data: {
    problemId: number | string;
    language: string;
    title: string;
    statement: string;
  }) =>
    apiFetch<TranslationProposalRow>("/translations/proposals/", {
      method: "POST",
      body: JSON.stringify({
        problem: data.problemId,
        language: data.language,
        title: data.title,
        statement: data.statement,
      }),
    }),
};

// Re-export the pagination collectors for consumers that need full lists.
export { collectAllPages, collectAllCursorPages } from "./ApiClient";
export type { CursorPaginatedResponse };
