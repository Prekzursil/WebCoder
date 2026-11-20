// E2E: REAL-BACKEND COM-5 messaging loop [Q13 pattern] — runs only when
// E2E_API_BASE points at the live compose stack. Nothing is mocked: real
// JWT logins, a real 1:1 thread, the real RO+EN content filter
// (flag-not-block), the real MESSAGE_RECEIVED notification, a real report
// into the moderator queue and a real moderator resolution — the exact
// safety loop the 2026-10-30 owner reversal demanded ship WITH the feature.

import { test, expect } from '@playwright/test';
import {
  REAL_API_BASE,
  isRealStack,
  login,
  E2E_ADMIN_USER,
  E2E_ADMIN_PASS,
  E2E_USER,
  E2E_USER_PASS,
} from './lib/realStack';

test.skip(
  !isRealStack,
  `real-stack mode only — set E2E_API_BASE to the API origin with the SAME hostname as the dev server (http://localhost:8010; cookies are SameSite=Lax)`,
);

const PEER_USER = 'e2e_peer';
const PEER_PASS = 'peer-horse-battery-staple';

async function api(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { token, ...rest } = init;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  Object.assign(headers, rest.headers);
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${REAL_API_BASE}/api/v1${path}`, { ...rest, headers });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : {} };
}

let adminToken: string;
let peerToken: string;

test.beforeAll(async () => {
  // Register the peer fixture (idempotent: 400 = already exists).
  await api('/auth/registration/', {
    method: 'POST',
    body: JSON.stringify({
      username: PEER_USER,
      email: 'e2e_peer@e2e.local',
      password1: PEER_PASS,
      password2: PEER_PASS,
    }),
  });
  adminToken = (await login(E2E_ADMIN_USER, E2E_ADMIN_PASS)).access;
  peerToken = (await login(PEER_USER, PEER_PASS)).access;
});

test('COM-5 real loop: thread → send → filter flag → notification → report → resolve', async ({
  page,
}) => {
  // 1) PEER starts (or fetches) the 1:1 thread with e2e_tester, then sends
  //    a grooming-pattern message — the filter must FLAG it, not block it.
  const stamp = Date.now().toString().slice(-6);
  const thread = await api('/messages/threads/', {
    method: 'POST',
    token: peerToken,
    body: JSON.stringify({ username: E2E_USER }),
  });
  expect(thread.status).toBeLessThan(300); // 201 created or 200 existing
  const threadId = thread.body.id as number;

  // The thread persists across runs — any unread messages a previous
  // (possibly interrupted) run left behind would break the strict
  // "1 unread" badge below. Mark the thread read as the recipient first.
  const testerToken = (await login(E2E_USER, E2E_USER_PASS)).access;
  await api(`/messages/threads/${threadId}/read/`, { method: 'POST', token: testerToken });

  const sent = await api(`/messages/threads/${threadId}/send/`, {
    method: 'POST',
    token: peerToken,
    body: JSON.stringify({ body: `how old are you? marker-${stamp}` }),
  });
  expect(sent.status).toBe(201); // delivered — flag-not-block

  // 2) The flagged queue (moderator view) carries the hit with its category.
  const flagged = await api('/messages/moderation/flagged/', { token: adminToken });
  expect(flagged.status).toBe(200);
  const flaggedRow = (
    flagged.body.results as Array<{ body: string; flag_categories: string[] }>
  ).find((row) => row.body.includes(`marker-${stamp}`));
  expect(flaggedRow).toBeTruthy();
  expect(flaggedRow?.flag_categories).toContain('grooming');

  // 3) E2E_TESTER logs in through the UI: unread badge, then the message
  //    body renders as TEXT, and the notification names the sender.
  await page.goto('/login');
  await page.fill('#login-username', E2E_USER);
  await page.fill('#login-password', E2E_USER_PASS);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByText(E2E_USER, { exact: true })).toBeVisible();

  await page.goto('/messages');
  await expect(page.getByTestId(`msg-thread-${threadId}`)).toBeVisible();
  await expect(page.getByLabel('1 unread')).toBeVisible();

  await page.goto(`/messages/${threadId}`);
  await expect(page.getByText(`how old are you? marker-${stamp}`)).toBeVisible();

  await page.goto('/notifications');
  const row = page
    .locator('li, article, div')
    .filter({ hasText: `${PEER_USER} sent you a message` })
    .first();
  await expect(row).toBeVisible();

  // 4) REPORT the flagged message from the thread page.
  await page.goto(`/messages/${threadId}`);
  const bubbles = page.locator('[data-testid^="msg-report-btn-"]');
  await bubbles.last().click();
  await page.getByTestId('msg-report-reason-GROOMING').click();
  await expect(page.getByTestId('msg-notice')).toContainText(/review/i);

  // 5) The report is OPEN in the moderator queue; the ADMIN resolves it,
  //    and the report-gated transcript for the thread unseals.
  await page.waitForTimeout(300); // report committed on the previous action
  const reports = await api('/messages/moderation/reports/?status=OPEN', {
    token: adminToken,
  });
  const report = (reports.body.results as Array<{ id: number; message: { body: string } }>).find(
    (r) => r.message.body.includes(`marker-${stamp}`),
  );
  expect(report).toBeTruthy();

  const resolved = await api(`/messages/moderation/reports/${report?.id}/resolve/`, {
    method: 'POST',
    token: adminToken,
    body: JSON.stringify({ action: 'resolved', note: 'real-stack e2e' }),
  });
  expect(resolved.status).toBe(200);
  expect(resolved.body.status).toBe('RESOLVED');

  const transcript = await api(`/messages/admin/threads/${threadId}/transcript/`, {
    token: adminToken,
  });
  expect(transcript.status).toBe(200); // the explicit report unsealed it
  const bodies = (transcript.body.messages as Array<{ body: string }>).map((m) => m.body);
  expect(bodies.some((body) => body.includes(`marker-${stamp}`))).toBe(true);
});
