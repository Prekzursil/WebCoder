// This file contains TypeScript types for API requests and responses.
// Ported from frontend/webcoder_ui/src/types/api.ts (CRA reference), then
// extended for the paginated backend (SPEC-GAPS B4) and the forum /
// leaderboard / notifications endpoints (backend wave PRs #184-#189).

import { AdminUserType, DetailedSubmissionType, ProblemType, SubmissionType, TagType, TestCaseType, User } from ".";

// =================================
// Pagination envelopes (SPEC-GAPS B4)
// =================================

/**
 * Page-number pagination (backend webcoder_api/pagination.py
 * StandardPageNumberPagination): problems, tags, testcases, users,
 * forum threads, leaderboard. `next`/`previous` are absolute URLs or null.
 */
export interface PaginatedResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

/**
 * Cursor pagination (backend NewestFirstCursorPagination): submissions,
 * notifications, forum posts — newest-first feeds where rows drift across
 * page-number pages. No `count` by design.
 */
export interface CursorPaginatedResponse<T> {
    next: string | null;
    previous: string | null;
    results: T[];
}

/** Extract the `cursor` query param from a DRF next/previous URL. */
export function cursorParamFromUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
        return new URL(url).searchParams.get('cursor');
    } catch {
        return null;
    }
}

// =================================
// Auth Service
// =================================

export interface LoginResponse {
    access: string;
    refresh: string;
    user: User;
}

export interface RegisterResponse {
    user: User;
    message: string;
}

// =================================
// Problem Service
// =================================

export type GetProblemsResponse = PaginatedResponse<ProblemType>;
export type GetProblemDetailResponse = ProblemType;
export type CreateProblemResponse = ProblemType;
export type UpdateProblemResponse = ProblemType;
export type GetTagsResponse = PaginatedResponse<TagType>;

// =================================
// Submission Service
// =================================

export type CreateSubmissionResponse = DetailedSubmissionType;
export type GetSubmissionsResponse = CursorPaginatedResponse<SubmissionType>;
export type GetSubmissionDetailResponse = DetailedSubmissionType;

// =================================
// TestCase Service
// =================================

export type CreateTestCaseResponse = TestCaseType;

// =================================
// Admin Service
// =================================

export type GetAdminUsersResponse = PaginatedResponse<AdminUserType>;

export interface AdminStatsResponse {
    user_count: number;
    problem_count: number;
    submission_count: number;
}

// =================================
// Leaderboard Service (backend leaderboard app)
// =================================

/** Row of GET /api/v1/leaderboard/ (window-ranked, 50/page). */
export interface LeaderboardEntry {
    rank: number;
    username: string;
    solved_count: number;
    total_points: number;
    /** AC submissions / total submissions over APPROVED problems, 0..1 (4 dp). */
    success_rate: number;
    last_solved_at: string | null;
}

export type GetLeaderboardResponse = PaginatedResponse<LeaderboardEntry>;

/** Shape of GET /api/v1/leaderboard/me/ (the caller's own rank + stats). */
export interface MyLeaderboardEntry {
    rank: number;
    username: string;
    solved_count: number;
    total_points: number;
    success_rate: number;
    total_submissions: number;
    ac_submissions: number;
    last_solved_at: string | null;
}

// =================================
// Forum Service (backend forum app)
// =================================

/** Thread as returned by list/create/retrieve (ThreadListSerializer). */
export interface ForumThread {
    id: number;
    title: string;
    /** Linked problem (null = global thread). */
    problem: { id: number; title_i18n: Record<string, string> } | null;
    author: string | null;
    post_count: number;
    is_pinned: boolean;
    is_locked: boolean;
    last_activity: string;
    created_at: string;
}

export type GetForumThreadsResponse = PaginatedResponse<ForumThread>;

/** Post as returned by list/create/retrieve (PostSerializer). */
export interface ForumPost {
    id: number;
    thread_id: number;
    author: string | null;
    content: string;
    parent_id: number | null;
    is_edited: boolean;
    upvotes: number;
    is_hidden: boolean;
    hidden_reason: string;
    created_at: string;
}

export type GetForumPostsResponse = CursorPaginatedResponse<ForumPost>;

/** Report as returned by the report endpoints (ReportSerializer). */
export interface ForumReport {
    id: number;
    post_id: number;
    reporter: string | null;
    reason: string;
    details: string;
    status: string;
    resolution_note: string;
    resolved_by: string | null;
    created_at: string;
}

// =================================
// Notification Service (backend notifications app)
// =================================

export type NotificationVerb =
    | 'SUBMISSION_JUDGED'
    | 'THREAD_REPLY'
    | 'PROBLEM_APPROVED'
    | 'PROBLEM_REJECTED'
    | 'SYSTEM';

/** Notification as returned by the list/mark-read endpoints. */
export interface ApiNotification {
    id: number;
    verb: NotificationVerb;
    actor: string | null;
    /** ContentType model of the target, e.g. 'submission' | 'thread' | 'problem'. */
    target_type: string | null;
    target_id: number | null;
    /** Verb-specific payload: verdict, problem_id, submission_id, feedback, title, post_id. */
    data: Record<string, unknown>;
    /** null = unread. */
    read_at: string | null;
    created_at: string;
}

export type GetNotificationsResponse = CursorPaginatedResponse<ApiNotification>;
