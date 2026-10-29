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
  two_factor_enabled: false,
  two_factor_required: true,
};

const MOCK_ADMIN = {
  id: 2,
  username: 'admin_e2e',
  email: 'admin@e2e.local',
  role: 'ADMIN',
  two_factor_enabled: false,
  two_factor_required: true,
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
  {
    id: 4,
    title_i18n: { en: 'Hello, Judge!', ro: 'Salut, evaluator!' },
    difficulty: 'VERY_EASY',
    status: 'APPROVED',
    grade_group: 'gimnaziu',
    statement_i18n: {
      en: 'Print the exact text `Hello, judge!`',
      ro: 'Afișează exact textul `Salut, evaluator!`',
    },
    default_time_limit_ms: 1000,
    default_memory_limit_kb: 262144,
    allowed_languages: ['PYTHON', 'CPP'],
  },
  {
    id: 3,
    title_i18n: { en: 'Guess the Number', ro: 'Ghicește numărul' },
    // Wave D (JDG-2): INTERACTIVE fixture — judged by an interactor over
    // piped stdio; the problem page badges it and warns about flushing.
    problem_type: 'INTERACTIVE',
    interactor_language: 'python3',
    difficulty: 'EASY',
    status: 'APPROVED',
    statement_i18n: {
      en: 'The judge has a secret number. Ask comparison questions by writing them to stdout; the interactor answers on your stdin. Flush after every line!',
      ro: 'Evaluatorul are un număr secret. Pune întrebări comparative scriindu-le pe stdout; interactorul răspunde pe stdin-ul tău. Dă flush după fiecare linie!',
    },
    default_time_limit_ms: 2000,
    default_memory_limit_kb: 262144,
    allowed_languages: ['PYTHON', 'CPP'],
  },
];

// DRF envelope builders (SPEC-GAPS B4).
const paged = (results, next = null) => ({ count: results.length, next, previous: null, results });
const cursorPaged = (results, next = null) => ({ next, previous: null, results });

const MOCK_TAGS = [
  { id: 1, name_i18n: { en: 'Arrays' }, slug: 'arrays' },
  { id: 2, name_i18n: { en: 'Dynamic Programming' }, slug: 'dp' },
];

// CON-5 mock state: contests whose virtual-start the session has pressed —
// the detail payload then reports an active replay participation.
// OPS-2 (Wave D) mock state: TOTP enrollment + the personal token.
const totpState = { secret: '', enabled: false };
const apiTokenState = { key: null };

const virtualStarted = new Set();

const MOCK_CONTESTS = [
  {
    id: 1,
    title_i18n: { en: 'Autumn Open 2026', ro: 'Openul de toamnă 2026' },
    // OPS-7 groundwork: sponsor attribution rail on the detail payload.
    sponsor_name: 'CJ Cluj Tech',
    sponsor_logo_url: 'https://example.com/cj-cluj.png',
    description_i18n: {},
    visibility: 'PUBLIC',
    is_rated: true,
    format: 'IOI',
    start_at: '2026-10-01T10:00:00Z',
    end_at: '2999-01-01T12:00:00Z',
    freeze_at: null,
    is_window: false,
    per_user_duration_minutes: 180,
    pretest_mode: false,
    created_by: 2,
    created_by_username: 'admin_e2e',
    state: 'RUNNING',
    problem_count: 2,
    participant_count: 2,
    my_participation: null,
    can_manage: false,
  },
  {
    id: 3,
    title_i18n: { en: 'Spring Replay 2025', ro: 'Replay de primăvară 2025' },
    description_i18n: {},
    visibility: 'PUBLIC',
    is_rated: false,
    format: 'IOI',
    start_at: '2025-03-01T10:00:00Z',
    end_at: '2025-03-01T12:00:00Z',
    freeze_at: null,
    is_window: false,
    per_user_duration_minutes: 120,
    pretest_mode: false,
    created_by: 2,
    created_by_username: 'admin_e2e',
    state: 'FINISHED',
    problem_count: 2,
    participant_count: 2,
    my_participation: null,
    can_manage: false,
  },
];

const MOCK_CONTEST_PROBLEMS = [
  { id: 11, problem: 1, problem_title: { en: 'Two Sum' }, problem_difficulty: 'EASY', order: 0, label: 'A', points: 100 },
  { id: 12, problem: 2, problem_title: { en: 'Reverse String', ro: 'Inversarea unui șir' }, problem_difficulty: 'MEDIUM', order: 1, label: 'B', points: 100 },
];

const MOCK_STANDINGS = {
  count: 2,
  next: null,
  previous: null,
  format: 'IOI',
  frozen: false,
  results: [
    {
      rank: 1,
      user: { id: 1, username: 'e2e_tester' },
      score: 150,
      solved: 1,
      penalty_minutes: null,
      problems: [
        { label: 'A', points_max: 100, best: 100, attempts: 1, wrong: 0, first_ac_at: '2026-10-01T10:10:00Z', last_improvement: null },
        { label: 'B', points_max: 100, best: 50, attempts: 2, wrong: 1, first_ac_at: null, last_improvement: null },
      ],
    },
    {
      rank: 2,
      user: { id: 2, username: 'admin_e2e' },
      score: 40,
      solved: 0,
      penalty_minutes: null,
      problems: [
        { label: 'A', points_max: 100, best: 40, attempts: 3, wrong: 2, first_ac_at: null, last_improvement: null },
        { label: 'B', points_max: 100, best: 0, attempts: 0, wrong: 0, first_ac_at: null, last_improvement: null },
      ],
    },
  ],
};

const MOCK_RATINGS = [
  {
    user: { id: 1, username: 'e2e_tester' },
    rating: 1512,
    internal_rating: 1560,
    rd: 40,
    contests_count: 2,
    band: { min: 1400, name_en: 'Specialist', name_ro: 'Specialist', color: '#0000ff' },
  },
];


const MOCK_CLASSROOM = {
  id: 5,
  name: 'IX-A',
  school: 'Liceul X',
  is_open: true,
  created_at: '2026-10-01T00:00:00Z',
  teacher_username: 'e2e_teacher',
  member_count: 1,
  assignment_count: 1,
  is_owner: false,
};

const MOCK_MY_CLASSES = {
  results: [
    {
      membership_id: 9,
      joined_at: '2026-10-02T00:00:00Z',
      classroom: MOCK_CLASSROOM,
      open_assignments: 1,
    },
  ],
};

const MOCK_ASSIGNMENT = {
  id: 3,
  classroom: 5,
  classroom_name: 'IX-A',
  title_i18n: { en: 'Tema 1 — loops', ro: 'Tema 1 — bucle' },
  description: '',
  available_from: '2026-10-20T00:00:00Z',
  due_at: '2999-01-01T00:00:00Z',
  late_until: null,
  is_exam: false,
  kind: 'PROBLEMS',
  quiz_shuffle: true,
  file_extensions: '',
  max_file_mb: 10,
  state: 'OPEN',
  solved_count: 1,
  assignment_problems: [
    { id: 11, problem: 1, problem_title: { en: 'Two Sum' }, problem_difficulty: 'EASY', order: 0, label: 'A', points: 100 },
  ],
};

const MOCK_MY_ASSIGNMENTS = { results: [MOCK_ASSIGNMENT] };

// Wave C (EDU-7/8): a quiz teme with one shuffled grilă + a FILES teme.
const MOCK_QUIZ_ASSIGNMENT = {
  ...MOCK_ASSIGNMENT,
  id: 4,
  kind: 'QUIZ',
  quiz_shuffle: true,
  assignment_problems: [],
};
const MOCK_QUIZ_SHEET = {
  assignment: 4,
  kind: 'QUIZ',
  shuffle: true,
  state: 'OPEN',
  items: [
    {
      item_id: 71,
      order: 0,
      question_i18n: { en: 'What is 7 % 3?', ro: 'Cât este 7 % 3?' },
      variants_en: ['2', '2.33', '1', '3'],
      variants_ro: ['2', '2,33', '1', '3'],
      correct_index: null,
    },
  ],
};
const MOCK_FILES_ASSIGNMENT = {
  ...MOCK_ASSIGNMENT,
  id: 5,
  kind: 'FILES',
  file_extensions: 'pdf,zip',
  max_file_mb: 10,
  assignment_problems: [],
};

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
  const requestUrl = new URL(req.url, `http://${HOST}:${PORT}`);
  const path = requestUrl.pathname;
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
        // EDU-10 (Wave D): the gimnaziu tree leads the liceu spine.
        id: 20, kind: 'GRADE', slug: 'g5', order: 5,
        name_i18n: { en: 'Grade 5', ro: 'Clasa a V-a' }, problem_count: 1,
        children: [
          { id: 21, kind: 'CHAPTER', slug: 'g5-first-steps', order: 1,
            name_i18n: { en: 'First steps (read & print)', ro: 'Primii pași (citire și afișare)' }, problem_count: 1 },
        ],
      },
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

  // ---- OPS-2 (Wave D): TOTP enrollment + personal API token ----------
  if (path === '/api/v1/users/me/totp/begin/' && req.method === 'POST') {
    if (!sessionUser(req)) {
      json(res, 401, { detail: 'Authentication credentials were not provided.' });
      return;
    }
    totpState.secret = 'MOCKSECRETMOCKSECRETMOCKSECRET32';
    totpState.enabled = false;
    json(res, 200, {
      secret: totpState.secret,
      otpauth_uri:
        'otpauth://totp/WebCoder%3Ae2e_tester?secret=' + totpState.secret + '&issuer=WebCoder',
    });
    return;
  }
  if (path === '/api/v1/users/me/totp/verify/' && req.method === 'POST') {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!sessionUser(req)) {
        json(res, 401, { detail: 'Authentication credentials were not provided.' });
        return;
      }
      const payload = raw ? JSON.parse(raw) : {};
      if (String(payload.code) !== '123456') {
        json(res, 400, { detail: 'Invalid or expired code.' });
        return;
      }
      totpState.enabled = true;
      json(res, 200, { detail: 'Two-factor authentication enabled.' });
    });
    return;
  }
  if (path === '/api/v1/users/me/totp/disable/' && req.method === 'POST') {
    // The body (code + password) is validated server-side; the mock
    // accepts any authenticated disable.
    if (!sessionUser(req)) {
      json(res, 401, { detail: 'Authentication credentials were not provided.' });
      return;
    }
    totpState.enabled = false;
    totpState.secret = '';
    json(res, 200, { detail: 'Two-factor authentication disabled.' });
    return;
  }
  if (path === '/api/v1/users/me/tokens/' && req.method === 'GET') {
    if (!sessionUser(req)) {
      json(res, 401, { detail: 'Authentication credentials were not provided.' });
      return;
    }
    json(res, 200, {
      count: apiTokenState.key ? 1 : 0,
      results: apiTokenState.key
        ? [{ key_hint: '...' + apiTokenState.key.slice(-4), created: '2026-10-28T00:00:00Z' }]
        : [],
    });
    return;
  }
  if (path === '/api/v1/users/me/tokens/' && req.method === 'POST') {
    if (!sessionUser(req)) {
      json(res, 401, { detail: 'Authentication credentials were not provided.' });
      return;
    }
    if (apiTokenState.key) {
      json(res, 409, { detail: 'You already have a personal token — revoke it first to rotate the key.' });
      return;
    }
    apiTokenState.key = 'e2e-mock-personal-token-0123456789abcdef';
    json(res, 201, {
      detail: 'Store this key now — it is shown only once.',
      key: apiTokenState.key,
      created: '2026-10-28T00:00:00Z',
    });
    return;
  }
  if (path === '/api/v1/users/me/tokens/' && req.method === 'DELETE') {
    if (!sessionUser(req)) {
      json(res, 401, { detail: 'Authentication credentials were not provided.' });
      return;
    }
    if (!apiTokenState.key) {
      json(res, 404, { detail: 'Token not found.' });
      return;
    }
    apiTokenState.key = null;
    json(res, 200, { detail: 'Token revoked.' });
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/users/me/') {
    // Cookie session distinguishes admin/user; anonymous gets 401 (the
    // AuthContext hydration relies on that truth). The 2FA flags reflect
    // the mock TOTP state so the warn banner reacts to enrollment.
    const user = sessionUser(req);
    if (!user) {
      json(res, 401, { detail: 'Authentication credentials were not provided.' });
      return;
    }
    json(res, 200, {
      ...user,
      two_factor_enabled: totpState.enabled,
      two_factor_required: !totpState.enabled,
    });
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

  if (req.method === 'GET' && path === '/api/v1/contests/contests/') {
    json(res, 200, paged(MOCK_CONTESTS));
    return;
  }

  const contestDetail = path.match(/^\/api\/v1\/contests\/contests\/(\d+)\/$/);
  if (req.method === 'GET' && contestDetail) {
    const contest = MOCK_CONTESTS.find((c) => c.id === Number(contestDetail[1]));
    if (contest) {
      if (virtualStarted.has(contest.id) && sessionUser(req)) {
        json(res, 200, {
          ...contest,
          my_participation: {
            virtual_start: '2026-11-02T10:00:00Z',
            effective_start: '2026-11-02T10:00:00Z',
            effective_end: '2026-11-02T12:00:00Z',
            is_virtual: true,
            is_disqualified: false,
          },
        });
      } else {
        json(res, 200, contest);
      }
    } else {
      json(res, 404, { detail: 'Not found.' });
    }
    return;
  }

  const contestRegister = path.match(/^\/api\/v1\/contests\/contests\/(\d+)\/register\/$/);
  if (req.method === 'POST' && contestRegister) {
    if (!sessionUser(req)) {
      json(res, 401, { detail: 'Authentication credentials were not provided.' });
      return;
    }
    json(res, 201, { contest: Number(contestRegister[1]), user: sessionUser(req).id });
    return;
  }

  const contestProblems = path.match(/^\/api\/v1\/contests\/contests\/(\d+)\/problems\/$/);
  if (req.method === 'GET' && contestProblems) {
    json(res, 200, MOCK_CONTEST_PROBLEMS);
    return;
  }

  const contestStandings = path.match(/^\/api\/v1\/contests\/contests\/(\d+)\/standings\/$/);
  if (req.method === 'GET' && contestStandings) {
    if (requestUrl.searchParams.get('section') === 'virtual') {
      json(res, 200, { ...MOCK_STANDINGS, section: 'virtual', count: 1 });
    } else {
      json(res, 200, { ...MOCK_STANDINGS, section: 'official' });
    }
    return;
  }

  const contestAwards = path.match(/^\/api\/v1\/contests\/contests\/(\d+)\/awards\/$/);
  if (req.method === 'GET' && contestAwards) {
    json(res, 200, {
      count: 1,
      results: [{ rank: 1, medal: 'GOLD', user: { id: 2, username: 'alice_e2e' } }],
    });
    return;
  }

  const contestVirtualStart = path.match(
    /^\/api\/v1\/contests\/contests\/(\d+)\/virtual-start\/$/
  );
  if (req.method === 'POST' && contestVirtualStart) {
    if (!sessionUser(req)) {
      json(res, 401, { detail: 'Authentication credentials were not provided.' });
      return;
    }
    virtualStarted.add(Number(contestVirtualStart[1]));
    json(res, 201, {
      virtual_start: '2026-11-02T10:00:00Z',
      effective_end: '2026-11-02T12:00:00Z',
      is_virtual: true,
    });
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/ratings/ratings/') {
    json(res, 200, paged(MOCK_RATINGS));
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/ratings/ratings/me/') {
    if (!sessionUser(req)) {
      json(res, 401, { detail: 'Authentication credentials were not provided.' });
      return;
    }
    json(res, 200, {
      rated: true,
      rating: 1512,
      internal_rating: 1560,
      rd: 40,
      contests_count: 2,
      band: { min: 1400, name_en: 'Specialist', name_ro: 'Specialist', color: '#0000ff' },
    });
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/classroom/classes/my-classes/') {
    if (!sessionUser(req)) {
      json(res, 401, { detail: 'Authentication credentials were not provided.' });
      return;
    }
    json(res, 200, MOCK_MY_CLASSES);
    return;
  }

  const assignmentDetail = path.match(/^\/api\/v1\/classroom\/assignments\/(\d+)\/$/);
  if (req.method === 'GET' && assignmentDetail) {
    const id = Number(assignmentDetail[1]);
    if (id === 4) json(res, 200, MOCK_QUIZ_ASSIGNMENT);
    else if (id === 5) json(res, 200, MOCK_FILES_ASSIGNMENT);
    else json(res, 200, MOCK_ASSIGNMENT);
    return;
  }

  const quizSheet = path.match(/^\/api\/v1\/classroom\/assignments\/(\d+)\/quiz\/$/);
  if (req.method === 'GET' && quizSheet) {
    json(res, 200, MOCK_QUIZ_SHEET);
    return;
  }

  const quizSubmit = path.match(
    /^\/api\/v1\/classroom\/assignments\/(\d+)\/quiz\/submit\/$/
  );
  if (req.method === 'POST' && quizSubmit) {
    if (!sessionUser(req)) {
      json(res, 401, { detail: 'Authentication credentials were not provided.' });
      return;
    }
    json(res, 201, {
      id: 77,
      score: 1,
      correct_count: 1,
      total_count: 1,
      submitted_at: '2026-11-01T10:00:00Z',
    });
    return;
  }

  const deliverables = path.match(
    /^\/api\/v1\/classroom\/assignments\/(\d+)\/deliverables\/$/
  );
  if (deliverables) {
    if (!sessionUser(req)) {
      json(res, 401, { detail: 'Authentication credentials were not provided.' });
      return;
    }
    if (req.method === 'POST') {
      json(res, 201, { id: 9, original_filename: 'tema.pdf' });
      return;
    }
    json(res, 200, {
      assignment: 5,
      results: [
        {
          id: 9,
          student: { id: sessionUser(req).id, username: sessionUser(req).username },
          original_filename: 'tema.pdf',
          file: '/media/fake.pdf',
          uploaded_at: '2026-11-01T10:00:00Z',
        },
      ],
    });
    return;
  }

  // UXP-4: statement revision history.
  const statementRevisions = path.match(
    /^\/api\/v1\/problems\/problems\/(\d+)\/statement-revisions\/$/
  );
  if (req.method === 'GET' && statementRevisions) {
    json(res, 200, {
      count: 1,
      results: [
        {
          id: 1,
          note: 'clarified constraints',
          edited_by: 'admin_e2e',
          created_at: '2026-11-01T00:00:00Z',
        },
      ],
    });
    return;
  }

  // OPS-3: the Microsoft SSO lane mirrors the other providers.
  if (path === '/accounts/microsoft/login/') {
    res.writeHead(302, { Location: '/login?mock_sso=microsoft' });
    res.end();
    return;
  }

  // OPS-1 public read-only API.
  if (req.method === 'GET' && path === '/api/v1/public/') {
    json(res, 200, {
      api: 'WebCoder public API v1 (read-only).',
      endpoints: ['/api/v1/public/problems/', '/api/v1/public/leaderboard/'],
    });
    return;
  }
  if (req.method === 'GET' && path === '/api/v1/public/problems/') {
    json(res, 200, {
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 1,
          title_i18n: { en: 'Two Sum', ro: 'Suma a două' },
          difficulty: 'EASY',
          tags: ['arrays'],
          time_limit_ms: 1000,
          memory_limit_kb: 262144,
        },
      ],
    });
    return;
  }

  // Wave C (COM-3/COM-7, RAT-9): feed, solutions, weekly board.
  if (req.method === 'GET' && path === '/api/v1/community/feed/') {
    json(res, 200, {
      count: 1,
      page: 1,
      next: null,
      results: [
        {
          id: 9,
          user: 'alice_e2e',
          problem: { id: 1, title_i18n: { en: 'Two Sum', ro: 'Suma a două' } },
          language: 'python3',
          verdict: 'AC',
          score: 100,
          submission_time: '2026-11-01T00:00:00Z',
        },
      ],
    });
    return;
  }

  const solutions = path.match(/^\/api\/v1\/community\/problems\/(\d+)\/solutions\/$/);
  if (req.method === 'GET' && solutions) {
    if (!sessionUser(req)) {
      json(res, 401, { detail: 'Authentication credentials were not provided.' });
      return;
    }
    json(res, 200, {
      count: 1,
      license: "Code stays the author's; the platform displays it under the Terms of Service submission grant.",
      results: [
        {
          id: 5,
          user: 'alice_e2e',
          language: 'python3',
          code: 'print(2)',
          execution_time_ms: 12,
          memory_used_kb: 2048,
          submission_time: '2026-11-01T00:00:00Z',
        },
      ],
    });
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/community/leaderboard/weekly/') {
    json(res, 200, {
      count: 1,
      window_days: 7,
      results: [{ rank: 1, user_id: 2, username: 'alice_e2e', solved: 3, points: 300 }],
    });
    return;
  }

  // Wave C (EDT-3/EDT-6): community editorials + article hub.
  const communityEditorials = path.match(
    /^\/api\/v1\/problems\/(\d+)\/community-editorials\/$/
  );
  if (req.method === 'GET' && communityEditorials) {
    json(res, 200, {
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 11,
          problem: Number(communityEditorials[1]),
          author: 2,
          author_username: 'creator_e2e',
          title: 'Two pointers, one pass',
          body: 'Walk inward from both ends.',
          lang: 'en',
          status: 'APPROVED',
          verifier_feedback: '',
          is_hidden: false,
          license: 'CC BY-SA 4.0',
          created_at: '2026-11-01T00:00:00Z',
          updated_at: '2026-11-01T00:00:00Z',
        },
      ],
    });
    return;
  }

  const relatedArticles = path.match(
    /^\/api\/v1\/problems\/(\d+)\/related-articles\/$/
  );
  if (req.method === 'GET' && relatedArticles) {
    json(res, 200, {
      count: 1,
      results: [
        {
          id: 1,
          title_i18n: { en: 'Hash tables 101', ro: 'Tabele de dispersie 101' },
          body_ro: 'Adresare deschisă.',
          body_en: 'Open addressing vs chaining.',
          tags: [{ slug: 'hashing' }],
          author: 2,
          author_username: 'creator_e2e',
          status: 'APPROVED',
          verifier_feedback: '',
          is_hidden: false,
          license: 'CC BY-SA 4.0',
          created_at: '2026-11-01T00:00:00Z',
          updated_at: '2026-11-01T00:00:00Z',
        },
      ],
    });
    return;
  }

  const articlesList = path === '/api/v1/problems/articles/';
  if (req.method === 'GET' && articlesList) {
    json(res, 200, {
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 1,
          title_i18n: { en: 'Hash tables 101', ro: 'Tabele de dispersie 101' },
          body_ro: 'Adresare deschisă.',
          body_en: 'Open addressing vs chaining.',
          tags: [{ slug: 'hashing' }],
          author: 2,
          author_username: 'creator_e2e',
          status: 'APPROVED',
          verifier_feedback: '',
          is_hidden: false,
          license: 'CC BY-SA 4.0',
          created_at: '2026-11-01T00:00:00Z',
          updated_at: '2026-11-01T00:00:00Z',
        },
      ],
    });
    return;
  }

  const articleDetail = path.match(/^\/api\/v1\/problems\/articles\/(\d+)\/$/);
  if (req.method === 'GET' && articleDetail) {
    json(res, 200, {
      id: 1,
      title_i18n: { en: 'Hash tables 101', ro: 'Tabele de dispersie 101' },
      body_ro: 'Adresare deschisă.',
      body_en: 'Open addressing vs chaining.',
      tags: [{ slug: 'hashing' }],
      author: 2,
      author_username: 'creator_e2e',
      status: 'APPROVED',
      verifier_feedback: '',
      is_hidden: false,
      license: 'CC BY-SA 4.0',
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-01T00:00:00Z',
    });
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/classroom/exam-mode/') {
    json(res, 200, { active: false, assignment: null });
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/classroom/assignments/my-assignments/') {
    if (!sessionUser(req)) {
      json(res, 401, { detail: 'Authentication credentials were not provided.' });
      return;
    }
    json(res, 200, MOCK_MY_ASSIGNMENTS);
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
