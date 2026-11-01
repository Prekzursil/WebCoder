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

export const REAL_API_BASE = process.env.E2E_API_BASE || "";
export const isRealStack = REAL_API_BASE.length > 0;

export const E2E_ADMIN_USER = process.env.E2E_ADMIN_USER || "admin";
export const E2E_ADMIN_PASS = process.env.E2E_ADMIN_PASS || "WebCoder-Admin-2026!";

export const E2E_USER = "e2e_tester";
export const E2E_USER_PASS = "correct-horse-battery-staple";

interface LoginResponse {
  access: string;
  refresh: string;
  user?: { pk?: number; username?: string };
}

// The API helper shuttles heterogeneous DRF payloads (login, paginated
// lists, error bodies); each consumer narrows the parts it reads.
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type AnyBody = any;

async function api(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<{ status: number; body: AnyBody }> {
  const { token, ...rest } = init;
  // e2e-only helper; `path` comes from spec code, never user input
  // (triage parity with real-stack.spec.ts #116/#117).
  // codeql[js/request-forgery]
  const res = await fetch(`${REAL_API_BASE}/api/v1${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...rest.headers,
    },
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : {} };
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const { status, body } = await api("/auth/login/", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  if (status !== 200) throw new Error(`login ${username} -> ${status}: ${JSON.stringify(body)}`);
  return body as LoginResponse;
}

/** Titles the fixtures own on the live stack. */
const SEED_TITLES = { twoSum: "Two Sum", reverse: "Reverse String" } as const;

async function findSeeded(): Promise<{ twoSum?: number; reverse?: number }> {
  const { status, body } = await api("/problems/problems/?page_size=100");
  if (status !== 200) return {};
  const rows: { id: number; title_i18n?: { en?: string } }[] = body.results ?? [];
  return {
    twoSum: rows.find((r) => r.title_i18n?.en === SEED_TITLES.twoSum)?.id,
    reverse: rows.find((r) => r.title_i18n?.en === SEED_TITLES.reverse)?.id,
  };
}

let seedPromise: Promise<{ twoSumId: number; reverseId: number }> | null = null;

async function seedOnce(): Promise<{ twoSumId: number; reverseId: number }> {
  const admin = await login(E2E_ADMIN_USER, E2E_ADMIN_PASS);
  const token = admin.access;

  // Register the fixture user (idempotent: 400 = already exists).
  await api("/auth/registration/", {
    method: "POST",
    body: JSON.stringify({
      username: E2E_USER,
      email: "e2e_tester@e2e.local",
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
      await api(`/problems/problems/${id}/`, { method: "DELETE", token });
    }
  }

  const createProblem = async (title: string, difficulty: string, statement: string) => {
    const { status, body } = await api("/problems/problems/", {
      method: "POST",
      token,
      body: JSON.stringify({
        title_i18n: { en: title, ro: title },
        statement_i18n: { en: statement, ro: statement },
        difficulty,
        status: "APPROVED",
        default_time_limit_ms: 1000,
        default_memory_limit_kb: 65536,
        allowed_languages: ["python3"],
        tags: [],
      }),
    });
    if (status !== 201) throw new Error(`seed ${title} -> ${status}: ${JSON.stringify(body)}`);
    return body.id as number;
  };

  const twoSumId = await createProblem(
    SEED_TITLES.twoSum,
    "EASY",
    "Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.",
  );
  const reverseId = await createProblem(SEED_TITLES.reverse, "MEDIUM", "Reverse the input string.");

  // Two Sum needs the sample testcase the detail spec pins.
  const tc = await api("/problems/testcases/", {
    method: "POST",
    token,
    body: JSON.stringify({
      problem: twoSumId,
      input_data: "[2,7,11,15]\n9",
      expected_output_data: "[0,1]",
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
    const found = await findSeeded();
    for (const id of [found.twoSum, found.reverse]) {
      if (id !== undefined) {
        await api(`/problems/problems/${id}/`, { method: "DELETE", token: admin.access });
      }
    }
  } catch {
    // Teardown is best-effort; the next run self-heals partial leftovers.
  }
}
