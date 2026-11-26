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
    // DMOJ "has editorial" facet: this fixture has none.
    has_editorial: false,
    // [roadmap RO-6] archive provenance for the browse-axis e2e lane.
    source_contest: 'OJI 2024',
    source_year: 2024,
    grade_group: 'IX-X',
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
        // Wave G item 86: localized sample comments.
        comment_en: 'The classic pair.',
        comment_ro: 'Perechea clasică.',
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
    // Problem-page wave (items C/D/F): solver-facing state on the detail
    // payload — tiered hints, unlock board economics, forfeit flag.
    target_points: 120,
    point_bounds: [50, 200],
    hint_state: {
      total: 2,
      revealed_count: 0,
      tiers: [
        { tier: 1, kind: 'NUDGE', revealed: false, content: null, image: null },
        { tier: 2, kind: 'STRONGER', revealed: false, content: null, image: null },
      ],
    },
    forfeited: false,
  },
  {
    id: 8,
    title_i18n: { en: 'Sum digits (template)', ro: 'Suma cifrelor (șablon)' },
    difficulty: 'EASY',
    status: 'APPROVED',
    // Wave E fixture: partial-code problem — complete sum_digits between
    // the sentinels; the scaffolding is locked and server-verified.
    statement_i18n: {
      en: 'Complete sum_digits(int n) so it returns the sum of the digits.',
      ro: 'Completează sum_digits(int n) astfel încât să returneze suma cifrelor.',
    },
    default_time_limit_ms: 1000,
    default_memory_limit_kb: 262144,
    allowed_languages: ['cpp17'],
    code_template_language: 'cpp17',
    code_template: [
      '#include <cstdio>',
      '',
      'int sum_digits(int n) {',
      '    // WC_EDIT_START',
      '    // TODO: your code here',
      '    // WC_EDIT_END',
      '}',
      '',
      'int main() {',
      '    int n;',
      '    scanf("%d", &n);',
      '    printf("%d", sum_digits(n));',
      '    return 0;',
      '}',
    ].join('\n'),
  },
  {
    id: 7,
    title_i18n: { en: 'Last Digit (blocks)', ro: 'Ultima cifră (blocuri)' },
    difficulty: 'VERY_EASY',
    status: 'APPROVED',
    // Wave D fixture: a block-programming problem (Blockly -> python3)
    // submitted through the normal judge pipeline.
    statement_i18n: {
      en: 'Read n and print its last digit.',
      ro: 'Citește n și afișează ultima sa cifră.',
    },
    default_time_limit_ms: 1000,
    default_memory_limit_kb: 262144,
    allowed_languages: ['python3'],
    block_config: {
      generator: 'python3',
    },
    test_cases: [
      { id: 71, input_data: '42', expected_output_data: '2', is_sample: true, points: 10 },
    ],
  },
  {
    id: 12,
    title_i18n: { en: 'Echo (Scratch)', ro: 'Ecou (Scratch)' },
    difficulty: 'VERY_EASY',
    status: 'APPROVED',
    // Wave D engine-2 fixture: a Scratch problem. Submissions carry the
    // sb3 project JSON under language 'scratch'; the judge transpiles it
    // to Python (see backend/problems/scratch_transpiler.py).
    statement_i18n: {
      en: 'Scratch: ask for a line, then say it back.',
      ro: 'Scratch: cere o linie, apoi spune-o înapoi.',
    },
    default_time_limit_ms: 1000,
    default_memory_limit_kb: 262144,
    allowed_languages: ['scratch'],
    block_config: {
      engine: 'scratch',
      scratch_blocks: [
        'event_whenflagclicked',
        'sensing_askandwait',
        'sensing_answer',
        'looks_say',
      ],
    },
    effective_limits: {
      scratch: { time_ms: 3000, memory_kb: 393216 },
    },
    test_cases: [
      { id: 81, input_data: 'hello', expected_output_data: 'hello', is_sample: true, points: 10 },
    ],
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
    id: 5,
    title_i18n: { en: 'Sum of Array', ro: 'Suma unui vector' },
    // Problem-page wave: the authoring fixture — EASY band, declared point
    // value, threshold-metadata tests, hint tiers, unlock/forfeit state.
    difficulty: 'EASY',
    status: 'DRAFT',
    target_points: 50,
    point_bounds: [10, 50],
    statement_i18n: {
      en: '## Story\n\nSum the array.\n\n## Constraints\n\n- $1 \\le n \\le 100$',
      ro: '',
    },
    default_time_limit_ms: 1000,
    default_memory_limit_kb: 262144,
    allowed_languages: ['PYTHON', 'CPP'],
    tags: [{ id: 1, name_i18n: { en: 'Arrays' }, slug: 'arrays' }],
    test_cases: [
      {
        id: 501,
        input_data: '3\n1 2 3\n',
        expected_output_data: '6\n',
        is_sample: true,
        points: 20,
        order: 1,
        input_size: 8,
        expected_size: 2,
        input_editable: true,
        expected_editable: true,
      },
      {
        id: 502,
        input_data: '5\n10 20 30 40 50\n',
        expected_output_data: '150\n',
        is_sample: false,
        points: 20,
        order: 2,
        input_size: 16,
        expected_size: 4,
        input_editable: true,
        expected_editable: true,
      },
    ],
    hints_en: ['Consider a running total.', 'One pass is enough.', 'Prefix sums or a simple loop.'],
    hints_ro: [],
    hint_state: {
      total: 3,
      revealed_count: 0,
      tiers: [
        { tier: 1, kind: 'NUDGE', revealed: false, content: null, image: null },
        { tier: 2, kind: 'STRONGER', revealed: false, content: null, image: null },
        { tier: 3, kind: 'APPROACH', revealed: false, content: null, image: null },
      ],
    },
    forfeited: false,
    unlock_state: { passed_count: 0, unlocked_index: 1, total: 3, solved_all: false },
    has_editorial: false,
    editorial_locked: false,
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

// i18n community translations (owner rule (c)): the translatable catalog
// mirrors backend/webcoder_api/languages.py TRANSLATABLE_LANGUAGES (all 30
// SUPPORTED_LANGUAGES minus the mandatory English source), plus the
// stateful proposal store the propose → curate → visible spec drives.
const TRANSLATABLE_LANGUAGES = [
  { code: 'ro', endonym: 'Română', english: 'Romanian' },
  { code: 'es', endonym: 'Español', english: 'Spanish' },
  { code: 'fr', endonym: 'Français', english: 'French' },
  { code: 'de', endonym: 'Deutsch', english: 'German' },
  { code: 'pt', endonym: 'Português', english: 'Portuguese' },
  { code: 'it', endonym: 'Italiano', english: 'Italian' },
  { code: 'ca', endonym: 'Català', english: 'Catalan' },
  { code: 'nl', endonym: 'Nederlands', english: 'Dutch' },
  { code: 'pl', endonym: 'Polski', english: 'Polish' },
  { code: 'hu', endonym: 'Magyar', english: 'Hungarian' },
  { code: 'hr', endonym: 'Hrvatski', english: 'Croatian' },
  { code: 'sr-Latn', endonym: 'Srpski (latinica)', english: 'Serbian (Latin)' },
  { code: 'lt', endonym: 'Lietuvių', english: 'Lithuanian' },
  { code: 'ru', endonym: 'Русский', english: 'Russian' },
  { code: 'uk', endonym: 'Українська', english: 'Ukrainian' },
  { code: 'bg', endonym: 'Български', english: 'Bulgarian' },
  { code: 'el', endonym: 'Ελληνικά', english: 'Greek' },
  { code: 'zh-Hans', endonym: '简体中文', english: 'Chinese (Simplified)' },
  { code: 'zh-Hant', endonym: '繁體中文', english: 'Chinese (Traditional)' },
  { code: 'ja', endonym: '日本語', english: 'Japanese' },
  { code: 'ko', endonym: '한국어', english: 'Korean' },
  { code: 'hi', endonym: 'हिन्दी', english: 'Hindi' },
  { code: 'vi', endonym: 'Tiếng Việt', english: 'Vietnamese' },
  { code: 'th', endonym: 'ไทย', english: 'Thai' },
  { code: 'id', endonym: 'Bahasa Indonesia', english: 'Indonesian' },
  { code: 'tr', endonym: 'Türkçe', english: 'Turkish' },
  { code: 'kk', endonym: 'Қазақша', english: 'Kazakh' },
  { code: 'ar', endonym: 'العربية', english: 'Arabic' },
  { code: 'fa', endonym: 'فارسی', english: 'Persian' },
];
const translationsState = { nextId: 1, proposals: [] };

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
    {
      id: 1,
      sender: { id: 1, username: 'e2e_tester' },
      body: 'hello admin',
      created_at: '2026-10-29T08:30:00Z',
      read_at: '2026-10-29T08:31:00Z',
    },
    {
      id: 2,
      sender: { id: 2, username: 'admin_e2e' },
      body: '<script>alert(1)</script> try this',
      created_at: '2026-10-29T08:45:00Z',
      read_at: null,
    },
    {
      id: 3,
      sender: { id: 2, username: 'admin_e2e' },
      body: 'third message',
      created_at: '2026-10-29T09:00:00Z',
      read_at: null,
    },
  ],
  reports: [],
  blocks: [],
  // Auto-flagged (flag-not-block) messages: delivered, queued for review.
  flagged: [
    {
      id: 2,
      conversation: 1,
      sender: { id: 2, username: 'admin_e2e' },
      body: 'ne intalnim singuri? <script>alert(1)</script>',
      flag_categories: ['grooming'],
      created_at: '2026-10-29T08:45:00Z',
    },
  ],
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
};

const virtualStarted = new Set();

// Wave F recognition fixtures (items 67-69).
const MOCK_AWARDS = [
  {
    id: 1,
    username: 'e2e_tester',
    kind: 'HELPING_HAND',
    reason: 'WA queue hero',
    period: '',
    created_at: '2026-11-12T10:00:00Z',
  },
];

const MOCK_AMAS = [
  {
    id: 1,
    host: 'medalist',
    title: 'Ask me about ONI',
    description: 'Three medals, one story.',
    status: 'LIVE',
    starts_at: '2026-11-10T18:00:00Z',
    ends_at: '2026-11-10T20:00:00Z',
    questions: [
      {
        id: 11,
        author: 'rival',
        question: 'How did you train?',
        answer: 'Daily drills + mock contests.',
        answered_at: '2026-11-10T18:30:00Z',
        upvotes: 4,
      },
    ],
  },
];

const MOCK_REQUESTS = [
  {
    id: 5,
    requester: 2,
    requester_username: 'admin_e2e',
    title: 'More graph problems',
    description: 'A full BFS/DFS chapter please.',
    status: 'OPEN',
    fulfilled_problem: null,
    fulfilled_problem_title: null,
    vote_count: 5,
    created_at: '2026-11-01T10:00:00Z',
  },
];

// Wave F publishing fixtures (items 62-64).
const MOCK_BLOGS = [
  {
    id: 1,
    author: 2,
    author_username: 'admin_e2e',
    title: 'How we seeded the starter pack',
    slug: 'how-we-seeded-the-starter-pack',
    body: 'The story of the first 25 bilingual problems…',
    lang: 'en',
    status: 'PUBLISHED',
    created_at: '2026-11-05T10:00:00Z',
    updated_at: '2026-11-05T10:00:00Z',
  },
];

const MOCK_WIKI = [
  {
    slug: 'cautare-binara',
    title_ro: 'Căutare binară',
    title_en: 'Binary search',
    body_ro: 'Căutarea binară găsește elementul în O(log n) pași.',
    body_en: 'Binary search finds the element in O(log n) steps.',
  },
];

const MOCK_WA_HELP = [
  {
    id: 30,
    submission: 42,
    asker: 1,
    asker_username: 'e2e_tester',
    problem_title: { en: 'Two Sum' },
    question: 'Why WA on test 4?',
    status: 'OPEN',
    answers: [
      {
        id: 31,
        author: 'rival',
        body: 'You forgot to sort the array.',
        is_accepted: false,
        created_at: '2026-11-10T08:00:00Z',
      },
    ],
    created_at: '2026-11-10T07:00:00Z',
  },
];

// Wave F items 49/55: mutable prediction + team fixtures.
let myPrediction = null;

function urlKindTeams(req) {
  const url = new URL(req.url, 'http://mock.local');
  return url.searchParams.get('section') === 'teams';
}

const MOCK_TEAMS = [
  {
    id: 1,
    name: 'Echipa Albastra',
    captain: 'e2e_tester',
    members: ['e2e_tester', 'rival'],
    member_count: 2,
    max_members: 3,
  },
];

const MOCK_TEAM_STANDINGS = [
  {
    rank: 1,
    team: 'Echipa Albastra',
    team_id: 1,
    members: ['e2e_tester', 'rival'],
    score: 150,
    solved: 2,
    problems: [],
  },
];

// Wave F contest depth (items 48/56/58): commentary lines + hack feed rows.
const MOCK_COMMENTARY = [
  {
    id: 1,
    contest: 1,
    author: 2,
    author_username: 'admin_e2e',
    minute_offset: 5,
    text: 'Problem A hides a two-pointer trick.',
    created_at: '2026-11-01T10:05:00Z',
  },
];

const MOCK_HACKS = [
  {
    id: 5,
    contest: 1,
    problem_label: 'A',
    hacker: 1,
    hacker_username: 'e2e_tester',
    target_id: 9,
    target_username: 'rival',
    input_data: '2',
    verdict: 'SUCCESSFUL',
    feedback: 'Wrong answer on the hack input.',
    judged_at: '2026-11-01T10:00:00Z',
    created_at: '2026-11-01T09:58:00Z',
  },
];
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
    // Wave F item 49: the mock's flagship contest runs the team flow.
    is_team_contest: true,
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
    end_at: '2025-03-11T12:00:00Z',
    freeze_at: null,
    is_long_contest: true,
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
  {
    id: 90,
    title_i18n: { en: 'Olympiad School Cup — Cluj', ro: 'Cupa Școlilor — Cluj' },
    description_i18n: {},
    visibility: 'PUBLIC',
    is_rated: true,
    format: 'IOI',
    start_at: '2999-02-01T10:00:00Z',
    end_at: '2999-02-01T12:00:00Z',
    freeze_at: null,
    is_school_cup: true,
    school_name: 'Colegiul National Emil Racovita',
    is_window: false,
    per_user_duration_minutes: 120,
    pretest_mode: false,
    created_by: 2,
    created_by_username: 'admin_e2e',
    state: 'UPCOMING',
    problem_count: 3,
    participant_count: 0,
    my_participation: null,
    can_manage: false,
  },
  {
    id: 77,
    title_i18n: {
      en: 'Selection Exam (hidden board)',
      ro: 'Examen de selecție (clasament ascuns)',
    },
    description_i18n: {},
    visibility: 'PUBLIC',
    is_rated: false,
    format: 'IOI',
    start_at: '2026-11-01T09:00:00Z',
    end_at: '2999-01-01T12:00:00Z',
    freeze_at: null,
    hide_scoreboard_until_end: true,
    is_window: false,
    per_user_duration_minutes: 180,
    pretest_mode: false,
    created_by: 2,
    created_by_username: 'admin_e2e',
    state: 'RUNNING',
    problem_count: 1,
    participant_count: 1,
    my_participation: null,
    can_manage: false,
  },
];

const MOCK_CONTEST_PROBLEMS = [
  {
    id: 11,
    problem: 1,
    problem_title: { en: 'Two Sum' },
    problem_difficulty: 'EASY',
    order: 0,
    label: 'A',
    points: 100,
  },
  {
    id: 12,
    problem: 2,
    problem_title: { en: 'Reverse String', ro: 'Inversarea unui șir' },
    problem_difficulty: 'MEDIUM',
    order: 1,
    label: 'B',
    points: 100,
  },
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
        {
          label: 'A',
          points_max: 100,
          best: 100,
          attempts: 1,
          wrong: 0,
          first_ac_at: '2026-10-01T10:10:00Z',
          last_improvement: null,
        },
        {
          label: 'B',
          points_max: 100,
          best: 50,
          attempts: 2,
          wrong: 1,
          first_ac_at: null,
          last_improvement: null,
        },
      ],
    },
    {
      rank: 2,
      user: { id: 2, username: 'admin_e2e' },
      score: 40,
      solved: 0,
      penalty_minutes: null,
      problems: [
        {
          label: 'A',
          points_max: 100,
          best: 40,
          attempts: 3,
          wrong: 2,
          first_ac_at: null,
          last_improvement: null,
        },
        {
          label: 'B',
          points_max: 100,
          best: 0,
          attempts: 0,
          wrong: 0,
          first_ac_at: null,
          last_improvement: null,
        },
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
    {
      id: 11,
      problem: 1,
      problem_title: { en: 'Two Sum' },
      problem_difficulty: 'EASY',
      order: 0,
      label: 'A',
      points: 100,
    },
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
    editorial: null,
    lang: 'en',
    is_announcement: false,
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
    editorial: null,
    lang: 'en',
    is_announcement: false,
    author: 'e2e_tester',
    post_count: 1,
    is_pinned: false,
    is_locked: false,
    last_activity: '2026-10-19T12:00:00Z',
    created_at: '2026-10-19T11:30:00Z',
  },
  // COM-6: the home announcements feed.
  {
    id: 8,
    title: 'Site news: interactive problems are live',
    problem: null,
    editorial: null,
    lang: 'en',
    is_announcement: true,
    author: 'admin_e2e',
    post_count: 1,
    is_pinned: true,
    is_locked: false,
    last_activity: '2026-10-21T10:00:00Z',
    created_at: '2026-10-21T09:00:00Z',
  },
  // COM-2/EDT-4: an editorial-discussion thread in Romanian.
  {
    id: 9,
    title: 'Discuție editorial Two Sum',
    problem: { id: 1, title_i18n: { en: 'Two Sum' } },
    editorial: 11,
    lang: 'ro',
    is_announcement: false,
    author: 'elev_ro',
    post_count: 1,
    is_pinned: false,
    is_locked: false,
    last_activity: '2026-10-22T12:00:00Z',
    created_at: '2026-10-22T11:30:00Z',
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
    is_spoiler: false,
    created_at: '2026-10-18T09:00:00Z',
  },
  {
    id: 2,
    thread_id: 2,
    author: 'e2e_tester',
    content: 'The trick is a hash map of seen values (SPOILER).',
    parent_id: null,
    is_edited: false,
    upvotes: 2,
    is_hidden: false,
    hidden_reason: '',
    is_spoiler: true,
    created_at: '2026-10-19T12:00:00Z',
  },
];

const MOCK_LEADERBOARD = [
  {
    rank: 1,
    username: 'admin_e2e',
    solved_count: 10,
    total_points: 500,
    success_rate: 0.8333,
    last_solved_at: '2026-10-20T00:00:00Z',
  },
  {
    rank: 2,
    username: 'e2e_tester',
    solved_count: 4,
    total_points: 200,
    success_rate: 0.6667,
    last_solved_at: '2026-10-19T00:00:00Z',
  },
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
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-CSRFToken',
  };
}

function json(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...res._corsHeaders,
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}

// Session model mirrors the backend: httpOnly wc_access/wc_refresh cookies
// gate the authenticated endpoints (admin session keyed by cookie value).
function cookieValue(req, name) {
  const raw = req.headers.cookie ?? '';
  const match = raw
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

function readBody(req, done) {
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

function sessionUser(req) {
  const access = cookieValue(req, 'wc_access');
  if (!access) return null;
  return access.includes('admin') ? MOCK_ADMIN : MOCK_USER;
}

const AUTH_COOKIES = (value) => [
  `wc_access=${value}; Path=/; HttpOnly; SameSite=Lax`,
  `wc_refresh=e2e-refresh-${value}; Path=/; HttpOnly; SameSite=Lax`,
];

// Matrix row 6 — related problems for the catalog fixture problem 1.
const MOCK_RELATED_PROBLEMS = {
  count: 2,
  results: [
    {
      id: 2,
      title_i18n: { en: 'Reverse String', ro: 'Inversarea unui șir' },
      difficulty: 'MEDIUM',
      shared_tags: 1,
    },
    {
      id: 3,
      title_i18n: { en: 'Pair Sum', ro: 'Suma pereche' },
      difficulty: 'EASY',
      shared_tags: 1,
    },
  ],
};

// X12 study tracks (competitive matrix row 8): mutable mock track state —
// module scope so mutations persist across requests within a test run.
const trackItem = (problemId, position, isSolved) => ({
  problem_id: problemId,
  title_i18n:
    problemId === 1
      ? { en: 'A Plus B', ro: 'A Plus B' }
      : problemId === 2
        ? { en: 'Two Sum', ro: 'Two Sum' }
        : { en: 'Binary Search', ro: 'Căutare binară' },
  difficulty: problemId === 1 ? 'VERY_EASY' : problemId === 2 ? 'EASY' : 'MEDIUM',
  position,
  is_solved: isSolved,
});
let trackItems = [trackItem(1, 1, true), trackItem(2, 2, false)];
const trackDetail = () => {
  const solved = trackItems.filter((item) => item.is_solved).length;
  return {
    slug: 'beginner-ladder',
    title_i18n: { en: 'Beginner ladder', ro: 'Scara începătorului' },
    description_i18n: { en: 'Start here.', ro: 'Începe aici.' },
    owner_username: 'e2e_tester',
    is_public: true,
    is_owner: true,
    item_count: trackItems.length,
    solved_count: solved,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    items: trackItems,
  };
};

// Problem-page wave (items A/B): stateful test rows for problem 5 so the
// edit page's inline edits, flags, point changes and imports round-trip
// across requests (handler-scope consts would reset per request).
const WAVE_H_TESTS = [
  {
    id: 501,
    problem: 5,
    input_data: '3\n1 2 3\n',
    expected_output_data: '6\n',
    is_sample: true,
    points: 20,
    order: 1,
    input_size: 8,
    expected_size: 2,
    input_editable: true,
    expected_editable: true,
  },
  {
    id: 502,
    problem: 5,
    input_data: '5\n10 20 30 40 50\n',
    expected_output_data: '150\n',
    is_sample: false,
    points: 20,
    order: 2,
    input_size: 16,
    expected_size: 4,
    input_editable: true,
    expected_editable: true,
  },
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
    // [roadmap RO-6] honor the archive browse axis so mock-mode e2e walks
    // the same server-filtered loop as the real backend.
    let results = MOCK_PROBLEMS;
    const archive = requestUrl.searchParams.get('archive');
    if (archive === '1') {
      results = results.filter((problem) => problem.source_contest || problem.source_year);
    }
    const year = requestUrl.searchParams.get('source_year');
    if (year) {
      results = results.filter((problem) => String(problem.source_year) === year);
    }
    const group = requestUrl.searchParams.get('grade_group');
    if (group) {
      results = results.filter((problem) => problem.grade_group === group);
    }
    json(res, 200, paged(results));
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
      language_stats: {
        python3: { tried: 8, solved_users: 5, acceptance_rate: 0.625 },
        cpp17: { tried: 4, solved_users: 3, acceptance_rate: 0.75 },
      },
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
    // Problem 2's editorial moved to the wave-H gated route further down
    // (locked until AC / forfeit); every other problem still 404s.
    if (Number(editorialMatch[1]) !== 2) {
      json(res, 404, { detail: 'No editorial for this problem.' });
      return;
    }
  }

  // FE-3: profile statistics, GDPR endpoints, bookmarks.
  if (req.method === 'GET' && path === '/api/v1/users/me/statistics/') {
    json(res, 200, {
      solved: 5,
      attempted: 8,
      total_submissions: 20,
      acceptance_rate: 0.625,
      per_difficulty: {
        EASY: { solved: 4, attempted: 6 },
        MEDIUM: { solved: 1, attempted: 2 },
        HARD: { solved: 0, attempted: 0 },
      },
      per_language: { python3: 15, cpp17: 5 },
      hour_of_day: [0, 0, 0, 0, 0, 0, 1, 2, 3, 2, 1, 0, 0, 4, 5, 3, 1, 0, 0, 1, 2, 3, 1, 0],
      active_dates_90d: [new Date().toISOString().slice(0, 10)],
      current_streak: 1,
      max_streak: 3,
      total_active_days: 4,
      ladder: { points: 7, level: 1, next_level_points: 10, progress: 0.7 },
      badges: ['first_ac'],
      tag_profile: {
        tags: [
          { tag: 'arrays', solved: 3, attempted: 4, covered: true, points: 5 },
          { tag: 'strings', solved: 1, attempted: 1, covered: true, points: 1 },
          { tag: 'dp', solved: 0, attempted: 1, covered: false, points: 0 },
        ],
        practice_next: [
          {
            id: 2,
            title_i18n: { en: 'Longest Substring' },
            difficulty: 'MEDIUM',
            tags: ['strings'],
          },
        ],
      },
    });
    return;
  }

  // JDG-9: the judge registry as public toolchain docs (mock rows carry
  // the language-fair multipliers so the form's effective-limit preview
  // renders against mocks exactly as against the live registry).
  if (req.method === 'GET' && path === '/api/v1/public/languages/') {
    json(res, 200, {
      notice: 'mock',
      count: 5,
      results: [
        {
          id: 'python3',
          name: 'Python 3',
          compile_command: [],
          run_command: ['python', 'user_code.py'],
          time_multiplier: 3,
          memory_multiplier: 1.5,
          memory_floor_kb: 0,
          checker_capable: true,
        },
        {
          id: 'cpp17',
          name: 'C++17',
          compile_command: ['g++', '-O2', '-o', 'user_program', 'user_code.cpp'],
          run_command: ['./user_program'],
          time_multiplier: 1,
          memory_multiplier: 1,
          memory_floor_kb: 0,
          checker_capable: true,
        },
        {
          id: 'cpp20',
          name: 'C++20',
          compile_command: ['g++', '-std=c++20', '-O2', '-o', 'user_program', 'user_code.cpp'],
          run_command: ['./user_program'],
          time_multiplier: 1,
          memory_multiplier: 1,
          memory_floor_kb: 0,
          checker_capable: true,
        },
        {
          id: 'java11',
          name: 'Java 11',
          compile_command: ['javac', '--release', '11', 'Main.java'],
          run_command: ['java', '-cp', '.', 'Main'],
          time_multiplier: 2,
          memory_multiplier: 1,
          memory_floor_kb: 524288,
          checker_capable: false,
        },
        {
          id: 'pascal',
          name: 'Free Pascal',
          compile_command: ['fpc', '-O2', '-ouser_program', 'user_code.pas'],
          run_command: ['./user_program'],
          time_multiplier: 1,
          memory_multiplier: 1,
          memory_floor_kb: 0,
          checker_capable: true,
        },
      ],
    });
    return;
  }

  // RO-3: the identity PATCH.
  if (req.method === 'PATCH' && path === '/api/v1/users/me/') {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      let body = {};
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        body = {};
      }
      Object.assign(MOCK_USER, body);
      json(res, 200, {
        ...MOCK_USER,
        county: body.county ?? MOCK_USER.county ?? '',
        school: body.school ?? MOCK_USER.school ?? '',
        is_minor: body.is_minor ?? false,
      });
    });
    return;
  }

  // JDG-13 v1: the structured solutions for the diff view.
  const solutionsJson = path.match(/^\/api\/v1\/problems\/tools\/assignment-solutions\/(\d+)\/$/);
  if (req.method === 'GET' && solutionsJson && requestUrl.searchParams.get('format') === 'json') {
    const session2 = sessionUser(req);
    if (!session2 || (session2.username !== 'admin_e2e' && session2.username !== 'e2e_teacher')) {
      json(res, 403, { detail: 'Only the teacher can export solutions.' });
      return;
    }
    json(res, 200, {
      count: 2,
      results: [
        {
          id: 101,
          username: 'e2e_tester',
          problem_id: 1,
          verdict: 'AC',
          score: 100,
          language: 'python3',
          submission_time: '2026-10-25T10:00:00Z',
          code: 'print(int(input()) + int(input()))',
        },
        {
          id: 102,
          username: 'elev_ro',
          problem_id: 1,
          verdict: 'AC',
          score: 100,
          language: 'python3',
          submission_time: '2026-10-25T10:05:00Z',
          code: 'a = int(input())\nb = int(input())\nprint(a + b)',
        },
      ],
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
    json(res, 200, {
      problem: Number(bookmarkMatch[1]),
      starred: req.method === 'POST',
      star_count: 1,
    });
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

  // Wave G item 89: the anonymous guest try-it run.
  if (req.method === 'POST' && path === '/api/v1/scratch/guest/') {
    json(res, 200, {
      status: 'OK',
      output: 'Salut, world!\n',
      error: '',
      time_ms: 9,
      memory_kb: 2048,
    });
    return;
  }

  // Wave G item 76: cross-device code drafts.
  const draftMatch = path.match(/^\/api\/v1\/submissions\/drafts\/(\d+)\/$/);
  if (draftMatch) {
    if (req.method === 'GET') {
      json(res, 200, {
        language: 'python3',
        code: 'print(40 + 2)',
        updated_at: '2026-11-18T10:00:00Z',
      });
      return;
    }
    if (req.method === 'PUT') {
      json(res, 200, req.body || { language: 'python3', code: '' });
      return;
    }
    if (req.method === 'DELETE') {
      json(res, 200, { deleted: 1 });
      return;
    }
  }

  // Wave G item 78: private statement annotations.
  const annotationMatch = path.match(/^\/api\/v1\/problems\/(\d+)\/annotations\/$/);
  if (annotationMatch) {
    if (req.method === 'GET') {
      json(res, 200, [
        { id: 5, quote: 'add up to target', note: 'hash map!', updated_at: '2026-11-17T09:00:00Z' },
      ]);
      return;
    }
    if (req.method === 'POST') {
      json(res, 201, {
        id: 6,
        quote: (req.body && req.body.quote) || 'q',
        note: (req.body && req.body.note) || 'n',
        updated_at: '2026-11-18T10:00:00Z',
      });
      return;
    }
    if (req.method === 'DELETE') {
      json(res, 200, { deleted: '6' });
      return;
    }
  }

  // Wave G item 92: the offline statement pack.
  const packMatch = path.match(/^\/api\/v1\/problems\/(\d+)\/statement-pack\/$/);
  if (packMatch) {
    json(res, 200, {
      problem_id: Number(packMatch[1]),
      lang: 'en',
      html: '<!DOCTYPE html><html><head><title>Two Sum</title></head><body><h1>Two Sum</h1><p>offline pack</p></body></html>',
    });
    return;
  }

  // Wave G item 82: federated search.
  if (path === '/api/v1/search/') {
    json(res, 200, {
      query: '',
      results: {
        problems: [],
        threads: [{ id: 7, title: 'Two Sum thread', problem: null }],
        articles: [],
        contests: [{ id: 3, title: 'Two Sum Cup', start_at: '2026-12-01T10:00:00Z' }],
        users: [{ id: 4, username: 'twosummer' }],
      },
    });
    return;
  }

  // Wave G section H: integrity endpoints.
  if (path === '/api/v1/integrity/abuse-queue/') {
    json(res, 200, {
      items: [
        {
          kind: 'forum_report',
          id: 12,
          age_hours: 60.2,
          sla_due_in_hours: -12.2,
          sla_breached: true,
          reason: 'SPAM',
        },
        {
          kind: 'similarity_flag',
          id: 3,
          age_hours: 2.1,
          sla_due_in_hours: 45.9,
          sla_breached: false,
          reason: 'PLAGIARISM',
        },
      ],
      open_count: 2,
      sla_breached_count: 1,
      sla_hours: 48,
    });
    return;
  }
  if (path === '/api/v1/integrity/flags/') {
    json(res, 200, [
      {
        id: 3,
        kind: 'PLAGIARISM',
        status: 'OPEN',
        score: 0.96,
        submission: { id: 51, user: 'bob', problem: 1 },
        other: { id: 52, user: 'carol' },
      },
    ]);
    return;
  }
  const scanMatch = path === '/api/v1/integrity/scan/' && req.method === 'POST';
  if (scanMatch) {
    json(res, 200, {
      problem: req.body?.problem ?? 1,
      flags_created: { plagiarism: 1, boilerplate: 0 },
    });
    return;
  }
  const flagReview = path.match(/^\/api\/v1\/integrity\/flags\/(\d+)\/review\/$/);
  if (flagReview && req.method === 'POST') {
    json(res, 200, {
      id: Number(flagReview[1]),
      status: req.body?.decision === 'confirmed' ? 'CONFIRMED' : 'DISMISSED',
    });
    return;
  }
  if (path === '/api/v1/integrity/multi-accounts/') {
    json(res, 200, {
      clusters: [
        {
          user_ids: [4, 5],
          usernames: ['farm_a', 'farm_b'],
          shared_ips: ['10.0.0.1', '10.0.0.2'],
          shared_count: 2,
        },
      ],
    });
    return;
  }
  if (path === '/api/v1/integrity/appeals/') {
    json(res, 200, [
      {
        id: 9,
        appellant: 'dave',
        action: 'CONTENT_HIDDEN',
        text: 'I believe this hide was wrong.',
      },
    ]);
    return;
  }
  // Wave G section G: analytics endpoints (admin dashboard).
  if (path === '/api/v1/analytics/funnel/') {
    json(res, 200, {
      steps: [
        { key: 'signup', count: 100, rate: 1.0 },
        { key: 'first_submission', count: 60, rate: 0.6, step_rate: 0.6 },
        { key: 'first_ac', count: 45, rate: 0.45, step_rate: 0.75 },
        { key: 'first_contest', count: 12, rate: 0.12, step_rate: 0.2667 },
      ],
      generated_at: '2026-11-19T00:00:00Z',
    });
    return;
  }
  if (path === '/api/v1/analytics/search/') {
    json(res, 200, {
      total_searches: 8,
      top_queries: [{ query: 'sum', n: 5 }],
      zero_result_queries: [{ query: 'segment tree', n: 3 }],
    });
    return;
  }
  if (path === '/api/v1/analytics/org/' && req.method === 'GET') {
    json(res, 200, {
      school: 'CNIT',
      county: '',
      members: 12,
      weekly_active_solvers: 7,
      total_solves: 40,
      submissions_30d: 120,
    });
    return;
  }
  if (path === '/api/v1/analytics/season-reports/' && req.method === 'GET') {
    const parsed = new URL(req.url, 'http://mock.local');
    const season = parsed.searchParams.get('season');
    if (season) {
      json(res, 200, {
        season,
        markdown: `# WebCoder ${season} report

- New accounts: **10**`,
        generated_at: '2026-11-19T00:00:00Z',
      });
      return;
    }
    json(res, 200, [{ season: '2026Q4', generated_at: '2026-11-19T00:00:00Z' }]);
    return;
  }
  if (path === '/api/v1/analytics/season-reports/' && req.method === 'POST') {
    json(res, 201, {
      season: req.body?.season || '2026Q4',
      markdown: `# WebCoder ${req.body?.season || '2026Q4'} report

- New accounts: **10**`,
      generated_at: '2026-11-19T00:00:00Z',
      created: true,
    });
    return;
  }

  // Wave G item 88: the onboarding checklist.
  if (path === '/api/v1/users/me/onboarding/') {
    json(res, 200, {
      steps: [
        { key: 'account', done: true },
        { key: 'first_submission', done: true },
        { key: 'first_ac', done: false },
        { key: 'first_contest', done: false },
        { key: 'profile_bio', done: false },
        { key: 'joined_class', done: false },
      ],
      done: 2,
      total: 6,
    });
    return;
  }

  // Wave A: curriculum tree (EDU-9) + starter trio (ONB-1) + solved ids (F5).
  if (req.method === 'GET' && path === '/api/v1/problems/curriculum/') {
    json(
      res,
      200,
      paged([
        {
          // EDU-10 (Wave D): the gimnaziu tree leads the liceu spine.
          id: 20,
          kind: 'GRADE',
          slug: 'g5',
          order: 5,
          name_i18n: { en: 'Grade 5', ro: 'Clasa a V-a' },
          problem_count: 1,
          children: [
            {
              id: 21,
              kind: 'CHAPTER',
              slug: 'g5-first-steps',
              order: 1,
              name_i18n: {
                en: 'First steps (read & print)',
                ro: 'Primii pași (citire și afișare)',
              },
              problem_count: 1,
            },
          ],
        },
        {
          id: 10,
          kind: 'GRADE',
          slug: 'g9',
          order: 10,
          name_i18n: { en: 'Grade 9', ro: 'Clasa a IX-a' },
          problem_count: 2,
          children: [
            {
              id: 11,
              kind: 'CHAPTER',
              slug: 'g9-elementary',
              order: 1,
              name_i18n: { en: 'Elementary algorithms', ro: 'Algoritmi elementari' },
              problem_count: 1,
            },
            {
              id: 12,
              kind: 'CHAPTER',
              slug: 'g9-loops',
              order: 2,
              name_i18n: { en: 'Loops', ro: 'Structuri repetitive' },
              problem_count: 1,
            },
          ],
        },
      ]),
    );
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

  // i18n community translations (owner rule (c)): a STATEFUL store so the
  // propose → curate → visible round-trip works against mocks exactly as
  // against Django — approving writes the language into the mock problem's
  // title_i18n/statement_i18n and appends the attribution row, so the
  // problem page re-render shows the promoted translation.
  const translationRow = (proposal) => ({
    id: proposal.id,
    problem_id: proposal.problem_id,
    problem_title_en:
      (MOCK_PROBLEMS.find((p) => p.id === proposal.problem_id) || {}).title_i18n?.en ??
      `Problem ${proposal.problem_id}`,
    language: proposal.language,
    language_name:
      (TRANSLATABLE_LANGUAGES.find((l) => l.code === proposal.language) || {}).english ??
      proposal.language,
    title: proposal.title,
    statement: proposal.statement,
    status: proposal.status,
    contributor_username: proposal.contributor_username,
    reviewer_username: proposal.reviewer_username,
    review_note: proposal.review_note,
    reviewed_at: proposal.reviewed_at,
    ai_verdict: '',
    ai_confidence: null,
    ai_notes: '',
    created_at: proposal.created_at,
    updated_at: proposal.reviewed_at ?? proposal.created_at,
  });
  const isVerifier = (req) => {
    const session = sessionUser(req);
    return (
      session !== null &&
      (session.role === 'ADMIN' ||
        session.role === 'PROBLEM_VERIFIER' ||
        session.role === 'VERIFIER')
    );
  };

  if (req.method === 'GET' && path === '/api/v1/translations/languages/') {
    json(res, 200, { results: TRANSLATABLE_LANGUAGES });
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/translations/proposals/mine/') {
    const session = sessionUser(req);
    if (!session) {
      json(res, 401, { detail: 'Authentication credentials were not provided.' });
      return;
    }
    const mine = translationsState.proposals
      .filter((p) => p.contributor_username === session.username)
      .map(translationRow);
    json(res, 200, paged(mine));
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/translations/proposals/') {
    if (!isVerifier(req)) {
      json(res, 403, { detail: 'Only verifiers and admins can manage translations.' });
      return;
    }
    const listUrl = new URL(req.url, `http://${HOST}:${PORT}`);
    const statusFilter = listUrl.searchParams.get('status');
    const languageFilter = listUrl.searchParams.get('language');
    const problemFilter = listUrl.searchParams.get('problem');
    let rows = translationsState.proposals;
    if (statusFilter) rows = rows.filter((p) => p.status === statusFilter);
    if (languageFilter) rows = rows.filter((p) => p.language === languageFilter);
    if (problemFilter) rows = rows.filter((p) => p.problem_id === Number(problemFilter));
    json(res, 200, paged(rows.slice().reverse().map(translationRow)));
    return;
  }

  if (req.method === 'POST' && path === '/api/v1/translations/proposals/') {
    const session = sessionUser(req);
    if (!session) {
      json(res, 401, { detail: 'Authentication credentials were not provided.' });
      return;
    }
    readBody(req, (body) => {
      const problem = MOCK_PROBLEMS.find((p) => p.id === Number(body.problem));
      const language = String(body.language ?? '');
      if (!problem) {
        json(res, 400, {
          detail: 'Only published (APPROVED) problems accept community translations.',
        });
        return;
      }
      if (!TRANSLATABLE_LANGUAGES.some((l) => l.code === language)) {
        json(res, 400, { detail: '"language" is not a valid choice.' });
        return;
      }
      if (problem.title_i18n[language]) {
        json(res, 400, { detail: 'There is already an approved translation for this language.' });
        return;
      }
      const dup = translationsState.proposals.find(
        (p) =>
          p.problem_id === problem.id &&
          p.language === language &&
          p.contributor_username === session.username &&
          p.status === 'PENDING',
      );
      if (dup) {
        json(res, 409, {
          detail:
            'You already have a pending proposal for this problem and language — wait for a decision before proposing again.',
        });
        return;
      }
      const proposal = {
        id: translationsState.nextId++,
        problem_id: problem.id,
        language,
        title: String(body.title ?? ''),
        statement: String(body.statement ?? ''),
        status: 'PENDING',
        contributor_username: session.username,
        reviewer_username: null,
        review_note: '',
        reviewed_at: null,
        created_at: new Date().toISOString(),
      };
      translationsState.proposals.push(proposal);
      json(res, 201, translationRow(proposal));
    });
    return;
  }

  const decisionMatch = path.match(
    /^\/api\/v1\/translations\/proposals\/(\d+)\/(approve|reject)\/$/,
  );
  if (req.method === 'POST' && decisionMatch) {
    if (!isVerifier(req)) {
      json(res, 403, { detail: 'Only verifiers and admins can manage translations.' });
      return;
    }
    readBody(req, (body) => {
      const proposal = translationsState.proposals.find((p) => p.id === Number(decisionMatch[1]));
      if (!proposal) {
        json(res, 404, { detail: 'Not found.' });
        return;
      }
      if (proposal.status !== 'PENDING') {
        json(res, 400, { detail: `Only pending proposals can be decided.` });
        return;
      }
      const reviewer = sessionUser(req).username;
      proposal.reviewer_username = reviewer;
      proposal.review_note = decisionMatch[2] === 'reject' ? String(body.note ?? '') : '';
      proposal.reviewed_at = new Date().toISOString();
      if (decisionMatch[2] === 'approve') {
        proposal.status = 'APPROVED';
        const problem = MOCK_PROBLEMS.find((p) => p.id === proposal.problem_id);
        if (problem) {
          problem.title_i18n[proposal.language] = proposal.title;
          problem.statement_i18n[proposal.language] = proposal.statement;
          problem.translations = [
            ...(problem.translations ?? []).filter((row) => row.language !== proposal.language),
            {
              language: proposal.language,
              contributor_username: proposal.contributor_username,
              reviewed_at: proposal.reviewed_at,
            },
          ];
        }
      } else {
        proposal.status = 'REJECTED';
      }
      json(res, 200, translationRow(proposal));
    });
    return;
  }

  // (waveTests lives at module scope — see the WAVE_H_TESTS declaration —
  // so state survives across requests.)
  const waveTests = WAVE_H_TESTS;
  if (req.method === 'GET' && path === '/api/v1/problems/testcases/') {
    const q = requestUrl.searchParams.get('problem_id');
    json(res, 200, paged(q === '5' ? waveTests : []));
    return;
  }
  const tcDetail = path.match(/^\/api\/v1\/problems\/testcases\/(\d+)\/$/);
  if (tcDetail && ['PATCH', 'PUT'].includes(req.method)) {
    readBody(req, (body) => {
      const row = waveTests.find((t) => t.id === Number(tcDetail[1]));
      if (row) Object.assign(row, body);
      json(res, 200, row || {});
    });
    return;
  }
  if (tcDetail && req.method === 'DELETE') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === 'POST' && path === '/api/v1/problems/testcases/') {
    readBody(req, (body) => {
      const row = {
        id: 500 + waveTests.length + 1,
        problem: body.problem,
        input_data: body.input_data,
        expected_output_data: body.expected_output_data,
        is_sample: !!body.is_sample,
        points: body.points ?? 10,
        order: body.order ?? waveTests.length + 1,
        input_size: (body.input_data || '').length,
        expected_size: (body.expected_output_data || '').length,
        input_editable: (body.input_data || '').length <= 10240,
        expected_editable: (body.expected_output_data || '').length <= 10240,
      };
      waveTests.push(row);
      json(res, 201, row);
    });
    return;
  }
  // Autosaved authoring drafts (item A).
  const authoringDraftMatch = path.match(/^\/api\/v1\/problems\/authoring-drafts\/([\w-]+)\/$/);
  if (authoringDraftMatch && req.method === 'GET') {
    json(res, 404, { detail: 'no draft' });
    return;
  }
  if (authoringDraftMatch && req.method === 'PUT') {
    readBody(req, (body) => {
      json(res, 200, { payload: body.payload, updated_at: new Date().toISOString() });
    });
    return;
  }
  if (authoringDraftMatch && req.method === 'DELETE') {
    res.writeHead(204);
    res.end();
    return;
  }
  // Archive import (item B1): multipart-tolerant — the dry-run previews
  // the canned pairs, the real run appends them to the stateful rows.
  const importMatch = path.match(/^\/api\/v1\/problems\/problems\/(\d+)\/tests\/import-archive\/$/);
  if (importMatch && req.method === 'POST') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('latin1');
      const dry = raw.includes('name="dry_run"');
      const pairs = [
        { name: 'data/sample/01', input: '3\n1 2 3\n', expected: '6\n', is_sample: true },
        {
          name: 'data/secret/02',
          input: '5\n10 20 30 40 50\n',
          expected: '150\n',
          is_sample: false,
        },
      ];
      if (dry) {
        json(res, 200, {
          pairs,
          skipped: [],
          other_files: ['notes.txt'],
          total_members: 5,
          created: 0,
        });
      } else {
        for (const pair of pairs) {
          waveTests.push({
            id: 500 + waveTests.length + 1,
            problem: Number(importMatch[1]),
            input_data: pair.input,
            expected_output_data: pair.expected,
            is_sample: pair.is_sample,
            points: 10,
            order: waveTests.length + 1,
            input_size: pair.input.length,
            expected_size: pair.expected.length,
            input_editable: true,
            expected_editable: true,
          });
        }
        json(res, 201, {
          pairs,
          skipped: [],
          other_files: ['notes.txt'],
          total_members: 5,
          created: pairs.length,
          points_each: 10,
        });
      }
    });
    return;
  }
  const distributeMatch = path.match(/^\/api\/v1\/problems\/problems\/(\d+)\/tests\/distribute\/$/);
  if (distributeMatch && req.method === 'POST') {
    readBody(req, (body) => {
      const target = body.target ?? 50;
      const base = Math.floor(target / waveTests.length);
      let left = target - base * waveTests.length;
      const points = waveTests.map(() => {
        const p = base + (left > 0 ? 1 : 0);
        left = Math.max(0, left - 1);
        return p;
      });
      waveTests.forEach((row, i) => {
        row.points = points[i];
      });
      json(res, 200, { target, tests: waveTests.length, total: target, points });
    });
    return;
  }

  // ---- Problem-page wave (items C/D/F): solver economy endpoints ------
  // Stateful per-session reveal/forfeit stores for problem 2.
  if (typeof globalThis.WAVE_H_HINTS === 'undefined') {
    globalThis.WAVE_H_HINTS = { revealed: new Set() };
    globalThis.WAVE_H_FORFEIT = { problem: 0 };
  }
  const hintsPath = '/api/v1/problems/problems/2/hints/reveal/';
  if (req.method === 'POST' && path === hintsPath) {
    readBody(req, (body) => {
      const tier = Number(body.tier);
      const contents = {
        1: 'Built-in slicing reverses in one step.',
        2: 's[::-1]',
        3: 'Loop from the end appending into a buffer.',
      };
      if (contents[tier]) globalThis.WAVE_H_HINTS.revealed.add(tier);
      const tiers = [1, 2, 3]
        .filter((n) => n <= 2)
        .map((n) => ({
          tier: n,
          kind: n === 1 ? 'NUDGE' : 'STRONGER',
          revealed: globalThis.WAVE_H_HINTS.revealed.has(n),
          content: globalThis.WAVE_H_HINTS.revealed.has(n) ? contents[n] : null,
          image: null,
        }));
      json(res, 200, {
        total: 2,
        revealed_count: tiers.filter((tierRow) => tierRow.revealed).length,
        tiers,
      });
    });
    return;
  }
  const unlockPath = '/api/v1/problems/problems/2/unlock-source/';
  if (req.method === 'POST' && path === unlockPath) {
    globalThis.WAVE_H_FORFEIT.problem = 2;
    json(res, 200, {
      reference_solution_code: 'print(s[::-1])',
      reference_language: 'python3',
      forfeited: true,
      forfeited_at: new Date().toISOString(),
      editorial_unlocked: true,
    });
    return;
  }
  const statusPath = '/api/v1/problems/problems/2/tests/status/';
  if (req.method === 'GET' && path === statusPath) {
    const passed = globalThis.WAVE_H_FORFEIT.problem === 2 ? 0 : 1;
    json(res, 200, {
      unlock_state: {
        passed_count: passed,
        unlocked_index: passed + 1,
        total: 3,
        solved_all: false,
      },
      tests: [
        {
          id: 11,
          order: 1,
          position: 1,
          points: 40,
          is_sample: true,
          status: passed >= 1 ? 'solved' : 'unlocked',
          input_data: 'abcdef',
          expected_output_data: 'fedcba',
        },
        {
          id: 12,
          order: 2,
          position: 2,
          points: 40,
          is_sample: false,
          status: passed === 1 ? 'unlocked' : 'locked',
          input_data: passed === 1 ? 'xyz' : null,
          expected_output_data: passed === 1 ? 'zyx' : null,
        },
        {
          id: 13,
          order: 3,
          position: 3,
          points: 40,
          is_sample: false,
          status: 'locked',
          input_data: null,
          expected_output_data: null,
        },
      ],
    });
    return;
  }
  // The locked editorial 403 keeps its publish-policy payload (EDT-1).
  const editorialPath = '/api/v1/problems/problems/2/editorial/';
  if (req.method === 'GET' && path === editorialPath) {
    if (globalThis.WAVE_H_FORFEIT.problem === 2) {
      json(res, 200, {
        content_ro: 'Folosim slicing.',
        content_en: '## Approach\n\nUse slicing: `s[::-1]` — $O(n)$ time.',
        publish_policy: 'AFTER_AC',
        solution_python: 'print(s[::-1])',
        solution_cpp:
          '#include <bits/stdc++.h>\nint main() { std::string s; std::cin >> s; std::reverse(s.begin(), s.end()); std::cout << s; }',
      });
      return;
    }
    json(res, 403, {
      detail: 'This editorial is locked by its publish policy.',
      publish_policy: 'AFTER_AC',
      locked: true,
    });
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
        { 'Set-Cookie': AUTH_COOKIES(cookieValueToken) },
      );
    });
    return;
  }

  // [ONB-1] Password reset (dj-rest-auth defaults). Deterministic mock
  // pair: uid=mock-uid & token=mock-token confirm; anything else 400s so
  // the expired-link UI path is drivable in mock mode. The request
  // answers 200 regardless of the address (no account enumeration).
  if (req.method === 'POST' && path === '/api/v1/auth/password/reset/') {
    json(res, 200, { detail: 'Password reset e-mail has been sent.' });
    return;
  }

  if (req.method === 'POST' && path === '/api/v1/auth/password/reset/confirm/') {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      let body = {};
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        body = {};
      }
      if (body.uid === 'mock-uid' && body.token === 'mock-token') {
        json(res, 200, { detail: 'Password has been reset.' });
      } else {
        json(res, 400, { uid: ['Invalid value.'], token: ['Invalid value.'] });
      }
    });
    return;
  }

  if (req.method === 'POST' && path === '/api/v1/auth/token/refresh/') {
    // dj-rest-auth cookie refresh: empty body, wc_refresh cookie in play.
    if (!cookieValue(req, 'wc_refresh')) {
      json(res, 401, { detail: 'No valid refresh token found.' });
      return;
    }
    json(
      res,
      200,
      { access: 'e2e-rotated-access' },
      { 'Set-Cookie': AUTH_COOKIES('e2e-access-token')[0] },
    );
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/auth/csrf/') {
    json(
      res,
      200,
      { detail: 'CSRF cookie set' },
      {
        'Set-Cookie': 'csrftoken=e2e-csrf-token; Path=/; SameSite=Lax',
      },
    );
    return;
  }

  if (req.method === 'POST' && path === '/api/v1/auth/logout/') {
    json(
      res,
      200,
      { detail: 'Logged out.' },
      {
        'Set-Cookie': [
          'wc_access=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
          'wc_refresh=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
        ],
      },
    );
    return;
  }

  // ---- ANA-1 (Wave D): owner analytics ------------------------------------
  if (req.method === 'GET' && path === '/api/v1/users/admin/activation/') {
    json(res, 200, {
      total_users: 42,
      users_with_submission: 25,
      users_with_ac: 18,
      activation_rate: 0.5952,
      first_ac_rate: 0.4286,
      d1_active: 14,
      d7_active: 19,
      d1_rate: 0.3333,
      d7_rate: 0.4524,
      submissions_per_day_30d: { '2026-10-27': 12, '2026-10-28': 7, '2026-10-29': 15 },
      total_submissions: 331,
    });
    return;
  }
  if (req.method === 'GET' && path === '/api/v1/users/admin/activation/history/') {
    json(res, 200, {
      weeks: 12,
      history: [
        {
          week: '2026-W42',
          captured_at: '2026-10-19T06:30:00Z',
          total_users: 30,
          users_with_submission: 17,
          users_with_ac: 11,
          d1_active: 8,
          d7_active: 12,
          total_submissions: 210,
        },
        {
          week: '2026-W43',
          captured_at: '2026-10-26T06:30:00Z',
          total_users: 42,
          users_with_submission: 25,
          users_with_ac: 18,
          d1_active: 14,
          d7_active: 19,
          total_submissions: 331,
        },
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
      json(res, 409, {
        detail: 'You already have a personal token — revoke it first to rotate the key.',
      });
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
      // [wave G item 146] the mock admin carries the supporter badge
      // (cosmetic-only) so the /profile e2e can assert it.
      supporter_since: user.role === 'ADMIN' ? '2026-01-15' : null,
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

  if (req.method === 'GET' && path === '/api/v1/contests/') {
    // Item 54: the long-challenge catalog axis.
    const url = new URL(req.url, 'http://mock.local');
    const rows =
      url.searchParams.get('kind') === 'long'
        ? MOCK_CONTESTS.filter((c) => c.is_long_contest)
        : MOCK_CONTESTS;
    json(res, 200, paged(rows));
    return;
  }

  // Wave F item 71 — submission detail for the share-card e2e (AC row).
  const submissionDetail = path.match(/^\/api\/v1\/submissions\/submissions\/(\d+)\/$/);
  if (req.method === 'GET' && submissionDetail) {
    json(res, 200, {
      id: Number(submissionDetail[1]),
      user: { id: 1, username: 'e2e_tester' },
      problem: { id: 1, title_i18n: { en: 'Two Sum' } },
      language: 'python3',
      code: 'print(1)',
      verdict: 'AC',
      score: 100,
      submission_time: '2026-11-15T10:00:00Z',
      execution_time_ms: 42,
      memory_used_kb: 12000,
      test_results: [],
    });
    return;
  }

  // ---- Wave F profile widgets (items 70-72) ----
  const setterCv = path.match(/^\/api\/v1\/users\/username\/([^/]+)\/setter-cv\/$/);
  if (setterCv) {
    if (req.method === 'GET') {
      json(res, 200, {
        username: decodeURIComponent(setterCv[1]),
        blurb: 'Olympiad problem setter since 2019.',
        links: ['https://guru.dev'],
        problems_approved: 12,
        problems_by_difficulty: { EASY: 4, MEDIUM: 6, HARD: 2 },
        community_editorials: 3,
        articles: 1,
        contests_contributed: 2,
        member_since: '2026-01-01T00:00:00Z',
      });
      return;
    }
    if (req.method === 'PUT') {
      readBody(req, (body) => {
        json(res, 200, {
          username: decodeURIComponent(setterCv[1]),
          blurb: body.blurb ?? '',
          links: body.links ?? [],
          problems_approved: 12,
          problems_by_difficulty: { EASY: 4, MEDIUM: 6, HARD: 2 },
          community_editorials: 3,
          articles: 1,
          contests_contributed: 2,
          member_since: '2026-01-01T00:00:00Z',
        });
      });
      return;
    }
  }
  const embedProblem = path.match(/^\/api\/v1\/users\/embed\/problems\/(\d+)\/$/);
  if (req.method === 'GET' && embedProblem) {
    const problem = MOCK_PROBLEMS.find((row) => row.id === Number(embedProblem[1]));
    if (!problem) {
      json(res, 404, { detail: 'Not found.' });
      return;
    }
    json(res, 200, {
      problem_id: problem.id,
      title: problem.title_i18n.en ?? 'Problem',
      difficulty: problem.difficulty,
      time_limit_ms: problem.default_time_limit_ms,
      memory_limit_kb: problem.default_memory_limit_kb,
      samples: (problem.test_cases ?? [])
        .filter((tc) => tc.is_sample)
        .map((tc) => ({
          input_data: tc.input_data,
          expected_output_data: tc.expected_output_data,
        })),
      solved_by: 42,
      solve_url: `/problems/${problem.id}`,
    });
    return;
  }
  const solveCard = path.match(/^\/api\/v1\/users\/cards\/solve\/([^/]+)\/(\d+)\/$/);
  if (req.method === 'GET' && solveCard) {
    json(res, 200, {
      username: decodeURIComponent(solveCard[1]),
      problem_id: Number(solveCard[2]),
      problem_title: 'Two Sum',
      difficulty: 'EASY',
      ordinal: 7,
      solved_at: '2026-11-15T10:00:00Z',
    });
    return;
  }
  const solveCardSvg = path.match(/^\/api\/v1\/users\/cards\/solve\/([^/]+)\/(\d+)\/svg\/$/);
  if (req.method === 'GET' && solveCardSvg) {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    res.end(
      `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200"><text x="32" y="96">SOLVED ${decodeURIComponent(
        solveCardSvg[1],
      )}</text></svg>`,
    );
    return;
  }

  // ---- Wave F content ops (items 125/129/131/132) ----
  if (path === '/api/v1/problems/author-analytics/') {
    if (!sessionUser(req)) {
      json(res, 401, { detail: 'Authentication credentials are not provided.' });
      return;
    }
    json(res, 200, {
      problems_total: 6,
      problems_approved: 4,
      by_difficulty: { EASY: 2, MEDIUM: 1, HARD: 1 },
      submissions_total: 120,
      acceptance_rate: 42.5,
      unique_solvers: 33,
      editorial_coverage: 3,
      open_test_bounties: 2,
    });
    return;
  }
  if (path === '/api/v1/problems/drops/') {
    if (!sessionUser(req)) {
      json(res, 401, { detail: 'Authentication credentials are not provided.' });
      return;
    }
    json(res, 200, {
      count: 1,
      results: [{ problem_id: 9, title: 'Graph Marathon', publish_at: '2026-12-01T10:00:00Z' }],
    });
    return;
  }
  if (path === '/api/v1/problems/searches/') {
    if (!sessionUser(req)) {
      json(res, 401, { detail: 'Authentication credentials are not provided.' });
      return;
    }
    if (req.method === 'GET') {
      json(res, 200, {
        count: 1,
        results: [{ id: 7, name: 'Easy graphs', params: { difficulty: 'EASY' } }],
      });
      return;
    }
    if (req.method === 'POST') {
      readBody(req, (body) => {
        json(res, 201, { id: 8, name: body.name ?? '', params: body.params ?? {} });
      });
      return;
    }
    if (req.method === 'DELETE') {
      res.writeHead(204);
      res.end();
      return;
    }
  }
  const changelog = path.match(/^\/api\/v1\/problems\/problems\/(\d+)\/changelog\/$/);
  if (req.method === 'GET' && changelog) {
    json(res, 200, {
      count: 2,
      results: [
        {
          id: 2,
          kind: 'statement',
          edited_by: 'admin_e2e',
          note: 'clarify',
          created_at: '2026-11-10T10:00:00Z',
        },
        {
          id: 1,
          kind: 'statement',
          edited_by: 'admin_e2e',
          note: 'initial',
          created_at: '2026-11-01T10:00:00Z',
        },
      ],
    });
    return;
  }
  const restore = path.match(/^\/api\/v1\/problems\/problems\/(\d+)\/revisions\/(\d+)\/restore\/$/);
  if (req.method === 'POST' && restore) {
    json(res, 200, { detail: 'Restored revision 1.' });
    return;
  }

  // ---- Wave F statement quality (items 121/123/124/134) ----
  if (path === '/api/v1/problems/wizard/steps/') {
    if (!sessionUser(req)) {
      json(res, 401, { detail: 'Authentication credentials were not provided.' });
      return;
    }
    json(res, 200, {
      count: 7,
      steps: [
        { key: 'basics', title_en: 'Basics', description_en: 'd', fields: [], complete: true },
        { key: 'limits', title_en: 'Limits', description_en: 'd', fields: [], complete: true },
        { key: 'samples', title_en: 'Samples', description_en: 'd', fields: [], complete: false },
        { key: 'tests', title_en: 'Tests', description_en: 'd', fields: [], complete: false },
        {
          key: 'reference',
          title_en: 'Reference',
          description_en: 'd',
          fields: [],
          complete: false,
        },
        {
          key: 'translation',
          title_en: 'Translation',
          description_en: 'd',
          fields: [],
          complete: false,
        },
        { key: 'review', title_en: 'Review', description_en: 'd', fields: [], complete: false },
      ],
    });
    return;
  }
  const stmtLint = path.match(/^\/api\/v1\/problems\/problems\/(\d+)\/statement-lint\/$/);
  if (req.method === 'POST' && stmtLint) {
    json(res, 200, {
      count: 1,
      warnings: [
        {
          code: 'missing_constraints_en',
          locale: 'en',
          message: "No 'constraints' section found.",
        },
      ],
    });
    return;
  }
  const readability = path.match(/^\/api\/v1\/problems\/problems\/(\d+)\/readability\/$/);
  if (req.method === 'GET' && readability) {
    json(res, 200, {
      locales: {
        en: { score: 71.2, band: 'plain', words: 40, sentences: 3 },
        ro: { score: 66.0, band: 'plain', words: 38, sentences: 3 },
      },
      consistent: true,
    });
    return;
  }
  const translationStatus = path.match(
    /^\/api\/v1\/problems\/problems\/(\d+)\/translation-status\/$/,
  );
  if (req.method === 'GET' && translationStatus) {
    json(res, 200, {
      fields: ['title', 'statement', 'hints'],
      locales: {
        en: { title: true, statement: true, hints: true },
        ro: { title: true, statement: true, hints: false },
      },
      complete: false,
    });
    return;
  }

  // Wave F authoring-ops fixtures (item 128).
  const MOCK_ATTACHMENTS = [
    {
      id: 1,
      name: 'figure.png',
      kind: 'inline',
      size_bytes: 512,
      url: '/media/mock-figure.png',
    },
  ];

  // ---- Wave F authoring ops (items 122/126/128) ----
  const generateTests = path.match(/^\/api\/v1\/problems\/problems\/(\d+)\/generate-tests\/$/);
  if (req.method === 'POST' && generateTests) {
    readBody(req, (body) => {
      json(res, 201, {
        created: body.count ?? 5,
        first: '42 7',
        note: 'Inputs generated',
      });
    });
    return;
  }
  const variantSpawn = path.match(/^\/api\/v1\/problems\/problems\/(\d+)\/variants\/$/);
  if (req.method === 'POST' && variantSpawn) {
    json(res, 201, {
      variant_id: 12,
      root_id: Number(variantSpawn[1]),
      title: 'Two Sum — variant 1',
    });
    return;
  }
  const variantList = path.match(/^\/api\/v1\/problems\/problems\/(\d+)\/variants\/list\/$/);
  if (req.method === 'GET' && variantList) {
    json(res, 200, {
      root: Number(variantList[1]),
      count: 2,
      variants: [
        { id: Number(variantList[1]), title: 'Two Sum', note: '', status: 'DRAFT' },
        { id: 12, title: 'Two Sum — variant 1', note: '', status: 'DRAFT' },
      ],
    });
    return;
  }
  const attachments = path.match(/^\/api\/v1\/problems\/problems\/(\d+)\/attachments\/$/);
  if (attachments) {
    if (req.method === 'GET') {
      json(res, 200, { count: 1, results: MOCK_ATTACHMENTS });
      return;
    }
    if (req.method === 'POST') {
      readBody(req, (body) => {
        json(res, 201, {
          id: 2,
          name: body.name ?? '',
          kind: body.kind ?? 'inline',
          size_bytes: 4,
          url: '/media/mock',
          uploaded_at: new Date().toISOString(),
        });
      });
      return;
    }
  }

  // ---- Wave F recognition (items 66-69) ----
  if (path === '/api/v1/community/reputation/me/') {
    if (!sessionUser(req)) {
      json(res, 401, { detail: 'Authentication credentials were not provided.' });
      return;
    }
    json(res, 200, {
      honor: 30,
      breakdown: { approved_problem: 3 },
      tier: 'Contributor',
      next_tier: { name: 'Trusted', honor_needed: 70 },
      privileges: ['blog_publish', 'wiki_edit', 'wa_help_answer'],
      tiers: [
        { name: 'Newcomer', min_honor: 0 },
        { name: 'Contributor', min_honor: 25 },
      ],
    });
    return;
  }
  if (path === '/api/v1/community/reputation/tiers/') {
    json(res, 200, {
      tiers: [
        { name: 'Newcomer', min_honor: 0 },
        { name: 'Contributor', min_honor: 25 },
        { name: 'Trusted', min_honor: 100 },
        { name: 'Mentor', min_honor: 300 },
        { name: 'Legend', min_honor: 1000 },
      ],
    });
    return;
  }
  if (req.method === 'GET' && path === '/api/v1/community/awards/') {
    json(res, 200, {
      count: MOCK_AWARDS.length,
      next: null,
      previous: null,
      results: MOCK_AWARDS,
    });
    return;
  }
  if (req.method === 'GET' && path === '/api/v1/community/amas/') {
    json(res, 200, {
      count: MOCK_AMAS.length,
      results: MOCK_AMAS.map((session) => ({
        id: session.id,
        host: session.host,
        title: session.title,
        status: session.status,
        starts_at: session.starts_at,
      })),
    });
    return;
  }
  const amaDetail = path.match(/^\/api\/v1\/community\/amas\/(\d+)\/$/);
  if (req.method === 'GET' && amaDetail) {
    json(
      res,
      200,
      MOCK_AMAS.find((session) => session.id === Number(amaDetail[1])),
    );
    return;
  }
  const amaAsk = path.match(/^\/api\/v1\/community\/amas\/(\d+)\/questions\/$/);
  if (req.method === 'POST' && amaAsk) {
    const user = sessionUser(req);
    if (!user) {
      json(res, 401, { detail: 'Sign in to ask.' });
      return;
    }
    readBody(req, (body) => {
      json(res, 201, {
        id: 50,
        author: user.username,
        question: body.question ?? '',
        answer: '',
        answered_at: null,
        upvotes: 0,
      });
    });
    return;
  }
  const amaUpvote = path.match(/^\/api\/v1\/community\/amas\/questions\/(\d+)\/upvote\/$/);
  if (req.method === 'POST' && amaUpvote) {
    json(res, 200, { upvotes: 3, voted: true });
    return;
  }
  const amaAnswer = path.match(/^\/api\/v1\/community\/amas\/questions\/(\d+)\/answer\/$/);
  if (req.method === 'POST' && amaAnswer) {
    readBody(req, (body) => {
      json(res, 200, { id: Number(amaAnswer[1]), answer: body.answer ?? '' });
    });
    return;
  }
  if (req.method === 'GET' && path === '/api/v1/community/problem-requests/') {
    json(res, 200, {
      count: MOCK_REQUESTS.length,
      next: null,
      previous: null,
      results: MOCK_REQUESTS,
    });
    return;
  }
  if (path === '/api/v1/community/problem-requests/' && req.method === 'POST') {
    const user = sessionUser(req);
    if (!user) {
      json(res, 401, { detail: 'Sign in to open a request.' });
      return;
    }
    readBody(req, (body) => {
      json(res, 201, {
        id: 60,
        requester: user.id,
        requester_username: user.username,
        title: body.title ?? '',
        description: body.description ?? '',
        status: 'OPEN',
        fulfilled_problem: null,
        fulfilled_problem_title: null,
        vote_count: 0,
        created_at: new Date().toISOString(),
      });
    });
    return;
  }
  const requestVote = path.match(/^\/api\/v1\/community\/problem-requests\/(\d+)\/vote\/$/);
  if (req.method === 'POST' && requestVote) {
    json(res, 200, { votes: 6, voted: true });
    return;
  }

  // ---- Wave F publishing (items 61-65) ----
  if (req.method === 'GET' && path === '/api/v1/community/blogs/') {
    const url = new URL(req.url, 'http://mock.local');
    const author = url.searchParams.get('author');
    let rows = MOCK_BLOGS;
    if (author) rows = rows.filter((row) => row.author_username === author);
    json(res, 200, { count: rows.length, next: null, previous: null, results: rows });
    return;
  }
  if (path === '/api/v1/community/blogs/' && req.method === 'POST') {
    const user = sessionUser(req);
    if (!user) {
      json(res, 401, { detail: 'Authentication credentials were not provided.' });
      return;
    }
    readBody(req, (body) => {
      const slug = String(body.title || 'post')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-');
      json(res, 201, {
        id: 100,
        author: user.id,
        author_username: user.username,
        title: body.title ?? '',
        slug,
        body: body.body ?? '',
        lang: body.lang ?? 'en',
        status: body.status ?? 'DRAFT',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });
    return;
  }
  if (req.method === 'GET' && path === '/api/v1/community/wiki/') {
    json(res, 200, {
      count: MOCK_WIKI.length,
      results: MOCK_WIKI.map((page) => ({
        slug: page.slug,
        title_ro: page.title_ro,
        title_en: page.title_en,
        updated_at: '2026-11-10T10:00:00Z',
      })),
    });
    return;
  }
  const wikiPage = path.match(/^\/api\/v1\/community\/wiki\/([^/]+)\/$/);
  if (wikiPage && req.method === 'GET') {
    const page = MOCK_WIKI.find((row) => row.slug === wikiPage[1]);
    if (!page) {
      json(res, 404, { detail: 'No such wiki page.' });
      return;
    }
    json(res, 200, {
      ...page,
      updated_by_username: 'e2e_tester',
      updated_at: '2026-11-10T10:00:00Z',
    });
    return;
  }
  if (wikiPage && req.method === 'PUT') {
    const user = sessionUser(req);
    if (!user) {
      json(res, 401, { detail: 'Sign in to edit the wiki.' });
      return;
    }
    readBody(req, (body) => {
      const existing = MOCK_WIKI.find((row) => row.slug === wikiPage[1]);
      const updated = {
        slug: wikiPage[1],
        title_ro: body.title_ro ?? '',
        title_en: body.title_en ?? '',
        body_ro: body.body_ro ?? '',
        body_en: body.body_en ?? '',
      };
      if (existing) {
        Object.assign(existing, updated);
      } else {
        MOCK_WIKI.push(updated);
      }
      json(res, 201, {
        ...updated,
        updated_by_username: user.username,
        updated_at: new Date().toISOString(),
      });
    });
    return;
  }
  const wikiHistory = path.match(/^\/api\/v1\/community\/wiki\/([^/]+)\/history\/$/);
  if (req.method === 'GET' && wikiHistory) {
    json(res, 200, {
      count: 1,
      results: [{ id: 1, editor: 'e2e_tester', note: 'seed', created_at: '2026-11-10T10:00:00Z' }],
    });
    return;
  }
  if (req.method === 'GET' && path === '/api/v1/community/wa-help/') {
    json(res, 200, { count: MOCK_WA_HELP.length, results: MOCK_WA_HELP });
    return;
  }
  if (path === '/api/v1/community/wa-help/' && req.method === 'POST') {
    const user = sessionUser(req);
    if (!user) {
      json(res, 401, { detail: 'Sign in to ask for help.' });
      return;
    }
    readBody(req, (body) => {
      json(res, 201, {
        id: 55,
        submission: body.submission_id,
        asker: user.id,
        asker_username: user.username,
        problem_title: { en: 'Two Sum' },
        question: body.question ?? '',
        status: 'OPEN',
        answers: [],
        created_at: new Date().toISOString(),
      });
    });
    return;
  }
  const waAnswer = path.match(/^\/api\/v1\/community\/wa-help\/(\d+)\/answers\/$/);
  if (req.method === 'POST' && waAnswer) {
    const user = sessionUser(req);
    if (!user) {
      json(res, 401, { detail: 'Sign in to answer.' });
      return;
    }
    readBody(req, (body) => {
      json(res, 201, {
        id: 77,
        author: user.username,
        body: body.body ?? '',
        is_accepted: false,
        created_at: new Date().toISOString(),
      });
    });
    return;
  }
  const waAccept = path.match(/^\/api\/v1\/community\/wa-help\/(\d+)\/accept\/(\d+)\/$/);
  if (req.method === 'POST' && waAccept) {
    json(res, 200, { detail: 'Accepted.', answer: Number(waAccept[2]) });
    return;
  }
  const license = path.match(/^\/api\/v1\/submissions\/submissions\/(\d+)\/license\/$/);
  if (req.method === 'POST' && license) {
    readBody(req, (body) => {
      json(res, 200, { id: Number(license[1]), license: body.license ?? 'MIT' });
    });
    return;
  }
  if (
    req.method === 'GET' &&
    path === '/api/v1/community/feed/' &&
    new URL(req.url, 'http://mock.local').searchParams.get('following') === '1'
  ) {
    json(res, 200, {
      count: 1,
      page: 1,
      results: [
        {
          id: 601,
          user: 'rival',
          user_id: 5,
          problem: { id: 2, title_i18n: { en: 'Reverse String' } },
          language: 'python3',
          verdict: 'AC',
          score: 100,
          submission_time: '2026-11-10T09:00:00Z',
        },
      ],
      next: null,
    });
    return;
  }

  // ---- Wave F ratings depth (items 51/52/53) ----
  if (req.method === 'GET' && path === '/api/v1/ratings/divisions/') {
    json(res, 200, {
      divisions: [
        { name: 'Div 4', min_rating: 0, players: 12 },
        { name: 'Div 3', min_rating: 1200, players: 8 },
        { name: 'Div 2', min_rating: 1600, players: 3 },
        { name: 'Div 1', min_rating: 1900, players: 1 },
      ],
    });
    return;
  }

  const userDivisions = path.match(/^\/api\/v1\/ratings\/users\/([^/]+)\/divisions\/$/);
  if (req.method === 'GET' && userDivisions) {
    json(res, 200, {
      division: 'Div 2',
      rated: true,
      display_rating: 1512,
      changes: [
        {
          contest: 2,
          title: 'Second demo round',
          from: 'Div 3',
          to: 'Div 2',
          kind: 'promoted',
          rating: 1512,
        },
      ],
    });
    return;
  }

  const userPercentiles = path.match(/^\/api\/v1\/ratings\/users\/([^/]+)\/percentiles\/$/);
  if (req.method === 'GET' && userPercentiles) {
    json(res, 200, {
      rated: true,
      display_rating: 1512,
      overall: { percentile: 90.0, total: 40 },
      school: { name: 'CNERV', percentile: 66.7, total: 3 },
      county: { name: 'Cluj', percentile: 75.0, total: 4 },
    });
    return;
  }

  // ---- Wave F teams / prediction / calibration (items 49/50/55) ----
  const predict = path.match(/^\/api\/v1\/contests\/(\d+)\/predict\/$/);
  if (predict) {
    if (req.method === 'GET') {
      json(res, 200, { prediction: myPrediction ?? null, open: true });
      return;
    }
    if (req.method === 'POST') {
      const user = sessionUser(req);
      if (!user) {
        json(res, 401, { detail: 'Sign in to predict.' });
        return;
      }
      readBody(req, (body) => {
        const rank = Number(body.predicted_rank);
        if (!Number.isInteger(rank) || rank < 1) {
          json(res, 400, { predicted_rank: 'An integer rank is required.' });
          return;
        }
        myPrediction = rank;
        json(res, 201, { contest: Number(predict[1]), predicted_rank: rank });
      });
      return;
    }
  }

  const teamsList = path.match(/^\/api\/v1\/contests\/(\d+)\/teams\/$/);
  if (req.method === 'GET' && teamsList) {
    json(res, 200, {
      count: MOCK_TEAMS.length,
      results: MOCK_TEAMS,
    });
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/contests/1/standings/' && urlKindTeams(req)) {
    json(res, 200, {
      count: MOCK_TEAM_STANDINGS.length,
      next: null,
      previous: null,
      results: MOCK_TEAM_STANDINGS,
      format: 'IOI',
      frozen: false,
      section: 'teams',
      team_size: 3,
    });
    return;
  }

  const calibration = path.match(/^\/api\/v1\/ratings\/users\/([^/]+)\/calibration\/$/);
  if (req.method === 'GET' && calibration) {
    json(res, 200, {
      count: 1,
      mean_abs_error: 2,
      bias: -2,
      results: [
        {
          contest: 3,
          title: 'Spring Replay 2025',
          predicted_rank: 1,
          actual_rank: 3,
          error: -2,
          state: 'FINISHED',
        },
      ],
    });
    return;
  }

  // ---- Wave F contest depth (items 48/56/57/58) ----
  const commentary = path.match(/^\/api\/v1\/contests\/(\d+)\/commentary\/$/);
  if (commentary) {
    if (req.method === 'GET') {
      json(res, 200, {
        count: MOCK_COMMENTARY.length,
        results: MOCK_COMMENTARY.filter((c) => c.contest === Number(commentary[1])),
      });
      return;
    }
    if (req.method === 'POST') {
      const user = sessionUser(req);
      if (!user || user.role !== 'ADMIN') {
        json(res, 403, { detail: 'Organizer only.' });
        return;
      }
      readBody(req, (body) => {
        json(res, 201, {
          id: 99,
          author: user.id,
          author_username: user.username,
          minute_offset: body.minute_offset ?? 0,
          text: body.text ?? '',
          created_at: new Date().toISOString(),
        });
      });
      return;
    }
  }

  const dramaView = path.match(/^\/api\/v1\/contests\/(\d+)\/drama\/$/);
  if (req.method === 'GET' && dramaView) {
    json(res, 200, {
      is_frozen: true,
      freeze_at: '2026-11-01T10:00:00Z',
      reveal_at: '2026-11-01T11:00:00Z',
      seconds_until_reveal: 1800,
      results: [
        {
          rank: 1,
          user: { id: 1, username: 'e2e_tester' },
          score: 100,
          solved: 1,
          hidden_submissions: 0,
        },
        {
          rank: 2,
          user: { id: 2, username: 'rival' },
          score: 50,
          solved: 0,
          hidden_submissions: 2,
        },
      ],
    });
    return;
  }

  const replayView = path.match(/^\/api\/v1\/contests\/(\d+)\/replay\/([^/]+)\/$/);
  if (req.method === 'GET' && replayView) {
    json(res, 200, {
      contest: Number(replayView[1]),
      username: decodeURIComponent(replayView[2]),
      is_virtual: false,
      final_rank: 2,
      rating_change: { delta: 20, rating: 1520 },
      events: [
        {
          minute_offset: 10,
          problem_label: 'A',
          problem_id: 1,
          verdict: 'WA',
          score: 10,
          problem_best: 10,
          problem_max: 100,
          total: 10,
          submission_id: 51,
        },
        {
          minute_offset: 40,
          problem_label: 'A',
          problem_id: 1,
          verdict: 'AC',
          score: 100,
          problem_best: 100,
          problem_max: 100,
          total: 100,
          submission_id: 52,
        },
      ],
    });
    return;
  }

  const hackFeed = path.match(/^\/api\/v1\/contests\/(\d+)\/hacks\/$/);
  if (hackFeed) {
    if (req.method === 'GET') {
      json(res, 200, {
        count: MOCK_HACKS.length,
        results: MOCK_HACKS,
        window_open: true,
      });
      return;
    }
    if (req.method === 'POST') {
      const user = sessionUser(req);
      if (!user) {
        json(res, 401, { detail: 'Sign in to submit hacks.' });
        return;
      }
      readBody(req, (body) => {
        json(res, 201, {
          id: 77,
          contest: Number(hackFeed[1]),
          problem_label: 'A',
          hacker: user.id,
          hacker_username: user.username,
          target_id: body.target_submission_id,
          target_username: 'rival',
          input_data: body.input_data ?? '',
          verdict: 'SUCCESSFUL',
          feedback: 'Wrong answer on the hack input.',
          judged_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        });
      });
      return;
    }
  }

  const hackTargets = path.match(/^\/api\/v1\/contests\/(\d+)\/hacks\/targets\/$/);
  if (req.method === 'GET' && hackTargets) {
    if (!sessionUser(req)) {
      json(res, 403, { detail: 'Register for the contest first.' });
      return;
    }
    json(res, 200, {
      count: 1,
      results: [
        {
          id: 9,
          user: { username: 'rival' },
          problem_id: 1,
          problem_label: 'A',
          language: 'python3',
          verdict: 'AC',
          score: 100,
          code: 'n = int(input())\nprint(n + 1)',
          submission_time: '2026-11-01T09:40:00Z',
        },
      ],
    });
    return;
  }

  const hackLock = path.match(/^\/api\/v1\/contests\/(\d+)\/lock\/(\d+)\/$/);
  if (req.method === 'POST' && hackLock) {
    if (!sessionUser(req)) {
      json(res, 401, { detail: 'Authentication credentials were not provided.' });
      return;
    }
    json(res, 200, {
      detail: 'Locked — you can now hack this problem’s solutions.',
      contest_problem: Number(hackLock[2]),
    });
    return;
  }

  const contestDetail = path.match(/^\/api\/v1\/contests\/(\d+)\/$/);
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

  const contestRegister = path.match(/^\/api\/v1\/contests\/(\d+)\/register\/$/);
  if (req.method === 'POST' && contestRegister) {
    if (!sessionUser(req)) {
      json(res, 401, { detail: 'Authentication credentials were not provided.' });
      return;
    }
    json(res, 201, { contest: Number(contestRegister[1]), user: sessionUser(req).id });
    return;
  }

  const contestProblems = path.match(/^\/api\/v1\/contests\/(\d+)\/problems\/$/);
  if (req.method === 'GET' && contestProblems) {
    json(res, 200, MOCK_CONTEST_PROBLEMS);
    return;
  }

  const contestStandings = path.match(/^\/api\/v1\/contests\/(\d+)\/standings\/$/);
  if (req.method === 'GET' && contestStandings) {
    if (
      Number(contestStandings[1]) === 77 &&
      requestUrl.searchParams.get('section') !== 'virtual'
    ) {
      // DMOJ/campion hidden board: explicitly empty while the contest runs.
      json(res, 200, {
        count: 0,
        next: null,
        previous: null,
        results: [],
        format: 'IOI',
        frozen: false,
        hidden: true,
        section: 'official',
      });
      return;
    }
    if (requestUrl.searchParams.get('section') === 'virtual') {
      json(res, 200, { ...MOCK_STANDINGS, section: 'virtual', count: 1 });
    } else {
      json(res, 200, { ...MOCK_STANDINGS, section: 'official' });
    }
    return;
  }

  const contestAwards = path.match(/^\/api\/v1\/contests\/(\d+)\/awards\/$/);
  if (req.method === 'GET' && contestAwards) {
    json(res, 200, {
      count: 1,
      results: [{ rank: 1, medal: 'GOLD', user: { id: 2, username: 'alice_e2e' } }],
    });
    return;
  }

  const contestVirtualStart = path.match(/^\/api\/v1\/contests\/(\d+)\/virtual-start\/$/);
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

  // RAT-1: public per-user rating history (profile rating graph).
  const ratingHistory = path.match(/^\/api\/v1\/ratings\/ratings\/users\/([^/]+)\/$/);
  if (req.method === 'GET' && ratingHistory) {
    const username = decodeURIComponent(ratingHistory[1]);
    if (username !== 'e2e_tester') {
      json(res, 404, { detail: 'Not found.' });
      return;
    }
    json(res, 200, {
      username: 'e2e_tester',
      rating: {
        rated: true,
        rating: 1512,
        internal_rating: 1560,
        rd: 40,
        contests_count: 2,
        band: { min: 1400, name_en: 'Specialist', name_ro: 'Specialist', color: '#0000ff' },
      },
      history: [
        {
          contest: 1,
          contest_title: { en: 'WebCoder demo contest', ro: 'Concurs demonstrativ WebCoder' },
          end_at: '2026-11-01T12:00:00Z',
          rank: 3,
          rating: 1480,
          display_rating: 1480,
          delta: -20,
          rating_before: 1500,
        },
        {
          contest: 2,
          contest_title: { en: 'Second demo round', ro: 'A doua rundă demonstrativă' },
          end_at: '2026-11-08T12:00:00Z',
          rank: 2,
          rating: 1512,
          display_rating: 1512,
          delta: 32,
          rating_before: 1480,
        },
      ],
      // Wave F item 51 — graph annotations + the division chip.
      annotations: {
        0: { peak: 1480 },
        1: { peak: 1512, medal: 'GOLD', division_change: 'promoted', division: 'Div 2' },
      },
      division: 'Div 2',
    });
    return;
  }

  // Wave G item 99: the teacher's class list (with the join code + the
  // has_password flag the QR card reads).
  if (req.method === 'GET' && path === '/api/v1/classroom/classes/') {
    json(res, 200, {
      results: [
        {
          id: 31,
          name: 'IX-A',
          school: 'CNIT',
          join_code: 'AB12CD',
          has_password: true,
          is_open: true,
          created_at: '2026-09-01T08:00:00Z',
          teacher_username: 'admin_e2e',
          member_count: 12,
          assignment_count: 2,
        },
      ],
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

  // EDU-5: the teacher grid — admin/teacher sessions only, mirroring the
  // backend's classroom-ownership gate (students 403 and stay students).
  const assignmentGrid = path.match(/^\/api\/v1\/classroom\/assignments\/(\d+)\/grid\/$/);
  if (req.method === 'GET' && assignmentGrid) {
    const session = sessionUser(req);
    const isTeacherLane =
      session && (session.username === 'admin_e2e' || session.username === 'e2e_teacher');
    if (!isTeacherLane) {
      json(res, 403, { detail: 'Only the teacher can view the grid.' });
      return;
    }
    json(res, 200, {
      assignment_id: Number(assignmentGrid[1]),
      students: [
        { id: 2, username: 'e2e_tester' },
        { id: 3, username: 'elev_ro' },
      ],
      problems: [{ id: 1, problem_id: 1, label: 'A', points: 100, title_i18n: { en: 'Two Sum' } }],
      cells: {
        2: { 1: { best: 100, verdict: 'AC', attempts: 1, late: false } },
        3: { 1: { best: 60, verdict: 'WA', attempts: 2, late: false } },
      },
    });
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

  const quizSubmit = path.match(/^\/api\/v1\/classroom\/assignments\/(\d+)\/quiz\/submit\/$/);
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

  const deliverables = path.match(/^\/api\/v1\/classroom\/assignments\/(\d+)\/deliverables\/$/);
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
    /^\/api\/v1\/problems\/problems\/(\d+)\/statement-revisions\/$/,
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
      license:
        "Code stays the author's; the platform displays it under the Terms of Service submission grant.",
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
  const communityEditorials = path.match(/^\/api\/v1\/problems\/(\d+)\/community-editorials\/$/);
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

  const relatedProblems = path.match(/^\/api\/v1\/problems\/problems\/(\d+)\/related\/$/);
  if (req.method === 'GET' && relatedProblems) {
    json(res, 200, MOCK_RELATED_PROBLEMS);
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/problems/tracks/') {
    json(res, 200, { count: 1, next: null, previous: null, results: [trackDetail()] });
    return;
  }
  const trackSlug = path.match(/^\/api\/v1\/problems\/tracks\/([^/]+)\/$/);
  if (req.method === 'GET' && trackSlug) {
    if (trackSlug[1] === 'beginner-ladder') {
      json(res, 200, trackDetail());
      return;
    }
    json(res, 404, { detail: 'Not found.' });
    return;
  }
  const trackAdd = path.match(/^\/api\/v1\/problems\/tracks\/([^/]+)\/add-problem\/$/);
  if (req.method === 'POST' && trackAdd) {
    readBody(req, (body) => {
      if (trackItems.some((item) => item.problem_id === body.problem_id)) {
        json(res, 400, { detail: 'Problem already in this track.' });
        return;
      }
      trackItems.push(trackItem(body.problem_id, trackItems.length + 1, false));
      json(res, 201, trackDetail());
    });
    return;
  }
  const trackMove = path.match(/^\/api\/v1\/problems\/tracks\/([^/]+)\/move-problem\/$/);
  if (req.method === 'POST' && trackMove) {
    readBody(req, (body) => {
      const index = trackItems.findIndex((item) => item.problem_id === body.problem_id);
      const target = body.direction === 'up' ? index - 1 : index + 1;
      if (index === -1 || target < 0 || target >= trackItems.length) {
        json(res, 400, { detail: 'Already at the edge of the track.' });
        return;
      }
      const [moved] = trackItems.splice(index, 1);
      trackItems.splice(target, 0, moved);
      trackItems = trackItems.map((item, i) => ({ ...item, position: i + 1 }));
      json(res, 200, trackDetail());
    });
    return;
  }
  const trackRemove = path.match(/^\/api\/v1\/problems\/tracks\/([^/]+)\/remove-problem\/$/);
  if (req.method === 'POST' && trackRemove) {
    readBody(req, (body) => {
      trackItems = trackItems
        .filter((item) => item.problem_id !== body.problem_id)
        .map((item, i) => ({ ...item, position: i + 1 }));
      json(res, 200, trackDetail());
    });
    return;
  }

  const relatedArticles = path.match(/^\/api\/v1\/problems\/(\d+)\/related-articles\/$/);
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
    let rows = MOCK_THREADS;
    const problemId = requestUrl.searchParams.get('problem_id');
    if (problemId) rows = rows.filter((t) => t.problem && String(t.problem.id) === problemId);
    if (requestUrl.searchParams.get('announcements') === '1') {
      rows = rows.filter((t) => t.is_announcement);
    }
    const lang = requestUrl.searchParams.get('lang');
    if (lang === 'ro' || lang === 'en') rows = rows.filter((t) => t.lang === lang);
    const topic = requestUrl.searchParams.get('topic');
    if (topic === 'editorial') rows = rows.filter((t) => t.editorial);
    else if (topic === 'problem') rows = rows.filter((t) => t.problem);
    json(res, 200, paged(rows));
    return;
  }

  // COM-4: follow toggle by handle.
  const followByName = path.match(/^\/api\/v1\/users\/username\/([^/]+)\/follow\/$/);
  if (req.method === 'POST' && followByName) {
    if (!sessionUser(req)) {
      json(res, 401, { detail: 'Authentication credentials were not provided.' });
      return;
    }
    json(res, 200, { following: true, followers: 1 });
    return;
  }
  if (path === '/api/v1/users/me/following/' && req.method === 'GET') {
    json(res, 200, { count: 1, results: [{ id: 2, username: 'e2e_tester' }] });
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
    json(res, 200, cursorPaged([...messagingState.notifications, ...MOCK_NOTIFICATIONS]));
    return;
  }

  if (req.method === 'GET' && path === '/api/v1/notifications/unread-count/') {
    json(res, 200, {
      count:
        MOCK_NOTIFICATIONS.filter((n) => n.read_at === null).length +
        messagingState.notifications.filter((n) => n.read_at === null).length,
    });
    return;
  }

  // ---- COM-5 private messaging (threads, history, send, read) ----
  if (req.method === 'GET' && path === '/api/v1/messages/threads/') {
    json(res, 200, {
      count: 1,
      next: null,
      previous: null,
      results: [messagingState.conversation],
    });
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
  const sendMatch = path.match(/^\/api\/v1\/messages\/threads\/(\d+)\/send\/$/);
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
        data: {
          conversation_id: Number(sendMatch[1]),
          message_id: message.id,
          excerpt: text.slice(0, 80),
        },
        read_at: null,
        created_at: message.created_at,
      });
      json(res, 201, message);
    });
    return;
  }
  const msgReportMatch = path.match(/^\/api\/v1\/messages\/messages\/(\d+)\/report\/$/);
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
    json(res, 200, {
      count: messagingState.blocks.length,
      next: null,
      previous: null,
      results: messagingState.blocks,
    });
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
    const reports = status
      ? messagingState.reports.filter((r) => r.status === status)
      : messagingState.reports;
    json(res, 200, { count: reports.length, next: null, previous: null, results: reports });
    return;
  }
  const resolveMatch = path.match(/^\/api\/v1\/messages\/moderation\/reports\/(\d+)\/resolve\/$/);
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
    json(res, 200, {
      count: messagingState.flagged.length,
      next: null,
      previous: null,
      results: messagingState.flagged,
    });
    return;
  }
  // Admin audit: metadata-only thread rows; transcripts sealed behind an
  // explicit report (the mock unseals conversation 1 once a report exists).
  if (req.method === 'GET' && path === '/api/v1/messages/admin/threads/') {
    const hasReport = messagingState.reports.length > 0;
    json(res, 200, {
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 1,
          participants: [
            { id: 1, username: 'e2e_tester' },
            { id: 2, username: 'admin_e2e' },
          ],
          message_count: messagingState.messages.length,
          has_report: hasReport,
          created_at: '2026-10-29T08:00:00Z',
          updated_at: '2026-10-29T09:00:00Z',
        },
      ],
    });
    return;
  }
  const transcriptMatch = path.match(/^\/api\/v1\/messages\/admin\/threads\/(\d+)\/transcript\/$/);
  if (req.method === 'GET' && transcriptMatch) {
    if (messagingState.reports.length === 0) {
      json(res, 403, { detail: 'transcript_requires_report' });
      return;
    }
    json(res, 200, {
      conversation: {
        id: 1,
        participants: [
          { id: 1, username: 'e2e_tester' },
          { id: 2, username: 'admin_e2e' },
        ],
        message_count: messagingState.messages.length,
        has_report: true,
        created_at: '2026-10-29T08:00:00Z',
        updated_at: '2026-10-29T09:00:00Z',
      },
      messages: messagingState.messages.map((m, index) => ({
        ...m,
        is_flagged: m.id === 2,
        flag_categories: m.id === 2 ? ['grooming'] : [],
        id: m.id ?? index,
      })),
    });
    return;
  }

  // ---- Wave D atestats (certifications) --------------------------------
  // [Wave D certifications — the honest variant] Two fixtures: a VALID
  // participation certificate and a REVOKED rating milestone, so the e2e
  // lane covers both verification answers.
  const MOCK_CERTIFICATES = [
    {
      uuid: 'e2e-cert-0001-valid-000000000001',
      serial: 'WC-2026-000042',
      kind: 'CONTEST_PARTICIPATION',
      status: 'VALID',
      holder: 'e2e_tester',
      details: {
        rank: 3,
        rating_after: 1662,
        contest_id: 1,
        contest_title_en: 'Winter Cup',
        contest_title_ro: 'Cupa de Iarnă',
        contest_end: '2026-11-01',
      },
      issued_at: '2026-11-02T10:00:00Z',
      revoked_at: null,
      revoked_reason: '',
    },
    {
      uuid: 'e2e-cert-0002-revoked-0000000002',
      serial: 'WC-2026-000043',
      kind: 'RATING_MILESTONE',
      status: 'REVOKED',
      holder: 'e2e_tester',
      details: { threshold: 1600, rating: 1610 },
      issued_at: '2026-11-02T10:00:01Z',
      revoked_at: '2026-11-05T09:00:00Z',
      revoked_reason: 'contest 1 ratings discarded by organizer',
    },
  ];

  if (req.method === 'GET' && path === '/api/v1/certificates/mine/') {
    if (!sessionUser(req)) {
      json(res, 401, { detail: 'Authentication credentials were not provided.' });
      return;
    }
    json(res, 200, {
      count: MOCK_CERTIFICATES.length,
      next: null,
      previous: null,
      results: MOCK_CERTIFICATES,
    });
    return;
  }
  if (req.method === 'GET' && path.startsWith('/api/v1/certificates/verify/')) {
    const uuid = path.slice('/api/v1/certificates/verify/'.length).replace(/\/$/, '');
    const found = MOCK_CERTIFICATES.find((c) => c.uuid === uuid);
    if (!found) {
      json(res, 404, { detail: 'Not found.' });
      return;
    }
    json(res, 200, found);
    return;
  }

  // [wave G items 135/139] public aggregate status feed.
  if (req.method === 'GET' && path === '/api/v1/ops/status/') {
    json(res, 200, {
      generated_at: new Date().toISOString(),
      overall: 'ok',
      components: { api: { state: 'ok' }, judge: { state: 'ok', backlog: 2 } },
      queue_lanes: { contest: 1, practice: 1 },
      judge_last_24h: {
        window_hours: 24,
        judged: 128,
        avg_execution_ms: 145,
        max_execution_ms: 1990,
      },
      error_rate_1h: 0.0008,
    });
    return;
  }
  // [wave G items 136/143/145] admin operator surfaces.
  if (req.method === 'GET' && path === '/api/v1/ops/autoscale/') {
    json(res, 200, {
      current_workers: 1,
      recommended_workers: 2,
      direction: 'up',
      queue_depth: 11,
    });
    return;
  }
  if (req.method === 'GET' && path === '/api/v1/ops/costs/') {
    json(res, 200, {
      currency: 'EUR',
      period: 'month',
      lines: {
        vm_worker: { formula: '1 × 12.0', eur: 12.0 },
        vm_judge: { formula: '1 × 12.0', eur: 12.0 },
        storage: { formula: '0.4 GB × 0.1', eur: 0.04 },
        bandwidth: { formula: '0.2 GB × 0.05', eur: 0.01 },
      },
      total: 24.05,
    });
    return;
  }
  if (req.method === 'GET' && path === '/api/v1/ops/errors/') {
    json(res, 200, {
      window_hours: 24,
      total: 2,
      grouped: [
        { digest: 'mock-d1', path: '/api/v1/problems/', method: 'GET', status_code: 500, count: 2 },
      ],
      events: [],
    });
    return;
  }
  // [wave G item 147] school partnership applications.
  if (req.method === 'POST' && path === '/api/v1/partnerships/apply/') {
    json(res, 201, { id: 7, status: 'PENDING' });
    return;
  }
  // [wave G item 150] public transparency data layer.
  if (req.method === 'GET' && path === '/api/v1/public/transparency/') {
    json(res, 200, {
      users: { total: 512 },
      content: { problems_by_status: { APPROVED: 240, DRAFT: 30 } },
      activity: {
        submissions_total: 18432,
        submission_verdicts: { AC: 9000, WA: 8000 },
        contests_held: 12,
        teacher_certificates: 4,
      },
      moderation: {
        actions_by_kind: { CONTENT_HIDDEN: 6 },
        appeals_by_outcome: { ACCEPTED: 1, REJECTED: 2, PENDING: 1 },
      },
    });
    return;
  }
  // [wave G item 148] teacher certification exam.
  if (req.method === 'GET' && path === '/api/v1/certificates/teacher-exam/') {
    json(res, 200, {
      pass_threshold: 0.8,
      questions: [
        {
          id: 1,
          question: 'What does exam mode do to a student account?',
          choices: ['Locks the site to the exam teme', 'Nothing', 'Raises limits'],
        },
      ],
    });
    return;
  }
  if (req.method === 'POST' && path === '/api/v1/certificates/teacher-exam/') {
    json(res, 200, {
      attempt_id: 3,
      correct: 1,
      total: 1,
      score: 1.0,
      passed: true,
      certificate_uuid: 'aaaaaaaa-0000-0000-0000-0000000000ee',
    });
    return;
  }

  json(res, 404, { detail: `No mock for ${req.method} ${path}` });
});

server.listen(PORT, HOST, () => {
  console.log(`[mock-api] listening on http://${HOST}:${PORT}`);
});
