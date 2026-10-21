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
    title_i18n: { en: 'Reverse String' },
    difficulty: 'MEDIUM',
    status: 'APPROVED',
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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS_HEADERS });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  const path = new URL(req.url, `http://${HOST}:${PORT}`).pathname;

  // CORS preflight (browser POST with Content-Type: application/json triggers it)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
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
      json(res, 200, {
        access: 'e2e-access-token',
        refresh: 'e2e-refresh-token',
        user: isAdmin ? MOCK_ADMIN : MOCK_USER,
      });
    });
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/users/me/') {
    // Authorization header distinguishes the admin session (see auth.spec.ts).
    const auth = req.headers.authorization ?? '';
    json(res, 200, auth.includes('admin') ? MOCK_ADMIN : MOCK_USER);
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/leaderboard/') {
    json(res, 200, paged(MOCK_LEADERBOARD));
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/leaderboard/me/') {
    const auth = req.headers.authorization ?? '';
    if (!auth) {
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
    const auth = req.headers.authorization ?? '';
    if (!auth) {
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
