import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  AuthService,
  ProblemService,
  SubmissionService,
  TestCaseService,
  AdminService,
  LeaderboardService,
  ForumService,
  NotificationService,
  collectAllPages,
  collectAllCursorPages,
} from './ApiService';
import { cursorParamFromUrl } from '@/types/api';

// Endpoint matrix for the service layer: every exported method's route,
// HTTP verb and serialized body, plus the apiFetch branches not exercised by
// the refresh-flow tests in ApiService.test.ts (invalid-JSON error bodies,
// credential mode, the NEXT_PUBLIC_API_BASE override). All responses are
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
    await ProblemService.getProblems(); // no filters -> no query string
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/problems/problems/`);
    fetchMock.mockClear();
    await ProblemService.getProblems({ status: 'PENDING' }); // status only
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/problems/problems/?status=PENDING`);
    fetchMock.mockClear();
    await ProblemService.getProblems({ authorId: 9 }); // authorId only (number)
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/problems/problems/?authorId=9`);
    fetchMock.mockClear();
    await ProblemService.getProblems({ status: 'APPROVED', authorId: 'me' }); // both, string id
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/problems/problems/?status=APPROVED&authorId=me`);
    fetchMock.mockClear();
    // pagination params (SPEC-GAPS B4)
    await ProblemService.getProblems({}, { page: 2, pageSize: 100 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/problems/problems/?page=2&page_size=100`);
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

  it('getTags GETs /problems/tags/ with pagination params', async () => {
    fetchMock.mockImplementation(okJson([]));
    await ProblemService.getTags();
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/problems/tags/`);
    fetchMock.mockClear();
    await ProblemService.getTags({ page: 3, pageSize: 50 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/problems/tags/?page=3&page_size=50`);
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
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/submissions/submissions/`);
    fetchMock.mockClear();
    await SubmissionService.getSubmissions({ problemId: 2 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/submissions/submissions/?problemId=2`);
    fetchMock.mockClear();
    await SubmissionService.getSubmissions({ userId: 8 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/submissions/submissions/?userId=8`);
    fetchMock.mockClear();
    await SubmissionService.getSubmissions({ problemId: 2, userId: 8 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/submissions/submissions/?problemId=2&userId=8`);
    fetchMock.mockClear();
    // cursor pagination params (SPEC-GAPS B4)
    await SubmissionService.getSubmissions({}, { cursor: 'cj0x', pageSize: 25 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/submissions/submissions/?cursor=cj0x&page_size=25`);
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

describe('LeaderboardService endpoints', () => {
  it('lists standings with page params and GETs the me card', async () => {
    fetchMock.mockImplementation(okJson({ count: 0, next: null, previous: null, results: [] }));
    await LeaderboardService.getLeaderboard();
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/leaderboard/`);
    fetchMock.mockClear();
    await LeaderboardService.getLeaderboard({ page: 2, pageSize: 50 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/leaderboard/?page=2&page_size=50`);
    fetchMock.mockClear();
    await LeaderboardService.getMyEntry();
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/leaderboard/me/`);
    expect(fetchMock.mock.calls[0][1]?.method).toBeUndefined(); // GET
  });
});

describe('ForumService endpoints', () => {
  it('lists threads with page/problem params', async () => {
    fetchMock.mockImplementation(okJson({ count: 0, next: null, previous: null, results: [] }));
    await ForumService.getThreads({ page: 2, pageSize: 20, problemId: 7 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/forum/threads/?page=2&page_size=20&problem_id=7`);
  });

  it('retrieves and creates threads', async () => {
    fetchMock.mockImplementation(okJson({}));
    await ForumService.getThread(5);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/forum/threads/5/`);
    fetchMock.mockClear();
    await ForumService.createThread({ title: 'T', content: 'C', problem: 3 });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/forum/threads/`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ title: 'T', content: 'C', problem: 3 }) })
    );
  });

  it('lists posts with cursor params and replies to a thread', async () => {
    fetchMock.mockImplementation(okJson({ next: null, previous: null, results: [] }));
    await ForumService.getPosts(9, { cursor: 'abc', pageSize: 25 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/forum/threads/9/posts/?cursor=abc&page_size=25`);
    fetchMock.mockClear();
    await ForumService.createPost(9, { content: 'reply' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/forum/threads/9/posts/`,
      // COM-1: is_spoiler rides every reply payload (false default).
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ content: 'reply', is_spoiler: false }) })
    );
  });

  it('votes, updates and reports posts', async () => {
    fetchMock.mockImplementation(okJson({}));
    await ForumService.votePost(11, 0);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/forum/posts/11/vote/`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ value: 0 }) })
    );
    fetchMock.mockClear();
    await ForumService.updatePost(11, { content: 'edited' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/forum/posts/11/`,
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ content: 'edited' }) })
    );
    fetchMock.mockClear();
    await ForumService.reportPost(11, { reason: 'spam' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/forum/reports/`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ post: 11, reason: 'spam' }) })
    );
  });
});

describe('NotificationService endpoints', () => {
  it('lists with unread/cursor params, marks read, counts unread', async () => {
    fetchMock.mockImplementation(okJson({ next: null, previous: null, results: [] }));
    await NotificationService.getNotifications({ unreadOnly: true, pageSize: 25 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/notifications/?unread=true&page_size=25`);
    fetchMock.mockClear();
    await NotificationService.getNotifications({ cursor: 'cur' });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/notifications/?cursor=cur`);
    fetchMock.mockClear();
    await NotificationService.markRead(4);
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/notifications/4/mark-read/`, expect.objectContaining({ method: 'POST' }));
    fetchMock.mockClear();
    await NotificationService.markAllRead();
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/notifications/mark-all-read/`, expect.objectContaining({ method: 'POST' }));
    fetchMock.mockClear();
    await NotificationService.getUnreadCount();
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/notifications/unread-count/`);
  });
});

describe('pagination helpers', () => {
  it('collectAllPages follows next links and stops when exhausted', async () => {
    const pages = [
      { count: 3, next: `${BASE}/x/?page=2`, previous: null, results: [1, 2] },
      { count: 3, next: null, previous: null, results: [3] },
    ];
    const fetchPage = vi.fn(async (page: number) => pages[page - 1]);
    const out = await collectAllPages(fetchPage);
    expect(out).toEqual([1, 2, 3]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('collectAllPages stops at the COLLECT_ALL_MAX_PAGES ceiling', async () => {
    // next never resolves to null -> the loop must stop at 50 pages.
    const fetchPage = vi.fn(async () => ({ count: 1, next: 'http://x/?page=2', previous: null, results: [1] }));
    const out = await collectAllPages(fetchPage);
    expect(out).toHaveLength(50);
    expect(fetchPage).toHaveBeenCalledTimes(50);
  });

  it('collectAllCursorPages extracts the cursor from absolute next URLs', async () => {
    const pages = [
      { next: `${BASE}/submissions/submissions/?cursor=cj0x`, previous: null, results: ['a'] },
      { next: null, previous: null, results: ['b'] },
    ];
    const fetchPage = vi.fn(async (cursor: string | null) => (cursor === null ? pages[0] : pages[1]));
    const out = await collectAllCursorPages(fetchPage);
    expect(out).toEqual(['a', 'b']);
    expect(fetchPage).toHaveBeenNthCalledWith(1, null);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 'cj0x');
  });

  it('cursorParamFromUrl returns null for missing or malformed URLs', () => {
    expect(cursorParamFromUrl(null)).toBeNull();
    expect(cursorParamFromUrl(undefined)).toBeNull();
    expect(cursorParamFromUrl('not-a-url')).toBeNull();
  });
});

describe('apiFetch error branches not covered by the refresh tests', () => {
  it('falls back to statusText when the error body is not JSON', async () => {
    fetchMock.mockImplementation(() => new Response('<html>boom</html>', { status: 502, statusText: 'Bad Gateway' }));
    await expect(ProblemService.getTags()).rejects.toThrow('Bad Gateway');
  });

  it('sends cookie credentials and no auth headers on plain GETs [SP1]', async () => {
    fetchMock.mockImplementation(okJson({}));
    await ProblemService.getTags();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Headers;
    expect(init.credentials).toBe('include');
    expect(headers.get('Authorization')).toBeNull(); // cookie auth, not Bearer
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
