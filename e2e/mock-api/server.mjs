// Mock Django API for Playwright e2e runs (task A7, wave wf_c8e4c79c).
//
// Zero-dependency node http server. The frontend (server components via
// src/app/problems/_lib/problems-api.ts AND client code via
// src/services/ApiService.ts) resolves its API base from
// NEXT_PUBLIC_API_BASE; playwright.config.ts points that env at this server
// (http://localhost:8901), so BOTH server-side and browser-side fetches hit
// these canned responses — no real backend, no page.route interception.
//
// Contract mirrored from the port notes (docs/PORT-MAP.md §0.1): DRF list
// endpoints return BARE JSON ARRAYS (no envelope, no pagination) and auth
// login returns { access, refresh, user } (ApiService.ts:52, login page
// response.access/response.refresh/response.user check).

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
    json(res, 200, MOCK_PROBLEMS);
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

  json(res, 404, { detail: `No mock for ${req.method} ${path}` });
});

server.listen(PORT, HOST, () => {
  console.log(`[mock-api] listening on http://${HOST}:${PORT}`);
});
