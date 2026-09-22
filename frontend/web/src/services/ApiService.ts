// Ported from frontend/webcoder_ui/src/services/ApiService.ts (CRA reference).
// Next.js adaptation: the API base URL comes from NEXT_PUBLIC_API_BASE
// (default http://localhost:8000). The /api/v1 prefix is preserved from the
// reference — every endpoint path below is relative to it.

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

const apiFetch = async <T>(url: string, options: RequestInit = {}): Promise<T> => {
  const token = localStorage.getItem('accessToken');
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers,
  });

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
    getSubmissions: (filters: { problemId?: number, userId?: number } = {}) => {
        const params = new URLSearchParams();
        if (filters.problemId !== undefined) params.set('problemId', String(filters.problemId));
        if (filters.userId !== undefined) params.set('userId', String(filters.userId));
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
