import {
  AuthService,
  ProblemService,
  SubmissionService,
  TestCaseService,
  AdminService,
} from './ApiService';

const BASE = 'http://127.0.0.1:8000/api/v1';

const mockFetch = (impl: jest.Mock): void => {
  global.fetch = impl as unknown as typeof fetch;
};

const okResponse = (data: unknown): Response =>
  ({ ok: true, json: jest.fn().mockResolvedValue(data) }) as unknown as Response;

describe('ApiService apiFetch behaviour', () => {
  afterEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it('GET without a token sends no Authorization or Content-Type header', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse({ id: 1 }));
    mockFetch(fetchMock);

    const result = await AuthService.getMe();

    expect(result).toEqual({ id: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/users/me/`);
    const headers = init.headers as Headers;
    expect(headers.get('Authorization')).toBeNull();
    expect(headers.get('Content-Type')).toBeNull();
  });

  it('attaches a Bearer token when one is stored', async () => {
    localStorage.setItem('accessToken', 'secret-token');
    const fetchMock = jest.fn().mockResolvedValue(okResponse({}));
    mockFetch(fetchMock);

    await AuthService.getMe();

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer secret-token');
  });

  it('sets Content-Type and serialises the body for POST requests', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse({ ok: 1 }));
    mockFetch(fetchMock);

    await AuthService.login({ username: 'u', password: 'p' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/auth/login/`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ username: 'u', password: 'p' }));
    expect((init.headers as Headers).get('Content-Type')).toBe('application/json');
  });

  it('throws the API detail message when the response is not ok', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      statusText: 'Bad Request',
      json: jest.fn().mockResolvedValue({ detail: 'Invalid credentials' }),
    });
    mockFetch(fetchMock);

    await expect(AuthService.getMe()).rejects.toThrow('Invalid credentials');
  });

  it('falls back to statusText when the error body has no detail', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      statusText: 'Server Error',
      json: jest.fn().mockResolvedValue({}),
    });
    mockFetch(fetchMock);

    await expect(AuthService.getMe()).rejects.toThrow('Server Error');
  });

  it('falls back to statusText when the error body is not valid JSON', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      statusText: 'Teapot',
      json: jest.fn().mockRejectedValue(new Error('not json')),
    });
    mockFetch(fetchMock);

    await expect(AuthService.getMe()).rejects.toThrow('Teapot');
  });
});

describe('AuthService endpoints', () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(okResponse({}));
    mockFetch(fetchMock);
  });
  afterEach(() => jest.restoreAllMocks());

  const url = (): string => fetchMock.mock.calls[0][0];
  const init = (): RequestInit => fetchMock.mock.calls[0][1];

  it('register posts to the register endpoint', async () => {
    await AuthService.register({ email: 'a@b.c' });
    expect(url()).toBe(`${BASE}/users/register/`);
    expect(init().method).toBe('POST');
  });

  it('getUser builds the user id path', async () => {
    await AuthService.getUser('42');
    expect(url()).toBe(`${BASE}/users/42/`);
  });

  it('changePassword posts to the change password endpoint', async () => {
    await AuthService.changePassword({ old: 'x', new: 'y' });
    expect(url()).toBe(`${BASE}/users/password/change/`);
    expect(init().method).toBe('POST');
  });
});

describe('ProblemService endpoints', () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(okResponse({}));
    mockFetch(fetchMock);
  });
  afterEach(() => jest.restoreAllMocks());

  const url = (): string => fetchMock.mock.calls[0][0];

  it('getProblems with no filters uses an empty query string', async () => {
    await ProblemService.getProblems();
    expect(url()).toBe(`${BASE}/problems/problems/?`);
  });

  it('getProblems serialises provided filters into the query string', async () => {
    await ProblemService.getProblems({ status: 'PENDING', authorId: 7 });
    expect(url()).toBe(`${BASE}/problems/problems/?status=PENDING&authorId=7`);
  });

  it('getProblemDetail builds the detail path', async () => {
    await ProblemService.getProblemDetail(3);
    expect(url()).toBe(`${BASE}/problems/problems/3/`);
  });

  it('createProblem posts the body', async () => {
    await ProblemService.createProblem({ title: 'T' });
    expect(url()).toBe(`${BASE}/problems/problems/`);
  });

  it('updateProblem PATCHes the detail path', async () => {
    await ProblemService.updateProblem(9, { difficulty: 'EASY' });
    expect(url()).toBe(`${BASE}/problems/problems/9/`);
  });

  it('deleteProblem DELETEs the detail path', async () => {
    await ProblemService.deleteProblem(9);
    expect(url()).toBe(`${BASE}/problems/problems/9/`);
  });

  it('submitForApproval posts to the submit endpoint', async () => {
    await ProblemService.submitForApproval(5);
    expect(url()).toBe(`${BASE}/problems/problems/5/submit-for-approval/`);
  });

  it('approveProblem posts feedback', async () => {
    await ProblemService.approveProblem(5, { feedback: 'good' });
    expect(url()).toBe(`${BASE}/problems/problems/5/approve/`);
  });

  it('rejectProblem posts feedback', async () => {
    await ProblemService.rejectProblem(5, { feedback: 'bad' });
    expect(url()).toBe(`${BASE}/problems/problems/5/reject/`);
  });

  it('getTags hits the tags endpoint', async () => {
    await ProblemService.getTags();
    expect(url()).toBe(`${BASE}/problems/tags/`);
  });
});

describe('SubmissionService endpoints', () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(okResponse({}));
    mockFetch(fetchMock);
  });
  afterEach(() => jest.restoreAllMocks());

  const url = (): string => fetchMock.mock.calls[0][0];

  it('createSubmission posts the body', async () => {
    await SubmissionService.createSubmission({ code: 'x' });
    expect(url()).toBe(`${BASE}/submissions/submit/`);
  });

  it('getSubmissions with no filters uses an empty query string', async () => {
    await SubmissionService.getSubmissions();
    expect(url()).toBe(`${BASE}/submissions/submissions/?`);
  });

  it('getSubmissions serialises filters', async () => {
    await SubmissionService.getSubmissions({ problemId: 2, userId: 3 });
    expect(url()).toBe(`${BASE}/submissions/submissions/?problemId=2&userId=3`);
  });

  it('getSubmissionDetail builds the detail path', async () => {
    await SubmissionService.getSubmissionDetail(8);
    expect(url()).toBe(`${BASE}/submissions/submissions/8/`);
  });
});

describe('TestCaseService endpoints', () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(okResponse({}));
    mockFetch(fetchMock);
  });
  afterEach(() => jest.restoreAllMocks());

  const url = (): string => fetchMock.mock.calls[0][0];

  it('createTestCase posts the body', async () => {
    await TestCaseService.createTestCase({ input_data: 'a' });
    expect(url()).toBe(`${BASE}/problems/testcases/`);
  });

  it('updateTestCase PATCHes the detail path', async () => {
    await TestCaseService.updateTestCase(4, { points: 5 });
    expect(url()).toBe(`${BASE}/problems/testcases/4/`);
  });

  it('deleteTestCase DELETEs the detail path', async () => {
    await TestCaseService.deleteTestCase(4);
    expect(url()).toBe(`${BASE}/problems/testcases/4/`);
  });
});

describe('AdminService endpoints', () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(okResponse({}));
    mockFetch(fetchMock);
  });
  afterEach(() => jest.restoreAllMocks());

  const url = (): string => fetchMock.mock.calls[0][0];

  it('getUsers hits the manage endpoint', async () => {
    await AdminService.getUsers();
    expect(url()).toBe(`${BASE}/users/admin/manage/`);
  });

  it('updateUser PATCHes the manage detail path', async () => {
    await AdminService.updateUser(11, { is_active: false });
    expect(url()).toBe(`${BASE}/users/admin/manage/11/`);
  });

  it('getStats hits the stats endpoint', async () => {
    await AdminService.getStats();
    expect(url()).toBe(`${BASE}/users/admin/stats/`);
  });
});
