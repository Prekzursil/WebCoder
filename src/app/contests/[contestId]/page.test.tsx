import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import ContestDetailPage from "./page";
import type { User } from "@/types";

// Contest detail tests (Wave B CON-1/2/3/4/6 + RAT UI): register/start
// actions, problems tab links through ?contest= (gated submit), standings
// with color handles + freeze notice, clarifications ask/list, and the
// per-contest rating-changes table (RAT-1 CF pattern).

const api = vi.hoisted(() => ({
  getContest: vi.fn(),
  register: vi.fn(),
  startPersonalClock: vi.fn(),
  getProblems: vi.fn(),
  getStandings: vi.fn(),
  getClarifications: vi.fn(),
  askClarification: vi.fn(),
  getRatingChanges: vi.fn(),
  getAwards: vi.fn(),
  startVirtual: vi.fn(),
}));

vi.mock("@/services/ApiService", () => ({
  ContestService: api,
}));

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    user: { id: 7, username: "bob", email: "b@x.com", role: "BASIC_USER" } as User | null,
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => mocks.auth,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ contestId: "1" }),
}));

const BASE = {
  id: 1,
  title_i18n: { en: "Autumn Open", ro: "Openul de toamnă" },
  description_i18n: {},
  visibility: "PUBLIC",
  is_rated: true,
  format: "IOI",
  start_at: "2026-10-01T10:00:00Z",
  end_at: "2026-10-01T12:00:00Z",
  freeze_at: null,
  is_window: false,
  per_user_duration_minutes: 180,
  pretest_mode: false,
  created_by: 1,
  created_by_username: "admin",
  state: "RUNNING",
  problem_count: 2,
  participant_count: 5,
  my_participation: null,
  can_manage: false,
};

const PROBLEMS = [
  {
    id: 11,
    problem: 101,
    problem_title: { en: "Sum Two", ro: "Suma a două" },
    problem_difficulty: "EASY",
    order: 0,
    label: "A",
    points: 100,
  },
  {
    id: 12,
    problem: 102,
    problem_title: { en: "Max Subarray", ro: "Subșir maxim" },
    problem_difficulty: "MEDIUM",
    order: 1,
    label: "B",
    points: 100,
  },
];

const STANDINGS = {
  count: 2,
  next: null,
  previous: null,
  format: "IOI",
  frozen: true,
  results: [
    {
      rank: 1,
      user: { id: 2, username: "alice" },
      score: 200,
      solved: 2,
      penalty_minutes: null,
      problems: [
        {
          label: "A",
          points_max: 100,
          best: 100,
          attempts: 1,
          wrong: 0,
          first_ac_at: "2026-10-01T10:10:00Z",
          last_improvement: null,
        },
        {
          label: "B",
          points_max: 100,
          best: 100,
          attempts: 2,
          wrong: 1,
          first_ac_at: "2026-10-01T10:40:00Z",
          last_improvement: null,
        },
      ],
    },
    {
      rank: 2,
      user: { id: 3, username: "carol" },
      score: 40,
      solved: 0,
      penalty_minutes: null,
      problems: [
        {
          label: "A",
          points_max: 100,
          best: 40,
          attempts: 3,
          wrong: 2,
          first_ac_at: null,
          last_improvement: null,
        },
        {
          label: "B",
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

const CLARIFICATIONS = [
  {
    id: 21,
    contest: 1,
    problem_id: null,
    asker_username: "alice",
    question: "Is the array sorted?",
    answer: "No.",
    answered_by_username: "admin",
    answered_at: "2026-10-01T10:20:00Z",
    is_broadcast: true,
    is_hidden: false,
    created_at: "2026-10-01T10:15:00Z",
  },
];

const RATING_CHANGES = {
  contest: 1,
  is_rated: true,
  discarded: false,
  changes: [
    {
      rank: 1,
      username: "alice",
      rating_before: 1500,
      rating_after: 1560,
      delta: 60,
      display_rating: 1460,
      band: { min: 1400, name_en: "Specialist", name_ro: "Specialist", color: "#0000ff" },
    },
  ],
};

beforeEach(() => {
  api.getAwards.mockResolvedValue({ count: 0, results: [] });
  vi.clearAllMocks();
  api.getContest.mockResolvedValue(BASE);
  api.getProblems.mockResolvedValue(PROBLEMS);
  api.getStandings.mockResolvedValue(STANDINGS);
  api.getClarifications.mockResolvedValue({ results: CLARIFICATIONS, canned_answers: [] });
  api.getRatingChanges.mockResolvedValue(RATING_CHANGES);
});

afterEach(cleanup);

describe("ContestDetailPage", () => {
  it("shows register; registering reloads the contest with participation", async () => {
    api.register.mockResolvedValue({ contest: 1, user: 7 });
    api.getContest.mockResolvedValueOnce(BASE).mockResolvedValueOnce({
      ...BASE,
      my_participation: {
        virtual_start: null,
        effective_start: BASE.start_at,
        effective_end: BASE.end_at,
        is_disqualified: false,
      },
    });
    render(<ContestDetailPage />);

    const registerButton = await screen.findByRole("button", { name: "Register" });
    fireEvent.click(registerButton);
    await waitFor(() => expect(api.register).toHaveBeenCalledWith("1"));
    // After reload the user is registered — the button disappears and the
    // problems tab (default for RUNNING) renders problem links through
    // ?contest=1 so submissions hit the contest gate.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Register" })).not.toBeInTheDocument(),
    );
    const problemLink = await screen.findByRole("link", { name: "Sum Two" });
    expect(problemLink).toHaveAttribute("href", "/problems/101?contest=1");
  });

  it("windowed contests expose the personal-timer start button (CON-6)", async () => {
    api.getContest.mockResolvedValue({
      ...BASE,
      is_window: true,
      my_participation: {
        virtual_start: null,
        effective_start: BASE.start_at,
        effective_end: BASE.end_at,
        is_disqualified: false,
      },
    });
    api.startPersonalClock.mockResolvedValue({
      virtual_start: "2026-10-01T10:05:00Z",
      effective_end: "2026-10-01T11:05:00Z",
    });
    render(<ContestDetailPage />);

    const startButton = await screen.findByRole("button", { name: "Start my timer" });
    fireEvent.click(startButton);
    await waitFor(() => expect(api.startPersonalClock).toHaveBeenCalledWith("1"));
  });

  it("standings: frozen notice, color handles, per-problem cells (CON-3/RAT-3)", async () => {
    api.getContest.mockResolvedValue({ ...BASE, state: "FINISHED" });
    render(<ContestDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Standings" }));
    expect(await screen.findByTestId("standings-frozen-note")).toHaveTextContent("frozen");
    const aliceRow = await screen.findByTestId("standings-row-alice");
    expect(aliceRow).toHaveTextContent("200");
    // Solved cell renders ✓, partial renders the raw score.
    expect(screen.getAllByText("✓ 100").length).toBeGreaterThan(0);
    expect(screen.getAllByText("40").length).toBeGreaterThan(0);
  });

  it("clarifications: list broadcast answers and ask a new question (CON-4)", async () => {
    render(<ContestDetailPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Clarifications" }));

    expect(await screen.findByText("Is the array sorted?")).toBeInTheDocument();
    expect(screen.getByText("➜ No.")).toBeInTheDocument();
    expect(screen.getByText(/Broadcast/)).toBeInTheDocument();

    api.askClarification.mockResolvedValue(CLARIFICATIONS[0]);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Limits?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await waitFor(() => expect(api.askClarification).toHaveBeenCalledWith("1", "Limits?"));
  });

  it("finished rated contests show per-contest rating changes (RAT-1)", async () => {
    api.getContest.mockResolvedValue({ ...BASE, state: "FINISHED" });
    render(<ContestDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Rating changes" }));
    // UserChip renders the username and (display) rating as one unit.
    const chip = await screen.findByText("alice", { exact: false });
    expect(chip.textContent).toContain("(1460)");
    expect(screen.getByText("+60")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Wave C CON-5 / CON-11: virtual participation + medal table.
// ---------------------------------------------------------------------------

describe("ContestDetailPage virtual participation + awards", () => {
  it("offers Practice virtually on a finished contest and starts the replay", async () => {
    api.getContest.mockResolvedValue({
      ...BASE,
      state: "FINISHED",
      my_participation: null,
    });
    api.getStandings.mockResolvedValue({
      ...STANDINGS,
      frozen: false,
      section: "official",
    });
    api.startVirtual.mockResolvedValue({
      virtual_start: "2026-11-02T10:00:00Z",
      effective_end: "2026-11-02T12:00:00Z",
      is_virtual: true,
    });
    render(<ContestDetailPage />);

    const virtualButton = await screen.findByTestId("virtual-start-button");
    // The awards fetch resolves concurrently with the button render —
    // waitFor instead of a synchronous assertion (CI-load race found by
    // the wave-D PR's pipeline run).
    await waitFor(() => expect(api.getAwards).toHaveBeenCalled());
    fireEvent.click(virtualButton);
    await waitFor(() => expect(api.startVirtual).toHaveBeenCalledWith("1"));
  });

  it("shows the running-virtual note when my_participation is a replay", async () => {
    api.getContest.mockResolvedValue({
      ...BASE,
      state: "FINISHED",
      my_participation: {
        virtual_start: "2026-11-02T10:00:00Z",
        effective_start: "2026-11-02T10:00:00Z",
        effective_end: "2026-11-02T12:00:00Z",
        is_virtual: true,
        is_disqualified: false,
      },
    });
    api.getStandings.mockResolvedValue({ ...STANDINGS, frozen: false });
    render(<ContestDetailPage />);

    expect(await screen.findByTestId("virtual-active-note")).toBeInTheDocument();
    expect(screen.queryByTestId("virtual-start-button")).not.toBeInTheDocument();
  });

  it("switches between official and virtual standings sections", async () => {
    api.getContest.mockResolvedValue({ ...BASE, state: "FINISHED" });
    api.getStandings.mockResolvedValue({ ...STANDINGS, frozen: false });
    render(<ContestDetailPage />);

    await screen.findByTestId("board-section-official");
    fireEvent.click(screen.getByTestId("board-section-virtual"));
    await waitFor(() =>
      // COM-4: friends flag rides every standings fetch (off by default).
      expect(api.getStandings).toHaveBeenCalledWith("1", 1, "virtual", false),
    );
  });

  it("renders the medal strip when the contest awarded medals", async () => {
    api.getContest.mockResolvedValue({ ...BASE, state: "FINISHED" });
    api.getStandings.mockResolvedValue({ ...STANDINGS, frozen: false });
    api.getAwards.mockResolvedValue({
      count: 1,
      results: [{ rank: 1, medal: "GOLD", user: { id: 2, username: "alice" } }],
    });
    render(<ContestDetailPage />);

    expect(await screen.findByTestId("contest-awards")).toHaveTextContent("alice");
  });
});
