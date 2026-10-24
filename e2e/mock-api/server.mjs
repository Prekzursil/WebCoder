// Mock Django API for Playwright e2e runs (task A7, wave wf_c8e4c79c).
//
// Zero-dependency node http server. The frontend (server components via
// src/app/problems/_lib/problems-api.ts AND client code via
// src/services/ApiService.ts) resolves its API base from
// NEXT_PUBLIC_API_BASE; playwright.config.ts points that env at this server
// (http://localhost:8901), so BOTH server-side and browser-side fetches hit
// these canned responses — no real backend, no page.route interception.
//
// Contract mirrored from the backend's pagination wave (SPEC-GAPS B4): list
// endpoints return the DRF envelope {count, next, previous, results}
// (submissions/notifications/forum posts use the cursor variant without
// `count`), and auth login returns { access, refresh, user } (ApiService
// login page response.access/response.refresh/response.user check).

import { createServer } from 'node:http';

const PORT = 8901;
const HOST = '127.0.0.1';

const MOCK_USER = {
  id: 1,
  username: 'e2e_tester',
  email: 'e2e@example.com',
  role: 'PROBLEM_CREATOR',
};

const MOCK_ADMIN = {
  id: 2,
  username: 'admin_e2e',
  email: 'admin@e2e.local',
  role: 'ADMIN',
};

const MOCK_PROBLEMS = [
  {
    id: 1,
    title_i18n: { en: 'Two Sum' },
    difficulty: 'EASY',
    status: 'APPROVED',
    statement_i18n: {
      en: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
    },
    default_time_limit_ms: 1000,
    default_memory_limit_kb: 65536,
    allowed_languages: ['PYTHON', 'CPP'],
    test_cases: [
      {
        id: 1,
        input_data: '[2,7,11,15]\n9',
        expected_output_data: '[0,1]',
        is_sample: true,
        points: 10,
      },
    ],
  },
  {
    id: 2,
    title_i18n: { en: 'Reverse String', ro: 'Inversarea unui șir' },
    difficulty: 'MEDIUM',
    status: 'APPROVED',
    // Wave A learning-layer fixtures: markdown+math statement (A7), hints
    // (EDT-2) and an editorial (EDT-1) the /problems/2 page renders.
    statement_i18n: {
      en: 'Read string $s$ with $1 \\le |s| \\le 10^5$ and print it reversed.\n\n**Input:** the string $s$.\n\n**Output:** the reversed string.',
      ro: 'Citește șirul $s$ cu $1 \\le |s| \\le 10^5$ și afișează-l invers.\n\n**Input:** șirul $s$.\n\n**Output:** șirul inversat.',
    },
    default_time_limit_ms: 1000,
    default_memory_limit_kb: 262144,
    allowed_languages: ['PYTHON', 'CPP'],
    hints_en: ['Built-in slicing reverses in one step.', 's[::-1]'],
    hints_ro: ['Slicing-ul integrat inversează într-un pas.', 's[::-1]'],
    has_editorial: true,
  },
];

// DRF envelope builders (SPEC-GAPS B4).
const paged = (results, next = null) => ({ count: results.length, next, previous: null, results });
const cursorPaged = (results, next = null) => ({ next, previous: null, results });

const MOCK_TAGS = [
  { id: 1, name_i18n: { en: 'Arrays' }, slug: 'arrays' },
  { id: 2, name_i18n: { en: 'Dynamic Programming' }, slug: 'dp' },
];

const MOCK_THREADS = [
  {
    id: 1,
    title: 'Welcome to the WebCoder forum',
    problem: null,
    author: 'admin_e2e',
    post_count: 2,
    is_pinned: true,
    is_locked: false,
    last_activity: '2026-10-20T10:00:00Z',
    created_at: '2026-10-18T09:00:00Z',
  },
  {
    id: 2,
    title: 'Two Sum approaches discussion',
    problem: { id: 1, title_i18n: { en: 'Two Sum' } },
    author: 'e2e_tester',
    post_count: 1,
    is_pinned: false,
    is_locked: false,
    last_activity: '2026-10-19T12:00:00Z',
    created_at: '2026-10-19T11:30:00Z',
  },
];

const MOCK_POSTS = [
  {
    id: 1,
    thread_id: 1,
    author: 'admin_e2e',
    content: 'Welcome! Read the guidelines before posting.',
    parent_id: null,
    is_edited: false,
    upvotes: 5,
    is_hidden: false,
    hidden_reason: '',
    created_at: '2026-10-18T09:00:00Z',
  },
];

const MOCK_LEADERBOARD = [
  { rank: 1, username: 'admin_e2e', solved_count: 10, total_points: 500, success_rate: 0.8333, last_solved_at: '2026-10-20T00:00:00Z' },
  { rank: 2, username: 'e2e_tester', solved_count: 4, total_points: 200, success_rate: 0.6667, last_solved_at: '2026-10-19T00:00:00Z' },
];

const MOCK_NOTIFICATIONS = [
  {
    id: 1,
    verb: 'SUBMISSION_JUDGED',
    actor: null,
    target_type: 'submission',
    target_id: 11,
    data: { verdict: 'AC', problem_id: 1, submission_id: 11 },
    read_at: null,
    created_at: '2026-10-20T08:00:00Z',
  },
  {
    id: 2,
    verb: 'THREAD_REPLY',
    actor: 'admin_e2e',
    target_type: 'thread',
    target_id: 1,
    data: { post_id: 1, title: 'Welcome to the WebCoder forum' },
    read_at: '2026-10-19T00:00:00Z',
    created_at: '2026-10-19T09:00:00Z',
  },
];

// Cookie-auth contract (SP1): the frontend sends `credentials: 'include'`
// and NO Authorization header, so CORS must echo the origin and allow
// credentials (a literal '*' origin is rejected by credentialed requests).
function corsHeaders(req) {
  return {
    'Access-Control-Allow-Origin': req.headers.origin ?? '*',
    Vary: 'Origin',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-CSRFToken',
  };
}

function json(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...(res._corsHeaders ?? {}),
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}

// Session model mirrors the backend: httpOnly wc_access/wc_refresh cookies
// gate the authenticated endpoints (admin session keyed by cookie value).
function cookieValue(req, name) {
  const raw = req.headers.cookie ?? '';
  const match = raw.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

function sessionUser(req) {
  const access = cookieValue(req, 'wc_access');
  if (!access) return null;
  return access.includes('admin') ? MOCK_ADMIN : MOCK_USER;
}

const AUTH_COOKIES = (value) => [
  `wc_access=${value}; Path=/; HttpOnly; SameSite=Lax`,
  `wc_refresh=e2e-refresh-${value}; Path=/; HttpOnly; SameSite=Lax`,
];

const server = createServer((req, res) => {
  const path = new URL(req.url, `http://${HOST}:${PORT}`).pathname;
  res._corsHeaders = corsHeaders(req);

  // CORS preflight (browser POST with Content-Type: application/json triggers it)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }

  // Playwright webServer readiness probe
  if (path === '/healthz') {
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/problems/problems/') {
    json(res, 200, paged(MOCK_PROBLEMS));
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/problems/tags/') {
    json(res, 200, paged(MOCK_TAGS));
    return;
  }

  // Wave A learning layer: per-problem statistics + editorial gate + rate.
  const statsMatch = path.match(/^\/api\/v1\/problems\/problems\/(\d+)\/statistics\/$/);
  if (req.method === 'GET' && statsMatch) {
    json(res, 200, {
      problem: Number(statsMatch[1]),
      tried: 12,
      solved: 6,
      acceptance_rate: 0.5,
      verdict_distribution: { AC: 6, WA: 6 },
      language_counts: { python3: 8, cpp17: 4 },
      rating_avg: 2.7,
      rating_count: 3,
    });
    return;
  }

  const rateMatch = path.match(/^\/api\/v1\/problems\/problems\/(\d+)\/rate\/$/);
  if (req.method === 'POST' && rateMatch) {
    json(res, 200, { rating_avg: 3, rating_count: 1, your_rating: 3 });
    return;
  }

  const editorialMatch = path.match(/^\/api\/v1\/problems\/problems\/(\d+)\/editorial\/$/);
  if (req.method === 'GET' && editorialMatch) {
    // Problem 2 carries an editorial in the mock catalog; the others 404.
    if (Number(editorialMatch[1]) === 2) {
      json(res, 200, {
        content_en: 'Greedy: sort and sweep.',
        content_ro: 'Greedy: sortează și parcurge.',
        publish_policy: 'PUBLIC',
      });
    } else {
      json(res, 404, { detail: 'No editorial for this problem.' });
    }
    return;
  }

  // FE-3: profile statistics, GDPR endpoints, bookmarks.
  if (req.method === 'GET' && path === '/api/v1/users/me/statistics/') {
    json(res, 200, {
      solved: 5, attempted: 8, total_submissions: 20, acceptance_rate: 0.625,
      per_difficulty: { EASY: { solved: 4, attempted: 6 }, MEDIUM: { solved: 1, attempted: 2 }, HARD: { solved: 0, attempted: 0 } },
      per_language: { python3: 15, cpp17: 5 },
      active_dates_90d: [new Date().toISOString().slice(0, 10)],
      current_streak: 1, max_streak: 3, total_active_days: 4,
      ladder: { points: 7, level: 1, next_level_points: 10, progress: 0.7 },
      badges: ['first_ac'],
    });
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/users/me/solved-ids/') {
    json(res, 200, { solved: [1], attempted: [2] });
    return;
  }

  if (req.method === 'POST' && path === '/api/v1/users/me/export/') {
    json(res, 200, { profile: { username: 'e2e' }, submissions: [] });
    return;
  }

  const bookmarkMatch = path.match(/^\/api\/v1\/problems\/problems\/(\d+)\/bookmark\/$/);
  if (bookmarkMatch && (req.method === 'POST' || req.method === 'DELETE')) {
    json(res, 200, { problem: Number(bookmarkMatch[1]), starred: req.method === 'POST', star_count: 1 });
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/problems/problems/bookmarked/') {
    json(res, 200, { starred_ids: [1] });
    return;
  }

  if (req.method === 'POST' && path === '/api/v1/scratch/') {
    json(res, 200, { id: 1, status: 'OK', output: '42\n', error: '' });
    return;
  }

  // Wave A: curriculum tree (EDU-9) + starter trio (ONB-1) + solved ids (F5).
  if (req.method === 'GET' && path === '/api/v1/problems/curriculum/') {
    json(res, 200, paged([
      {
        id: 10, kind: 'GRADE', slug: 'g9', order: 10,
        name_i18n: { en: 'Grade 9', ro: 'Clasa a IX-a' }, problem_count: 2,
        children: [
          { id: 11, kind: 'CHAPTER', slug: 'g9-elementary', order: 1,
            name_i18n: { en: 'Elementary algorithms', ro: 'Algoritmi elementari' }, problem_count: 1 },
          { id: 12, kind: 'CHAPTER', slug: 'g9-loops', order: 2,
            name_i18n: { en: 'Loops', ro: 'Structuri repetitive' }, problem_count: 1 },
        ],
      },
    ]));
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/problems/problems/starters/') {
    json(res, 200, [MOCK_PROBLEMS[0], MOCK_PROBLEMS[1]]);
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/users/me/solved-ids/') {
    json(res, 200, { solved: [1], attempted: [2] });
    return;
  }

  const detail = path.match(/^\/api\/v1\/problems\/problems\/(\d+)\/$/);
  if (req.method === 'GET' && detail) {
    const problem = MOCK_PROBLEMS.find((p) => p.id === Number(detail[1]));
    if (problem) {
      json(res, 200, problem);
    } else {
      json(res, 404, { detail: 'Not found.' });
    }
    return;
  }

  if (req.method === 'POST' && path === '/api/v1/auth/login/') {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      let creds = {};
      try {
        creds = JSON.parse(raw || '{}');
      } catch {
        creds = {};
      }
      // Deterministic failure path for the login-error spec.
      if (creds.username === 'bad_user') {
        json(res, 400, { detail: 'Invalid credentials.' });
        return;
      }
      const isAdmin = creds.username === 'admin_e2e';
      const cookieValueToken = isAdmin ? 'e2e-admin-access' : 'e2e-access-token';
      // Cookie-auth contract (SP1): httpOnly session cookies + user body;
      // the refresh token never appears in the body.
      json(
        res,
        200,
        {
          user: isAdmin ? MOCK_ADMIN : MOCK_USER,
        },
        { 'Set-Cookie': AUTH_COOKIES(cookieValueToken) }
      );
    });
    return;
  }

  if (req.method === 'POST' && path === '/api/v1/auth/token/refresh/') {
    // dj-rest-auth cookie refresh: empty body, wc_refresh cookie in play.
    if (!cookieValue(req, 'wc_refresh')) {
      json(res, 401, { detail: 'No valid refresh token found.' });
      return;
    }
    json(res, 200, { access: 'e2e-rotated-access' }, { 'Set-Cookie': AUTH_COOKIES('e2e-access-token')[0] });
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/auth/csrf/') {
    json(res, 200, { detail: 'CSRF cookie set' }, {
      'Set-Cookie': 'csrftoken=e2e-csrf-token; Path=/; SameSite=Lax',
    });
    return;
  }

  if (req.method === 'POST' && path === '/api/v1/auth/logout/') {
    json(res, 200, { detail: 'Logged out.' }, {
      'Set-Cookie': [
        'wc_access=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
        'wc_refresh=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
      ],
    });
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/users/me/') {
    // Cookie session distinguishes admin/user; anonymous gets 401 (the
    // AuthContext hydration relies on that truth).
    const user = sessionUser(req);
    if (!user) {
      json(res, 401, { detail: 'Authentication credentials were not provided.' });
      return;
    }
    json(res, 200, user);
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/leaderboard/') {
    json(res, 200, paged(MOCK_LEADERBOARD));
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/leaderboard/me/') {
    if (!sessionUser(req)) {
      json(res, 401, { detail: 'Authentication credentials were not provided.' });
      return;
    }
    json(res, 200, {
      rank: 2,
      username: 'e2e_tester',
      solved_count: 4,
      total_points: 200,
      success_rate: 0.6667,
      total_submissions: 6,
      ac_submissions: 4,
      last_solved_at: '2026-10-19T00:00:00Z',
    });
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/forum/threads/') {
    json(res, 200, paged(MOCK_THREADS));
    return;
  }

  const threadDetail = path.match(/^\/api\/v1\/forum\/threads\/(\d+)\/$/);
  if (req.method === 'GET' && threadDetail) {
    const thread = MOCK_THREADS.find((t) => t.id === Number(threadDetail[1]));
    if (thread) {
      json(res, 200, thread);
    } else {
      json(res, 404, { detail: 'Not found.' });
    }
    return;
  }

  const threadPosts = path.match(/^\/api\/v1\/forum\/threads\/(\d+)\/posts\/$/);
  if (req.method === 'GET' && threadPosts) {
    json(res, 200, cursorPaged(MOCK_POSTS.filter((p) => p.thread_id === Number(threadPosts[1]))));
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/notifications/') {
    if (!sessionUser(req)) {
      json(res, 401, { detail: 'Authentication credentials were not provided.' });
      return;
    }
    json(res, 200, cursorPaged(MOCK_NOTIFICATIONS));
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/notifications/unread-count/') {
    json(res, 200, { count: MOCK_NOTIFICATIONS.filter((n) => n.read_at === null).length });
    return;
  }

  json(res, 404, { detail: `No mock for ${req.method} ${path}` });
});

server.listen(PORT, HOST, () => {
  console.log(`[mock-api] listening on http://${HOST}:${PORT}`);
});
