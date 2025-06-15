// This file contains TypeScript types for API requests and responses.

import { AdminUserType, DetailedSubmissionType, ProblemType, SubmissionType, TagType, TestCaseType, User } from ".";

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

export type GetProblemsResponse = ProblemType[];
export type GetProblemDetailResponse = ProblemType;
export type CreateProblemResponse = ProblemType;
export type UpdateProblemResponse = ProblemType;
export type GetTagsResponse = TagType[];

// =================================
// Submission Service
// =================================

export type CreateSubmissionResponse = DetailedSubmissionType;
export type GetSubmissionsResponse = SubmissionType[];
export type GetSubmissionDetailResponse = DetailedSubmissionType;

// =================================
// TestCase Service
// =================================

export type CreateTestCaseResponse = TestCaseType;

// =================================
// Admin Service
// =================================

export type GetAdminUsersResponse = AdminUserType[];

export interface AdminStatsResponse {
    user_count: number;
    problem_count: number;
    submission_count: number;
}
