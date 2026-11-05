#!/usr/bin/env python3
"""One-shot patcher: adds COM-5 mock state + routes to e2e/mock-api/server.mjs."""

p = "e2e/mock-api/server.mjs"
s = open(p, encoding="utf-8").read()

# 1) readBody helper after the json() helper.
anchor = """function sessionUser(req) {"""
helper = """function readBody(req, done) {
  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
  });
  req.on('end', () => {
    let parsed = {};
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch {
      parsed = {};
    }
    done(parsed);
  });
}

function sessionUser(req) {"""
assert anchor in s
s = s.replace(anchor, helper, 1)

# 2) COM-5 mock state after the OPS-2 state block.
anchor = """const totpState = { secret: '', enabled: false };
const apiTokenState = { key: null };"""
addition = (
    anchor
    + """

// COM-5 mock state: one live conversation (e2e_tester <-> admin_e2e) plus
// the reporting/moderation flow's mutable pieces (reports queue, blocks,
// message-received notifications). Message 2 carries an HTML snippet the
// chat must render as literal TEXT (the XSS-safe contract).
const messagingState = {
  conversation: {
    id: 1,
    other_user: { id: 2, username: 'admin_e2e' },
    unread_count: 1,
    last_message: { sender_id: 2, excerpt: 'third message', created_at: '2026-10-29T09:00:00Z' },
    created_at: '2026-10-29T08:00:00Z',
    updated_at: '2026-10-29T09:00:00Z',
  },
  messages: [
    { id: 1, sender: { id: 1, username: 'e2e_tester' }, body: 'hello admin', created_at: '2026-10-29T08:30:00Z', read_at: '2026-10-29T08:31:00Z' },
    { id: 2, sender: { id: 2, username: 'admin_e2e' }, body: '<script>alert(1)</script> try this', created_at: '2026-10-29T08:45:00Z', read_at: null },
    { id: 3, sender: { id: 2, username: 'admin_e2e' }, body: 'third message', created_at: '2026-10-29T09:00:00Z', read_at: null },
  ],
  reports: [],
  blocks: [],
  notifications: [
    {
      id: 50,
      verb: 'MESSAGE_RECEIVED',
      actor: 'admin_e2e',
      target_type: 'message',
      target_id: 3,
      data: { conversation_id: 1, message_id: 3, excerpt: 'third message' },
      read_at: null,
      created_at: '2026-10-29T09:00:05Z',
    },
  ],
};"""
)
assert anchor in s
s = s.replace(anchor, addition, 1)

# 3) Routes ahead of the final 404.
anchor = """  json(res, 404, { detail: `No mock for ${req.method} ${path}` });"""
routes = """  // ---- COM-5 private messaging (threads, history, send, read) ----
  if (req.method === 'GET' && path === '/api/v1/messages/threads/') {
    json(res, 200, { count: 1, next: null, previous: null, results: [messagingState.conversation] });
    return;
  }
  if (req.method === 'GET' && path === '/api/v1/messages/threads/1/') {
    json(res, 200, messagingState.conversation);
    return;
  }
  if (req.method === 'GET' && path === '/api/v1/messages/threads/1/messages/') {
    json(res, 200, cursorPaged([...messagingState.messages].reverse()));
    return;
  }
  if (req.method === 'POST' && path === '/api/v1/messages/threads/1/read/') {
    for (const m of messagingState.messages) {
      if (m.sender.id !== 1) m.read_at = '2026-10-29T10:00:00Z';
    }
    messagingState.conversation.unread_count = 0;
    json(res, 200, { marked_read: 2 });
    return;
  }
  const sendMatch = path.match(/^\\/api\\/v1\\/messages\\/threads\\/(\\d+)\\/send\\/$/);
  if (req.method === 'POST' && sendMatch) {
    readBody(req, (body) => {
      const text = String(body.body ?? '').slice(0, 4000);
      const message = {
        id: 100 + messagingState.messages.length,
        sender: { id: 1, username: 'e2e_tester' },
        body: text,
        created_at: new Date().toISOString(),
        read_at: null,
      };
      messagingState.messages.push(message);
      messagingState.conversation.last_message = {
        sender_id: 1,
        excerpt: text.slice(0, 120),
        created_at: message.created_at,
      };
      messagingState.notifications.unshift({
        id: 100 + messagingState.notifications.length,
        verb: 'MESSAGE_RECEIVED',
        actor: 'e2e_tester',
        target_type: 'message',
        target_id: message.id,
        data: { conversation_id: Number(sendMatch[1]), message_id: message.id, excerpt: text.slice(0, 80) },
        read_at: null,
        created_at: message.created_at,
      });
      json(res, 201, message);
    });
    return;
  }
  const msgReportMatch = path.match(/^\\/api\\/v1\\/messages\\/messages\\/(\\d+)\\/report\\/$/);
  if (req.method === 'POST' && msgReportMatch) {
    readBody(req, (body) => {
      const messageId = Number(msgReportMatch[1]);
      if (messagingState.reports.some((r) => r.message.id === messageId && r.reporter.id === 1)) {
        json(res, 409, { detail: 'You already reported this message.' });
        return;
      }
      const message = messagingState.messages.find((m) => m.id === messageId);
      const report = {
        id: 20 + messagingState.reports.length,
        message,
        reporter: { id: 1, username: 'e2e_tester' },
        reason: body.reason ?? 'OTHER',
        details: body.details ?? '',
        status: 'OPEN',
        resolution_note: '',
        resolved_by: null,
        created_at: new Date().toISOString(),
      };
      messagingState.reports.push(report);
      json(res, 201, report);
    });
    return;
  }
  // Blocks (mute list).
  if (req.method === 'GET' && path === '/api/v1/messages/blocks/') {
    json(res, 200, { count: messagingState.blocks.length, next: null, previous: null, results: messagingState.blocks });
    return;
  }
  if (req.method === 'POST' && path === '/api/v1/messages/blocks/') {
    readBody(req, () => {
      if (!messagingState.blocks.some((b) => b.blocked.id === 2)) {
        messagingState.blocks.push({
          id: 30 + messagingState.blocks.length,
          blocked: { id: 2, username: 'admin_e2e' },
          created_at: new Date().toISOString(),
        });
      }
      json(res, 201, messagingState.blocks[messagingState.blocks.length - 1]);
    });
    return;
  }
  if (req.method === 'DELETE' && path === '/api/v1/messages/blocks/2/') {
    messagingState.blocks = messagingState.blocks.filter((b) => b.blocked.id !== 2);
    res.writeHead(204, res._corsHeaders ?? {});
    res.end();
    return;
  }
  // Moderation queue (reports list, resolve/dismiss, flagged stub).
  if (req.method === 'GET' && path === '/api/v1/messages/moderation/reports/') {
    const status = requestUrl.searchParams.get('status');
    const reports = status ? messagingState.reports.filter((r) => r.status === status) : messagingState.reports;
    json(res, 200, { count: reports.length, next: null, previous: null, results: reports });
    return;
  }
  const resolveMatch = path.match(/^\\/api\\/v1\\/messages\\/moderation\\/reports\\/(\\d+)\\/resolve\\/$/);
  if (req.method === 'POST' && resolveMatch) {
    readBody(req, (body) => {
      const report = messagingState.reports.find((r) => r.id === Number(resolveMatch[1]));
      if (!report) {
        json(res, 404, { detail: 'Not found.' });
        return;
      }
      if (body.action !== 'resolved' && body.action !== 'dismissed') {
        json(res, 400, { action: "Must be 'resolved' or 'dismissed'." });
        return;
      }
      report.status = body.action === 'resolved' ? 'RESOLVED' : 'DISMISSED';
      report.resolution_note = body.note ?? '';
      report.resolved_by = { id: 2, username: 'admin_e2e' };
      json(res, 200, report);
    });
    return;
  }
  if (req.method === 'GET' && path === '/api/v1/messages/moderation/flagged/') {
    json(res, 200, { count: 0, next: null, previous: null, results: [] });
    return;
  }

  json(res, 404, { detail: `No mock for ${req.method} ${path}` });"""
assert anchor in s
s = s.replace(anchor, routes, 1)

# 4) Fold the messaging notifications into the notifications list +
#    unread-count so the bell + page see MESSAGE_RECEIVED rows.
anchor = """  if (req.method === 'GET' && path === '/api/v1/notifications/') {
    if (!sessionUser(req)) {
      json(res, 401, { detail: 'Authentication credentials were not provided.' });
      return;
    }
    json(res, 200, cursorPaged(MOCK_NOTIFICATIONS));
    return;
  }"""
replacement = """  if (req.method === 'GET' && path === '/api/v1/notifications/') {
    if (!sessionUser(req)) {
      json(res, 401, { detail: 'Authentication credentials were not provided.' });
      return;
    }
    json(res, 200, cursorPaged([...messagingState.notifications, ...MOCK_NOTIFICATIONS]));
    return;
  }"""
assert anchor in s
s = s.replace(anchor, replacement, 1)

anchor = """    json(res, 200, { count: MOCK_NOTIFICATIONS.filter((n) => n.read_at === null).length });
    return;
  }"""
replacement = """    json(res, 200, {
      count:
        MOCK_NOTIFICATIONS.filter((n) => n.read_at === null).length +
        messagingState.notifications.filter((n) => n.read_at === null).length,
    });
    return;
  }"""
assert anchor in s
s = s.replace(anchor, replacement, 1)

open(p, "w", encoding="utf-8", newline="\n").write(s)
print("mock server patched")
