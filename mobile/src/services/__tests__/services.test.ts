// Endpoint-map tests: every service method builds the exact path/params
// the web ApiService uses (contract parity), with fetch mocked.
import {
  ClassroomService,
  ContestService,
  ForumService,
  LeaderboardService,
  NotificationService,
  ProblemService,
  PublicService,
  SubmissionService,
  TranslationsService,
} from '../services';
import { __resetForTests } from '../ApiClient';

const calls = () => (global.fetch as jest.Mock).mock.calls;

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ count: 0, results: [] }),
    headers: { get: () => null },
  });
});

afterEach(() => {
  __resetForTests();
});

describe('ProblemService', () => {
  it('lists APPROVED problems with search + difficulty + paging', async () => {
    await ProblemService.getProblems(
      { search: 'sum', difficulty: 'EASY', status: 'APPROVED' },
      { page: 2, pageSize: 20 }
    );
    const [url, init] = calls()[0];
    expect(url).toContain(
      '/problems/problems/?search=sum&difficulty=EASY&status=APPROVED&page=2&page_size=20'
    );
    expect(init.method).toBe('GET');
  });

  it('omits empty params and fetches detail', async () => {
    await ProblemService.getProblems();
    expect(calls()[0][0]).toContain('/problems/problems/');
    await ProblemService.getProblemDetail(42);
    expect(calls()[1][0]).toContain('/problems/problems/42/');
    await ProblemService.getBookmarkedIds();
    expect(calls()[2][0]).toContain('/problems/problems/bookmarked/');
  });
});

describe('SubmissionService', () => {
  it('submits with the snake_case payload and filters the feed', async () => {
    await SubmissionService.createSubmission({
      problem: 5,
      language: 'python3',
      code: 'print(1)',
    });
    const [url, init] = calls()[0];
    expect(url).toContain('/submissions/submit/');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      problem: 5,
      language: 'python3',
      code: 'print(1)',
    });

    await SubmissionService.getSubmissions(
      { problemId: 5, language: 'cpp17' },
      { cursor: 'abc', pageSize: 10 }
    );
    expect(calls()[1][0]).toContain(
      '/submissions/submissions/?problemId=5&language=cpp17&cursor=abc&page_size=10'
    );
    await SubmissionService.getSubmissionDetail(9);
    expect(calls()[2][0]).toContain('/submissions/submissions/9/');
  });
});

describe('LeaderboardService + PublicService', () => {
  it('paginates the leaderboard and reads the language registry', async () => {
    await LeaderboardService.getLeaderboard({ page: 3, pageSize: 50 });
    expect(calls()[0][0]).toContain('/leaderboard/?page=3&page_size=50');
    await PublicService.getLanguages();
    expect(calls()[1][0]).toContain('/public/languages/');
  });
});

describe('ForumService', () => {
  it('threads list carries filters; posts paginate by cursor', async () => {
    await ForumService.getThreads({ page: 2, problemId: 7, lang: 'en' });
    expect(calls()[0][0]).toContain(
      '/forum/threads/?page=2&problem_id=7&lang=en'
    );
    await ForumService.getThread(3);
    expect(calls()[1][0]).toContain('/forum/threads/3/');
    await ForumService.createThread({ title: 'T', content: 'C' });
    const [, init] = calls()[2];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ title: 'T', content: 'C' });
    await ForumService.getPosts(3, { cursor: 'k', pageSize: 20 });
    expect(calls()[3][0]).toContain('/forum/threads/3/posts/?cursor=k&page_size=20');
  });

  it('createPost maps isSpoiler to snake_case', async () => {
    await ForumService.createPost(3, { content: 'hi', isSpoiler: true });
    const [, init] = calls()[0];
    expect(JSON.parse(init.body)).toEqual({
      content: 'hi',
      parent: null,
      is_spoiler: true,
    });
  });
});

describe('NotificationService', () => {
  it('feeds, marks read, and counts unread', async () => {
    await NotificationService.getNotifications({ unreadOnly: true });
    expect(calls()[0][0]).toContain('/notifications/?unread=true');
    await NotificationService.markRead(11);
    const [url2, init2] = calls()[1];
    expect(url2).toContain('/notifications/11/mark-read/');
    expect(init2.method).toBe('POST');
    await NotificationService.markAllRead();
    expect(calls()[2][0]).toContain('/notifications/mark-all-read/');
    await NotificationService.getUnreadCount();
    expect(calls()[3][0]).toContain('/notifications/unread-count/');
  });
});

describe('ContestService', () => {
  it('filters by state, registers, lists problems and standings', async () => {
    await ContestService.getContests({ state: 'RUNNING' });
    expect(calls()[0][0]).toContain('/contests/contests/?state=RUNNING');
    await ContestService.getContest(4);
    expect(calls()[1][0]).toContain('/contests/contests/4/');
    await ContestService.register(4, 'CODE');
    const [, init] = calls()[2];
    expect(JSON.parse(init.body)).toEqual({ access_code: 'CODE' });
    await ContestService.register(4);
    expect(JSON.parse(calls()[3][1].body)).toEqual({});
    await ContestService.getProblems(4);
    expect(calls()[4][0]).toContain('/contests/contests/4/problems/');
    await ContestService.getStandings(4, 2);
    expect(calls()[5][0]).toContain('/contests/contests/4/standings/?page=2');
  });
});

describe('ClassroomService + TranslationsService', () => {
  it('reads my classes/assignments and proposes translations', async () => {
    await ClassroomService.getMyClasses();
    expect(calls()[0][0]).toContain('/classroom/classes/my-classes/');
    await ClassroomService.getMyAssignments();
    expect(calls()[1][0]).toContain('/classroom/assignments/my-assignments/');
    await TranslationsService.getLanguages();
    expect(calls()[2][0]).toContain('/translations/languages/');
    await TranslationsService.getMine({ page: 2 });
    expect(calls()[3][0]).toContain('/translations/proposals/mine/?page=2');
    await TranslationsService.propose({
      problemId: 8,
      language: 'ro',
      title: 'Sumă',
      statement: 'Se dă…',
    });
    const [, init] = calls()[4];
    expect(JSON.parse(init.body)).toEqual({
      problem: 8,
      language: 'ro',
      title: 'Sumă',
      statement: 'Se dă…',
    });
  });
});

describe('optional-parameter branches', () => {
  it('hits every defaulted filter/pager branch once', async () => {
    await SubmissionService.getSubmissions(
      { userId: 3, language: 'c11' },
      { pageSize: 5 }
    );
    expect(calls().at(-1)![0]).toContain(
      '/submissions/submissions/?userId=3&language=c11&page_size=5'
    );
    await ForumService.getThreads({ problemId: 9, pageSize: 10, topic: 'problem' });
    expect(calls().at(-1)![0]).toContain(
      '/forum/threads/?page_size=10&problem_id=9&topic=problem'
    );
    await NotificationService.getNotifications({ pageSize: 7, cursor: 'c9' });
    expect(calls().at(-1)![0]).toContain(
      '/notifications/?cursor=c9&page_size=7'
    );
    await LeaderboardService.getLeaderboard({ pageSize: 25 });
    expect(calls().at(-1)![0]).toContain('/leaderboard/?page_size=25');
    await ContestService.getContests({ state: 'UPCOMING' }, { pageSize: 8 });
    expect(calls().at(-1)![0]).toContain(
      '/contests/contests/?state=UPCOMING&page_size=8'
    );
    await ForumService.getPosts(1, { pageSize: 4 });
    expect(calls().at(-1)![0]).toContain('/forum/threads/1/posts/?page_size=4');
    await TranslationsService.getMine({ pageSize: 6 });
    expect(calls().at(-1)![0]).toContain(
      '/translations/proposals/mine/?page_size=6'
    );
    await ClassroomService.getMyAssignments();
    expect(calls().at(-1)![0]).toContain('/classroom/assignments/my-assignments/');
  });
});
