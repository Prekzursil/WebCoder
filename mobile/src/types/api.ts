// Typed API contracts — a focused port of the web app's src/types/api.ts
// + src/types/index.ts shapes the mobile app consumes. Field names are
// kept IDENTICAL (snake_case, same envelopes) so the service layer is a
// faithful port of src/services/ApiService.ts.

// =================================
// Pagination envelopes (SPEC-GAPS B4)
// =================================

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface CursorPaginatedResponse<T> {
  next: string | null;
  previous: string | null;
  results: T[];
}

/** Extract the `cursor` query param from a DRF next/previous URL. */
export function cursorParamFromUrl(
  url: string | null | undefined
): string | null {
  if (!url) return null;
  try {
    return new URL(url).searchParams.get('cursor');
  } catch {
    return null;
  }
}

// =================================
// Users / auth
// =================================

export interface User {
  id: number;
  username: string;
  email: string;
  role:
    | 'BASIC'
    | 'CREATOR'
    | 'VERIFIER'
    | 'TEACHER'
    | 'ADMIN'
    | 'BASIC_USER'
    | 'PROBLEM_CREATOR'
    | 'PROBLEM_VERIFIER';
  two_factor_enabled?: boolean;
  two_factor_required?: boolean;
  county?: string;
  school?: string;
  is_minor?: boolean;
}

/** dj-rest-auth login body: `access` present, refresh cookie-only. */
export interface LoginResponse {
  access?: string;
  refresh?: string; // empty string server-side; the real token is in Set-Cookie
  user: User;
  access_expiration?: string;
}

export interface RegisterResponse {
  user: User;
  message: string;
}

// =================================
// Problems
// =================================

export interface TagType {
  id: number;
  name_i18n: Record<string, string>;
  slug: string;
}

export interface TranslationAttribution {
  language: string;
  contributor_username: string;
  reviewed_at: string | null;
}

export interface TestCaseType {
  id?: number;
  input_data: string;
  expected_output_data: string;
  is_sample: boolean;
  points: number;
  order?: number;
}

export interface ProblemType {
  id: number;
  title_i18n: Record<string, string>;
  difficulty: string;
  status: string;
  statement_i18n?: Record<string, string>;
  default_time_limit_ms?: number;
  default_memory_limit_kb?: number;
  test_cases?: TestCaseType[];
  allowed_languages?: string[];
  problem_type?: string;
  tag_ids?: number[];
  tags?: TagType[];
  author?: { id: number; username: string };
  hints_ro?: string[];
  hints_en?: string[];
  has_editorial?: boolean;
  editorial_locked?: boolean;
  difficulty_source?: string;
  /** Language-fair limits (J5): judge-resolved effective limits per language. */
  limit_overrides?: Record<string, { time_ms?: number; memory_kb?: number }>;
  effective_limits?: Record<string, { time_ms: number; memory_kb: number }>;
  /** Console vs file I/O (RO-4). */
  io_mode?: string;
  io_input_filename?: string;
  io_output_filename?: string;
  /** Wave E: partial-code problems — skeleton + locked regions. */
  code_template?: string;
  code_template_language?: string;
  translations?: TranslationAttribution[];
  block_config?: {
    engine?: 'blockly' | 'scratch';
    generator?: 'python3' | 'nodejs20';
    toolbox?: string;
    starter?: string;
    scratch_project?: string;
    scratch_blocks?: string[];
  };
  library_policy?: Record<
    string,
    {
      banned_stdlib?: string[];
      banned?: string[];
      allowed?: string[];
      banned_features?: string[];
    }
  >;
}

export type GetProblemsResponse = PaginatedResponse<ProblemType>;
export type GetProblemDetailResponse = ProblemType;
export type GetTagsResponse = PaginatedResponse<TagType>;

// =================================
// Submissions
// =================================

export interface SubmissionType {
  id: number;
  problem: { id: number; title_i18n: Record<string, string> };
  language: string;
  verdict: string;
  submission_time: string;
  score?: number | null;
}

export interface SubmissionTestResultType {
  id: number;
  test_case_details: {
    id: number;
    order?: number;
    is_sample: boolean;
    points: number;
  };
  verdict: string;
  execution_time_ms?: number | null;
  memory_used_kb?: number | null;
  actual_output?: string | null;
  error_output?: string | null;
}

export interface DetailedSubmissionType extends SubmissionType {
  code: string;
  detailed_feedback?: string;
  execution_time_ms?: number | null;
  memory_used_kb?: number | null;
  runtime_percentile?: number | null;
  user?: { username: string; id: number };
  test_results?: SubmissionTestResultType[];
}

export type CreateSubmissionResponse = DetailedSubmissionType;
export type GetSubmissionsResponse = CursorPaginatedResponse<SubmissionType>;
export type GetSubmissionDetailResponse = DetailedSubmissionType;

// =================================
// Leaderboard / ratings
// =================================

export interface LeaderboardEntry {
  rank: number;
  username: string;
  solved_count: number;
  total_points: number;
  success_rate: number;
  last_solved_at: string | null;
}

export type GetLeaderboardResponse = PaginatedResponse<LeaderboardEntry>;

// =================================
// Language registry (JDG-9 public judge docs)
// =================================

export interface LanguageRow {
  id: string;
  name: string;
  compile_command: string[];
  run_command: string[];
  /** Language-fair limits (J5): the judge's exact multipliers. */
  time_multiplier: number;
  memory_multiplier: number;
  memory_floor_kb: number;
  checker_capable: boolean;
}

// =================================
// Forum
// =================================

export interface ForumThread {
  id: number;
  title: string;
  problem: { id: number; title_i18n: Record<string, string> } | null;
  author: string | null;
  post_count: number;
  is_pinned: boolean;
  is_locked: boolean;
  last_activity: string;
  created_at: string;
}

export type GetForumThreadsResponse = PaginatedResponse<ForumThread>;

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
  is_spoiler: boolean;
  created_at: string;
}

export type GetForumPostsResponse = CursorPaginatedResponse<ForumPost>;

// =================================
// Notifications
// =================================

export type NotificationVerb =
  | 'submission_verdict'
  | 'problem_approved'
  | 'problem_rejected'
  | 'forum_reply'
  | 'thread_created'
  | string;

export interface ApiNotification {
  id: number;
  verb: NotificationVerb;
  actor: string | null;
  target_type: string | null;
  target_id: number | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export type GetNotificationsResponse = CursorPaginatedResponse<ApiNotification>;

// =================================
// Contests (Wave B CON-1..10)
// =================================

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

// =================================
// Classroom (Wave B EDU)
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

// =================================
// Community translations (i18n wave)
// =================================

export interface TranslationLanguageEntry {
  code: string;
  endonym: string;
  english: string;
}

export interface GetTranslationLanguagesResponse {
  results: TranslationLanguageEntry[];
}

export interface TranslationProposalRow {
  id: number;
  problem_id: number;
  problem_title_en: string;
  language: string;
  language_name: string;
  title: string;
  statement: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  contributor_username: string;
  reviewer_username: string | null;
  review_note: string;
  reviewed_at: string | null;
  ai_verdict: '' | 'approve' | 'flag' | 'error';
  ai_confidence: number | null;
  ai_notes: string;
  created_at: string;
  updated_at: string;
}

export type GetTranslationProposalsResponse =
  PaginatedResponse<TranslationProposalRow>;
