import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  AuthService,
  ProblemService,
  SubmissionService,
  TestCaseService,
  AdminService,
} from './ApiService';

// Endpoint matrix for the service layer: every exported method's route,
// HTTP verb and serialized body, plus the apiFetch branches not exercised by
// the refresh-flow tests in ApiService.test.ts (invalid-JSON error bodies,
// the Bearer header, the NEXT_PUBLIC_API_BASE override). All responses are
// 200/2xx so the refresh wrapper is a pass-through. Mocks use per-call
// factories: a single shared Response object cannot have its body read twice.

const fetchMock = vi.fn();

function jsonResponse(body: unknown, init: { status?: number; statusText?: string } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    statusText: init.statusText ?? '',
  });
}

function okJson(body: unknown) {
  return () => jsonResponse(body);
}

const BASE = 'http://localhost:8000/api/v1';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AuthService endpoints', () => {
  it('register POSTs to /users/register/', async () => {
    fetchMock.mockImplementation(okJson({ id: 1 }));
    await AuthService.register({ username: 'u', password: 'p', email: 'e@x.com' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/users/register/`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'u', password: 'p', email: 'e@x.com' }),
      })
    );
  });

  it('login POSTs to /auth/login/', async () => {
    fetchMock.mockImplementation(okJson({ access: 'a', refresh: 'r' }));
    await AuthService.login({ username: 'u', password: 'p' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/auth/login/`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ username: 'u', password: 'p' }) })
    );
  });

  it('getMe GETs /users/me/', async () => {
    fetchMock.mockImplementation(okJson({ id: 1 }));
    await AuthService.getMe();
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/users/me/`);
    expect(fetchMock.mock.calls[0][1].method).toBeUndefined();
  });

  it('getUser GETs /users/:id/', async () => {
    fetchMock.mockImplementation(okJson({ id: 5 }));
    await AuthService.getUser(5);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/users/5/`);
  });

  it('changePassword POSTs to /users/password/change/', async () => {
    fetchMock.mockImplementation(okJson({ detail: 'done' }));
    await AuthService.changePassword({ old_password: 'a', new_password: 'b' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/users/password/change/`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ old_password: 'a', new_password: 'b' }) })
    );
  });
});

describe('ProblemService endpoints', () => {
  it('getProblems serializes every filter combination into the query string', async () => {
    fetchMock.mockImplementation(okJson([]));
    await ProblemService.getProblems(); // no filters -> empty params
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/problems/problems/?`);
    fetchMock.mockClear();
    await ProblemService.getProblems({ status: 'PENDING' }); // status only
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/problems/problems/?status=PENDING`);
    fetchMock.mockClear();
    await ProblemService.getProblems({ authorId: 9 }); // authorId only (number)
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/problems/problems/?authorId=9`);
    fetchMock.mockClear();
    await ProblemService.getProblems({ status: 'APPROVED', authorId: 'me' }); // both, string id
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/problems/problems/?status=APPROVED&authorId=me`);
  });

  it('getProblemDetail GETs the detail route', async () => {
    fetchMock.mockImplementation(okJson({ id: 3 }));
    await ProblemService.getProblemDetail(3);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/problems/problems/3/`);
  });

  it('createProblem POSTs the payload', async () => {
    fetchMock.mockImplementation(okJson({ id: 3 }));
    await ProblemService.createProblem({ title_i18n: { en: 'x' } });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/problems/problems/`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ title_i18n: { en: 'x' } }) })
    );
  });

  it('updateProblem PATCHes and deleteProblem DELETEs', async () => {
    fetchMock.mockImplementation(okJson({ id: 3 }));
    await ProblemService.updateProblem(3, { difficulty: 'HARD' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/problems/problems/3/`,
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ difficulty: 'HARD' }) })
    );
    fetchMock.mockClear();
    fetchMock.mockImplementation(() => new Response(null, { status: 204 }));
    await ProblemService.deleteProblem(3);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/problems/problems/3/`,
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('submitForApproval, approveProblem and rejectProblem POST their routes', async () => {
    fetchMock.mockImplementation(okJson({ id: 4 }));
    await ProblemService.submitForApproval(4);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/problems/problems/4/submit-for-approval/`,
      expect.objectContaining({ method: 'POST' })
    );
    fetchMock.mockClear();
    await ProblemService.approveProblem(4, { feedback: 'ok' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/problems/problems/4/approve/`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ feedback: 'ok' }) })
    );
    fetchMock.mockClear();
    await ProblemService.rejectProblem(4, { feedback: 'unclear statement' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/problems/problems/4/reject/`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ feedback: 'unclear statement' }) })
    );
  });

  it('getTags GETs /problems/tags/', async () => {
    fetchMock.mockImplementation(okJson([]));
    await ProblemService.getTags();
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/problems/tags/`);
  });
});

describe('SubmissionService endpoints', () => {
  it('createSubmission POSTs to /submissions/submit/', async () => {
    fetchMock.mockImplementation(okJson({ id: 11 }));
    await SubmissionService.createSubmission({ problem_id: 1, code: 'print(1)' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/submissions/submit/`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ problem_id: 1, code: 'print(1)' }) })
    );
  });

  it('getSubmissions serializes problemId/userId filters', async () => {
    fetchMock.mockImplementation(okJson([]));
    await SubmissionService.getSubmissions();
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/submissions/submissions/?`);
    fetchMock.mockClear();
    await SubmissionService.getSubmissions({ problemId: 2 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/submissions/submissions/?problemId=2`);
    fetchMock.mockClear();
    await SubmissionService.getSubmissions({ userId: 8 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/submissions/submissions/?userId=8`);
    fetchMock.mockClear();
    await SubmissionService.getSubmissions({ problemId: 2, userId: 8 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/submissions/submissions/?problemId=2&userId=8`);
  });

  it('getSubmissionDetail GETs the detail route', async () => {
    fetchMock.mockImplementation(okJson({ id: 12 }));
    await SubmissionService.getSubmissionDetail(12);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/submissions/submissions/12/`);
  });
});

describe('TestCaseService endpoints', () => {
  it('creates, patches and deletes test cases', async () => {
    fetchMock.mockImplementation(okJson({ id: 1 }));
    await TestCaseService.createTestCase({ input_data: 'in', expected_output_data: 'out', is_sample: true, points: 10 });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/problems/testcases/`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ input_data: 'in', expected_output_data: 'out', is_sample: true, points: 10 }),
      })
    );
    fetchMock.mockClear();
    await TestCaseService.updateTestCase(1, { points: 20 });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/problems/testcases/1/`,
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ points: 20 }) })
    );
    fetchMock.mockClear();
    fetchMock.mockImplementation(() => new Response(null, { status: 204 }));
    await TestCaseService.deleteTestCase(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/problems/testcases/1/`,
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});

describe('AdminService endpoints', () => {
  it('lists users, patches a user and GETs stats', async () => {
    fetchMock.mockImplementation(okJson([]));
    await AdminService.getUsers();
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/users/admin/manage/`);
    fetchMock.mockClear();
    await AdminService.updateUser(6, { role: 'ADMIN', is_active: false });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/users/admin/manage/6/`,
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ role: 'ADMIN', is_active: false }) })
    );
    fetchMock.mockClear();
    await AdminService.getStats();
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/users/admin/stats/`);
  });
});

describe('apiFetch error branches not covered by the refresh tests', () => {
  it('falls back to statusText when the error body is not JSON', async () => {
    fetchMock.mockImplementation(() => new Response('<html>boom</html>', { status: 502, statusText: 'Bad Gateway' }));
    await expect(ProblemService.getTags()).rejects.toThrow('Bad Gateway');
  });

  it('attaches the stored access token as a Bearer header', async () => {
    localStorage.setItem('accessToken', 'jwt-123');
    fetchMock.mockImplementation(okJson({}));
    await ProblemService.getTags();
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer jwt-123');
    expect(headers.get('Content-Type')).toBeNull(); // no body
  });
});

describe('API base URL', () => {
  it('prefers NEXT_PUBLIC_API_BASE when set at module load', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_API_BASE', 'https://api.example.com');
    const mod = await import('./ApiService');
    const scopedMock = vi.fn().mockImplementation(okJson([]));
    vi.stubGlobal('fetch', scopedMock);
    await mod.ProblemService.getTags();
    expect(scopedMock.mock.calls[0][0]).toBe('https://api.example.com/api/v1/problems/tags/');
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
