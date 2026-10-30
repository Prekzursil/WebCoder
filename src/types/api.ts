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

// [SP1] cookie auth: the login response carries the user profile; the
// JWTs live in httpOnly cookies the browser attaches automatically. The
// access token stays in the body during the migration window but is no
// longer consumed.
export interface LoginResponse {
    access?: string;
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
    /** COM-1: solution-revealing reply (problem-scoped threads only). */
    is_spoiler: boolean;
    created_at: string;
}

export type GetForumPostsResponse = CursorPaginatedResponse<ForumPost>;

/** COM-4: one row of the viewer's follow list. */
/** JDG-13 v1: one structured solution row (the diff-view data). */
export interface AssignmentSolutionRow {
    id: number;
    username: string;
    problem_id: number;
    verdict: string;
    score: number;
    language: string;
    submission_time: string;
    code: string;
}

export interface AssignmentSolutionsResponse {
    count: number;
    results: AssignmentSolutionRow[];
}

/** JDG-9: one registry row from /public/languages/. */
export interface LanguageRow {
    id: string;
    name: string;
    compile_command: string[];
    run_command: string[];
}

/** RAT-7: per-tag skill row + the practice-next suggestion. */
export interface TagSkillRow {
    tag: string;
    solved: number;
    attempted: number;
    covered: boolean;
    points: number;
}

export interface PracticeNextRow {
    id: number;
    title_i18n: Record<string, string>;
    difficulty: string | null;
    tags: string[];
}

export interface TagProfile {
    tags: TagSkillRow[];
    practice_next: PracticeNextRow[];
}

export interface FollowingRow {
    id: number;
    username: string;
}

export interface FollowingResponse {
    count: number;
    results: FollowingRow[];
}

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

// =================================
// Contest engine (backend contests app, Wave B CON-1..10)
// =================================

/** Per-locale text ({ en, ro }). */
export type LocalizedText = Record<string, string>;

export interface Contest {
    id: number;
    title_i18n: LocalizedText;
    description_i18n: LocalizedText;
    visibility: 'PUBLIC' | 'PRIVATE';
    is_rated: boolean;
    format: 'IOI' | 'ICPC' | 'ATCODER';
    start_at: string;
    end_at: string;
    freeze_at: string | null;
    is_window: boolean;
    per_user_duration_minutes: number;
    pretest_mode: boolean;
    rated_rating_min: number | null;
    rated_rating_max: number | null;
    created_by: number;
    created_by_username: string;
    // OPS-7 (Wave D, groundwork): display-only sponsor attribution.
    sponsor_name?: string;
    sponsor_logo_url?: string;
    state: 'UPCOMING' | 'RUNNING' | 'FINISHED';
    problem_count: number;
    participant_count: number;
    contest_problems?: ContestProblemRow[];
    my_participation?: {
        virtual_start: string | null;
        effective_start: string;
        effective_end: string;
        is_virtual: boolean;
        is_disqualified: boolean;
    } | null;
    can_manage?: boolean;
}

export type GetContestsResponse = PaginatedResponse<Contest>;

export interface ContestProblemRow {
    id: number;
    problem: number;
    problem_title: LocalizedText;
    problem_difficulty: string;
    order: number;
    label: string;
    points: number;
}

export interface StandingsProblemCell {
    label: string;
    points_max: number;
    best: number;
    attempts: number;
    wrong: number;
    first_ac_at: string | null;
    last_improvement: string | null;
}

export interface StandingsRow {
    rank: number;
    user: { id: number; username: string };
    score: number;
    solved: number;
    penalty_minutes: number | null;
    problems: StandingsProblemCell[];
}

export interface StandingsResponse extends PaginatedResponse<StandingsRow> {
    format: string;
    frozen: boolean;
    section?: 'official' | 'virtual';
}

export interface ContestAwardRow {
    rank: number;
    medal: 'GOLD' | 'SILVER' | 'BRONZE';
    user: { id: number; username: string };
}

export interface ContestAwardsResponse {
    count: number;
    results: ContestAwardRow[];
}

export interface Clarification {
    id: number;
    contest: number;
    problem_id: number | null;
    asker_username: string;
    question: string;
    answer: string | null;
    answered_by_username: string | null;
    answered_at: string | null;
    is_broadcast: boolean;
    is_hidden: boolean;
    created_at: string;
}

export interface RatingBand {
    min: number;
    name_en: string;
    name_ro: string;
    color: string;
}

export interface RatingLadderRow {
    user: { id: number; username: string };
    rating: number;
    internal_rating: number;
    rd: number;
    contests_count: number;
    band: RatingBand;
}

export interface RatingChangeRow {
    rank: number;
    username: string;
    rating_before: number;
    rating_after: number;
    delta: number;
    display_rating: number;
    band: RatingBand;
}

export interface MyRating {
    rated: boolean;
    rating: number | null;
    internal_rating?: number;
    rd?: number;
    contests_count?: number;
    band: RatingBand;
}

// =================================
// Classroom (backend classroom app, Wave B EDU-1/2/3/5/6)
// =================================

export interface ClassRoom {
    id: number;
    name: string;
    school: string;
    join_code?: string;
    is_open: boolean;
    created_at: string;
    teacher_username: string;
    member_count: number;
    assignment_count: number;
    is_owner: boolean;
}

export interface ClassMembershipRow {
    id: number;
    username: string;
    joined_at: string;
}

export interface MyClassRow {
    membership_id: number;
    joined_at: string;
    classroom: ClassRoom;
    open_assignments: number;
}

export interface ClassroomAssignment {
    id: number;
    classroom: number;
    classroom_name: string;
    title_i18n: LocalizedText;
    description: string;
    available_from: string;
    due_at: string;
    late_until: string | null;
    is_exam: boolean;
    kind: 'PROBLEMS' | 'QUIZ' | 'FILES';
    quiz_shuffle: boolean;
    file_extensions: string;
    max_file_mb: number;
    state: 'SCHEDULED' | 'OPEN' | 'CLOSED';
    solved_count?: number;
    assignment_problems?: {
        id: number;
        problem: number;
        problem_title: LocalizedText;
        problem_difficulty: string;
        order: number;
        label: string;
        points: number;
    }[];
}

export interface GridCell {
    best_score: number;
    attempts: number;
    last_attempt_at: string;
    verdict: string;
    late: boolean;
}

export interface AssignmentGrid {
    assignment_id: number;
    students: { id: number; username: string }[];
    problems: {
        id: number;
        problem_id: number;
        label: string;
        points: number;
        title_i18n: LocalizedText;
    }[];
    cells: Record<string, GridCell>;
}

export interface MCQItemRow {
    id: number;
    discipline: string;
    grade: number;
    chapter: number | null;
    question_i18n: LocalizedText;
    variants_ro: string[];
    variants_en: string[];
    correct_index: number;
    source: string;
    bac_year: number | null;
}

export interface QuizSheetItem {
    item_id: number;
    order: number;
    question_i18n: LocalizedText;
    variants_en: string[];
    variants_ro: string[];
    correct_index: number | null;
}

export interface QuizSheet {
    assignment: number;
    kind: 'QUIZ';
    shuffle: boolean;
    state: string;
    items: QuizSheetItem[];
}

export interface QuizSubmitResult {
    id: number;
    score: number;
    correct_count: number;
    total_count: number;
    submitted_at: string;
}

export interface DeliverableRow {
    id: number;
    student: { id: number; username: string };
    original_filename: string;
    file: string;
    uploaded_at: string;
}

export interface ExamModeStatus {
    active: boolean;
    assignment: {
        id: number;
        title_i18n: LocalizedText;
        classroom: string;
        due_at: string;
    } | null;
}

export interface CommunityEditorialRow {
    id: number;
    problem: number;
    author: number;
    author_username: string;
    title: string;
    body: string;
    lang: 'ro' | 'en';
    status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
    verifier_feedback: string;
    is_hidden: boolean;
    license: string;
    created_at: string;
    updated_at: string;
}

export interface ArticleRow {
    id: number;
    title_i18n: LocalizedText;
    body_ro: string;
    body_en: string;
    tags: { slug: string }[];
    author: number;
    author_username: string;
    status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
    verifier_feedback: string;
    is_hidden: boolean;
    license: string;
    created_at: string;
    updated_at: string;
}

export interface FeedRow {
    id: number;
    user: string;
    problem: { id: number; title_i18n: LocalizedText };
    language: string;
    verdict: string;
    score: number | null;
    submission_time: string;
}

export interface FeedResponse {
    count: number;
    page: number;
    results: FeedRow[];
    next: number | null;
}

export interface SolutionRow {
    id: number;
    user: string;
    language: string;
    code: string;
    execution_time_ms: number | null;
    memory_used_kb: number | null;
    submission_time: string;
}

export interface SolutionsResponse {
    count: number;
    license: string;
    results: SolutionRow[];
}

export interface HonorResponse {
    honor: number;
    breakdown: Record<string, number>;
    weights: Record<string, number>;
    username: string;
}

export interface WeeklyBoardRow {
    rank: number;
    user_id: number;
    username: string;
    solved: number;
    points: number;
}
