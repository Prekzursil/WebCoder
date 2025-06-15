const API_BASE_URL = 'http://127.0.0.1:8000/api/v1';

const apiFetch = async (url: string, options: RequestInit = {}) => {
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

  return response.json();
};

export const AuthService = {
    register: (userData: any) => apiFetch('/users/register/', { method: 'POST', body: JSON.stringify(userData) }),
    login: (credentials: any) => apiFetch('/auth/login/', { method: 'POST', body: JSON.stringify(credentials) }),
    getMe: () => apiFetch('/users/me/'),
    getUser: (userId: string) => apiFetch(`/users/${userId}/`),
    changePassword: (passwordData: any) => apiFetch('/users/password/change/', { method: 'POST', body: JSON.stringify(passwordData) }),
};

export const ProblemService = {
    getProblems: (filters: { status?: string, authorId?: number | string } = {}) => {
        const params = new URLSearchParams(filters as any).toString();
        return apiFetch(`/problems/problems/?${params}`);
    },
    getProblemDetail: (id: number | string) => apiFetch(`/problems/problems/${id}/`),
    createProblem: (problemData: any) => apiFetch('/problems/problems/', { method: 'POST', body: JSON.stringify(problemData) }),
    updateProblem: (id: number | string, problemData: any) => apiFetch(`/problems/problems/${id}/`, { method: 'PATCH', body: JSON.stringify(problemData) }),
    deleteProblem: (id: number | string) => apiFetch(`/problems/problems/${id}/`, { method: 'DELETE' }),
    
    submitForApproval: (id: number | string) => apiFetch(`/problems/problems/${id}/submit-for-approval/`, { method: 'POST' }),
    approveProblem: (id: number | string, feedbackData: { feedback?: string }) => apiFetch(`/problems/problems/${id}/approve/`, { method: 'POST', body: JSON.stringify(feedbackData) }),
    rejectProblem: (id: number | string, feedbackData: { feedback: string }) => apiFetch(`/problems/problems/${id}/reject/`, { method: 'POST', body: JSON.stringify(feedbackData) }),
    
    getTags: () => apiFetch('/problems/tags/'),
};

export const SubmissionService = {
    createSubmission: (submissionData: any) => apiFetch('/submissions/submit/', { method: 'POST', body: JSON.stringify(submissionData) }),
    getSubmissions: (filters: { problemId?: number, userId?: number } = {}) => {
        const params = new URLSearchParams(filters as any).toString();
        return apiFetch(`/submissions/submissions/?${params}`);
    },
    getSubmissionDetail: (id: number | string) => apiFetch(`/submissions/submissions/${id}/`),
};

export const TestCaseService = {
    createTestCase: (testCaseData: any) => apiFetch('/problems/testcases/', { method: 'POST', body: JSON.stringify(testCaseData) }),
    updateTestCase: (id: number | string, testCaseData: any) => apiFetch(`/problems/testcases/${id}/`, { method: 'PATCH', body: JSON.stringify(testCaseData) }),
    deleteTestCase: (id: number | string) => apiFetch(`/problems/testcases/${id}/`, { method: 'DELETE' }),
};

export const AdminService = {
    getUsers: () => apiFetch(`/users/admin/manage/`),
    updateUser: (userId: number | string, userData: { role?: string, is_active?: boolean }) => apiFetch(`/users/admin/manage/${userId}/`, { method: 'PATCH', body: JSON.stringify(userData) }),
    getStats: () => apiFetch('/users/admin/stats/'),
};
