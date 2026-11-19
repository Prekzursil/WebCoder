#!/usr/bin/env node
// Item 138 (wave G section J) — OPR-4 load-test harness: a synthetic
// N-user submission replay against a REAL backend (the live docker
// stack or any API base URL). Zero npm dependencies.
//
// Each virtual user: logs in (JWT), submits a tiny solution, polls the
// verdict until terminal, records the wait. Summary = p50/p95 wait +
// throughput + the OPR-4 exit-gate verdict (p95 < 20 s).
//
// Usage:
//   node e2e/loadtest/replay.mjs --api http://127.0.0.1:8010 \
//     --users 30 --submissions 5 --problem 1 \
//     --password 'BobPass-2026!x' --prefix bob
// The harness derives usernames <prefix>01..<prefix>NN; seed them first
// (scripts/seed-loadtest-users.py) or point --prefix at an existing
// numeric family.

import { summarize, throughput } from './lib-stats.mjs';

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

const API = arg('api', 'http://127.0.0.1:8010');
const USERS = Number(arg('users', 30));
const PER_USER = Number(arg('submissions', 5));
const PROBLEM = Number(arg('problem', 1));
const PASSWORD = arg('password', 'BobPass-2026!x');
const PREFIX = arg('prefix', 'load');
const TIMEOUT_MS = Number(arg('timeout', 120000));

const TERMINAL = new Set(['AC', 'WA', 'TLE', 'MLE', 'RE', 'CE', 'SK']);

async function login(username) {
  const response = await fetch(`${API}/api/v1/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  if (!response.ok) throw new Error(`login ${username}: ${response.status}`);
  const body = await response.json();
  return body.access;
}

async function submit(token) {
  const response = await fetch(`${API}/api/v1/submissions/submit/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      problem: PROBLEM,
      language: 'python3',
      code: 'n = int(input())\nprint(max(0, n))\n',
    }),
  });
  if (!response.ok) throw new Error(`submit: ${response.status}`);
  return (await response.json()).id;
}

async function awaitVerdict(token, id) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const response = await fetch(`${API}/api/v1/submissions/submissions/${id}/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      const body = await response.json();
      const verdict = body.verdict ?? body.result;
      if (TERMINAL.has(verdict)) return verdict;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return 'TIMEOUT';
}

async function virtualUser(index, waits, errors) {
  const username = `${PREFIX}${String(index + 1).padStart(2, '0')}`;
  try {
    const token = await login(username);
    for (let i = 0; i < PER_USER; i += 1) {
      const started = Date.now();
      const id = await submit(token);
      const verdict = await awaitVerdict(token, id);
      waits.push(Date.now() - started);
      if (verdict === 'TIMEOUT') errors.push(`${username}: #${id} timed out`);
    }
  } catch (error) {
    errors.push(`${username}: ${error.message}`);
  }
}

const waits = [];
const errors = [];
const startedAt = Date.now();
const workers = Array.from({ length: USERS }, (_, i) => virtualUser(i, waits, errors));
await Promise.all(workers);
const elapsed = Date.now() - startedAt;

const summary = summarize(waits);
const report = {
  api: API,
  users: USERS,
  submissions_per_user: PER_USER,
  completed: summary.count,
  failed: errors.length,
  elapsed_ms: elapsed,
  req_per_s: throughput(summary.count, elapsed),
  wait: summary,
  errors: errors.slice(0, 20),
};

console.log(JSON.stringify(report, null, 2));
if (errors.length || summary.count === 0 || !summary.gate_p95_under_20s) {
  console.error('LOAD GATE: FAIL (OPR-4: p95 judge wait must be < 20s with zero failures)');
  process.exit(1);
}
console.log('LOAD GATE: PASS (p95 < 20s, zero failures)');
