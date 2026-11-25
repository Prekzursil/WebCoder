// Real-backend e2e helpers [Q13].
//
// When playwright.config runs with E2E_API_BASE set, these helpers seed the
// live Django stack (RUNBOOK Mode A compose: backend + celery-worker +
// judge-runner) with the fixtures the existing specs expect, and the
// real-stack spec drives a full login → submit → judged-verdict round-trip.
// In default (mock) mode every helper is inert and the fixtures resolve to
// the mock API's canned values, so CI stays hermetic.
//
// Seed lifecycle: seeding is IDEMPOTENT and self-healing (an existing
// Two Sum / Reverse String pair is reused, so multiple spec files — and
// repeated runs — converge on the same live ids). Teardown runs ONCE per
// run from playwright.config's globalTeardown, never per file: deleting
// seeds mid-run breaks whichever spec file runs next (found the hard way —
// a per-file afterAll cleanup raced the next file's memoized ids).

export const REAL_API_BASE = process.env.E2E_API_BASE || '';
export const isRealStack = REAL_API_BASE.length > 0;

export const E2E_ADMIN_USER = process.env.E2E_ADMIN_USER || 'admin';
export const E2E_ADMIN_PASS = process.env.E2E_ADMIN_PASS || 'WebCoder-Admin-2026!';

export const E2E_USER = 'e2e_tester';
export const E2E_USER_PASS = 'correct-horse-battery-staple';

interface LoginResponse {
  access: string;
  refresh: string;
  user?: { pk?: number; username?: string };
}

// The API helper shuttles heterogeneous DRF payloads (login, paginated
// lists, error bodies); each consumer narrows the parts it reads.
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type AnyBody = any;

// Exported since blocks-real.spec.ts seeds its own blockly proof problem
// through the same transport.
export async function api(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<{ status: number; body: AnyBody }> {
  const { token, ...rest } = init;
  // Built imperatively: a conditional/empty-object spread fallback is exactly
  // what unicorn/no-useless-fallback-in-spread rejects (the lean gate runs
  // oxlint with --deny-warnings), and Object.assign skips a missing
  // rest.headers without one.
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  Object.assign(headers, rest.headers);
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${REAL_API_BASE}/api/v1${path}`, {
    ...rest,
    headers,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : {} };
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  // The stack's scoped auth throttle (10/min) is by design; the real-mode
  // suite performs several logins per spec file, so a cold run can trip it.
  // Respect Retry-After instead of failing: back off and try again.
  for (let attempt = 0; ; attempt++) {
    const { status, body } = await api('/auth/login/', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (status === 200) return body as LoginResponse;
    if (status === 429 && attempt < 3) {
      const retryAfter = Number(body?.retryAfter ?? body?.detail?.retryAfter ?? 30);
      await new Promise((r) => setTimeout(r, Math.min(retryAfter, 65) * 1000));
      continue;
    }
    throw new Error(`login ${username} -> ${status}: ${JSON.stringify(body)}`);
  }
}

/** Titles the fixtures own on the live stack. */
const SEED_TITLES = { twoSum: 'Two Sum', reverse: 'Reverse String' } as const;

/** The blockly proof problem blocks-real.spec.ts seeds (same ownership rules). */
export const BLOCKLY_SEED_TITLE = 'E2E Blockly Real Last Digit';

/**
 * Find rows by exact title via the server-side ?search= filter (#320) —
 * NOT by listing page 1 of the catalog. The live catalog has 1_800+
 * problems, so a page-size scan stopped seeing earlier seeds and every
 * real-mode run re-created the pair (the "Reverse String ×8" pollution
 * found by the 2026-11-20 polish sweep). Returns EVERY matching id so
 * teardown can sweep them all; seeding reuses the first.
 */
async function findAllByTitle(title: string, token?: string): Promise<number[]> {
  const { status, body } = await api(
    `/problems/problems/?search=${encodeURIComponent(title)}&page_size=100`,
    token ? { token } : {},
  );
  if (status !== 200) return [];
  const rows: { id: number; title_i18n?: { en?: string } }[] = body.results ?? [];
  return rows.filter((r) => r.title_i18n?.en === title).map((r) => r.id);
}

async function findSeeded(): Promise<{ twoSum?: number; reverse?: number }> {
  const [twoSum, reverse] = await Promise.all([
    findAllByTitle(SEED_TITLES.twoSum),
    findAllByTitle(SEED_TITLES.reverse),
  ]);
  return { twoSum: twoSum[0], reverse: reverse[0] };
}

let seedPromise: Promise<{ twoSumId: number; reverseId: number }> | null = null;

async function seedOnce(): Promise<{ twoSumId: number; reverseId: number }> {
  const admin = await login(E2E_ADMIN_USER, E2E_ADMIN_PASS);
  const token = admin.access;

  // Register the fixture user (idempotent: 400 = already exists).
  await api('/auth/registration/', {
    method: 'POST',
    body: JSON.stringify({
      username: E2E_USER,
      email: 'e2e_tester@e2e.local',
      password1: E2E_USER_PASS,
      password2: E2E_USER_PASS,
    }),
  }).catch(() => ({}));

  // Self-heal: a previous run (or another spec file) may have left the
  // pair live — reuse those ids so every file converges on the same rows.
  const found = await findSeeded();
  if (found.twoSum && found.reverse) {
    return { twoSumId: found.twoSum, reverseId: found.reverse };
  }
  // Partial leftovers: delete and recreate the whole pair atomically.
  for (const id of [found.twoSum, found.reverse]) {
    if (id !== undefined) {
      await api(`/problems/problems/${id}/`, { method: 'DELETE', token });
    }
  }

  // provenance (optional per-problem) powers the [RO-6] archive-axis
  // spec on the real stack exactly like the mock fixture. Spreading the
  // optional object directly (no `?? {}` fallback) — oxlint's
  // no-useless-fallback-in-spread is denied at the quality gate.
  const createProblem = async (
    title: string,
    difficulty: string,
    statement: string,
    provenance?: { source_contest: string; source_year: number; grade_group: string },
  ) => {
    const { status, body } = await api('/problems/problems/', {
      method: 'POST',
      token,
      body: JSON.stringify({
        title_i18n: { en: title, ro: title },
        statement_i18n: { en: statement, ro: statement },
        difficulty,
        status: 'APPROVED',
        default_time_limit_ms: 1000,
        default_memory_limit_kb: 65536,
        allowed_languages: ['python3'],
        tags: [],
        ...provenance,
      }),
    });
    if (status !== 201) throw new Error(`seed ${title} -> ${status}: ${JSON.stringify(body)}`);
    return body.id as number;
  };

  const twoSumId = await createProblem(
    SEED_TITLES.twoSum,
    'EASY',
    'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
    { source_contest: 'OJI 2024', source_year: 2024, grade_group: 'IX-X' },
  );
  const reverseId = await createProblem(SEED_TITLES.reverse, 'MEDIUM', 'Reverse the input string.');

  // Two Sum needs the sample testcase the detail spec pins.
  const tc = await api('/problems/testcases/', {
    method: 'POST',
    token,
    body: JSON.stringify({
      problem: twoSumId,
      input_data: '[2,7,11,15]\n9',
      expected_output_data: '[0,1]',
      is_sample: true,
      points: 10,
    }),
  });
  if (tc.status !== 201)
    throw new Error(`seed testcase -> ${tc.status}: ${JSON.stringify(tc.body)}`);

  return { twoSumId, reverseId };
}

/**
 * Idempotent seeding of the fixtures the existing specs assume (mock mode:
 * resolves to the mock API's fixed ids). Memoized per worker process; a new
 * worker re-heals from the live state, so cross-file races are impossible.
 */
export function ensureRealStackFixtures(): Promise<{ twoSumId: number; reverseId: number }> {
  if (!isRealStack) {
    return Promise.resolve({ twoSumId: 1, reverseId: 2 });
  }
  if (!seedPromise) {
    seedPromise = seedOnce().catch((err) => {
      seedPromise = null; // allow retry on next test file
      throw err;
    });
  }
  return seedPromise;
}

/** Delete the seeded pair — called ONCE from globalTeardown, not per file. */
export async function teardownRealStackFixtures(): Promise<void> {
  if (!isRealStack) return;
  try {
    const admin = await login(E2E_ADMIN_USER, E2E_ADMIN_PASS);
    // Sweep EVERY row carrying a seed title — runs before the #320 search
    // fix leaked one pair per real-mode run, so old pollution must go too.
    const ids = (
      await Promise.all([
        findAllByTitle(SEED_TITLES.twoSum, admin.access),
        findAllByTitle(SEED_TITLES.reverse, admin.access),
        findAllByTitle(BLOCKLY_SEED_TITLE, admin.access),
      ])
    ).flat();
    for (const id of ids) {
      await api(`/problems/problems/${id}/`, { method: 'DELETE', token: admin.access });
    }
  } catch {
    // Teardown is best-effort; the next run self-heals partial leftovers.
  }
}
