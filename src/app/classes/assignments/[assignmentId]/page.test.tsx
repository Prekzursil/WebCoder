import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import AssignmentDetailPage from "./page";
import type { User } from "@/types";

// Temă detail tests (Wave B EDU-2/5/6 UI): students see the problem set;
// the owning teacher additionally sees the EDU-5 grid with best scores +
// late flags and the EDU-6 CSV export link.

const api = vi.hoisted(() => ({
  getAssignment: vi.fn(),
  getGrid: vi.fn(),
  getQuizSheet: vi.fn(),
  submitQuiz: vi.fn(),
  getDeliverables: vi.fn(),
  // JDG-13: the diff-view data source (teacher-only panel).
  getAssignmentSolutionsJson: vi.fn().mockResolvedValue({ count: 0, results: [] }),
  uploadDeliverable: vi.fn(),
  exportCsvUrl: (id: number | string) => `/api/v1/classroom/assignments/${id}/export/`,
}));

vi.mock("@/services/ApiService", () => ({
  ClassroomService: api,
}));

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    user: { id: 2, username: "teacher", email: "t@x.com", role: "TEACHER" } as User | null,
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => mocks.auth,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ assignmentId: "3" }),
}));

const ASSIGNMENT = {
  id: 3,
  classroom: 5,
  classroom_name: "IX-A",
  title_i18n: { en: "Tema 1 — loops", ro: "Tema 1 — bucle" },
  description: "Practice for loops.",
  available_from: "2026-10-20T00:00:00Z",
  due_at: "2999-01-01T00:00:00Z",
  late_until: null,
  is_exam: false,
  kind: "PROBLEMS",
  quiz_shuffle: true,
  file_extensions: "",
  max_file_mb: 10,
  state: "OPEN",
  assignment_problems: [
    {
      id: 11,
      problem: 101,
      problem_title: { en: "Sum Two", ro: "Suma a două" },
      problem_difficulty: "EASY",
      order: 0,
      label: "A",
      points: 100,
    },
  ],
};

const GRID = {
  assignment_id: 3,
  students: [
    { id: 10, username: "alice" },
    { id: 11, username: "bob" },
  ],
  problems: [{ id: 11, problem_id: 101, label: "A", points: 100, title_i18n: { en: "Sum Two" } }],
  cells: {
    "10:101": {
      best_score: 100,
      attempts: 1,
      last_attempt_at: "2026-10-21T00:00:00Z",
      verdict: "AC",
      late: false,
    },
    "11:101": {
      best_score: 55,
      attempts: 2,
      last_attempt_at: "2026-10-22T00:00:00Z",
      verdict: "WA",
      late: true,
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getAssignment.mockResolvedValue(ASSIGNMENT);
});

afterEach(cleanup);

describe("AssignmentDetailPage", () => {
  it("teacher: problem set + progress grid + CSV export link", async () => {
    api.getGrid.mockResolvedValue(GRID);
    render(<AssignmentDetailPage />);

    expect(await screen.findByRole("heading", { name: /Tema 1/ })).toBeInTheDocument();
    expect(await screen.findByTestId("grid-row-alice")).toHaveTextContent("100");
    expect(screen.getByTestId("grid-row-bob")).toHaveTextContent("55");
    // Late cell flagged; the CSV export points at the same-origin proxy
    // route (CodeQL fix: the href never leaves the app origin).
    expect(screen.getByText(/⏰/)).toBeInTheDocument();
    const csv = screen.getByTestId("gradebook-csv");
    expect(csv.getAttribute("href")).toBe("/classroom/assignments/3/export");
  });

  it("student: problem set renders, grid hidden on 403", async () => {
    api.getGrid.mockRejectedValue(new Error("Only the teacher can view the progress grid."));
    render(<AssignmentDetailPage />);

    expect(await screen.findByRole("link", { name: "Sum Two" })).toHaveAttribute(
      "href",
      "/problems/101",
    );
    await waitFor(() => expect(screen.queryByTestId("gradebook-csv")).not.toBeInTheDocument());
  });

  it("error state surfaces the message", async () => {
    api.getAssignment.mockRejectedValue(new Error("Not found."));
    render(<AssignmentDetailPage />);
    expect(await screen.findByText("Not found.")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Wave C (EDU-7/8): quiz sheets + file deliverables on the temă page.
// ---------------------------------------------------------------------------

const QUIZ_SHEET = {
  assignment: 3,
  kind: "QUIZ" as const,
  shuffle: true,
  state: "OPEN",
  items: [
    {
      item_id: 71,
      order: 0,
      question_i18n: { en: "2+2?", ro: "Cât e 2+2?" },
      variants_en: ["3", "4", "5", "6"],
      variants_ro: ["3", "4", "5", "6"],
      correct_index: null,
    },
  ],
};

describe("AssignmentDetailPage quiz + files (Wave C)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getGrid.mockRejectedValue(new Error("forbidden"));
    mocks.auth.user = {
      id: 10,
      username: "alice",
      email: "a@x.com",
      role: "BASIC",
    } as User;
  });

  it("renders the shuffled quiz sheet and submits the answers", async () => {
    api.getAssignment.mockResolvedValue({
      ...ASSIGNMENT,
      kind: "QUIZ",
      assignment_problems: [],
    });
    api.getQuizSheet.mockResolvedValue(QUIZ_SHEET);
    api.submitQuiz.mockResolvedValue({
      id: 1,
      score: 1,
      correct_count: 1,
      total_count: 1,
      submitted_at: "2026-11-01T10:00:00Z",
    });
    render(<AssignmentDetailPage />);

    expect(await screen.findByTestId("quiz-section")).toBeInTheDocument();
    expect(screen.getByText(/2\+2\?/)).toBeInTheDocument();
    expect(screen.queryByText("4", { exact: true })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("4", { exact: true }));
    fireEvent.click(screen.getByTestId("quiz-submit"));
    await waitFor(() => expect(api.submitQuiz).toHaveBeenCalledWith("3", { "71": 1 }));
    expect(await screen.findByTestId("quiz-result")).toHaveTextContent("100%");
  });

  it("closes the sheet when the quiz window is over", async () => {
    api.getAssignment.mockResolvedValue({
      ...ASSIGNMENT,
      kind: "QUIZ",
      assignment_problems: [],
    });
    api.getQuizSheet.mockResolvedValue({ ...QUIZ_SHEET, state: "CLOSED" });
    render(<AssignmentDetailPage />);

    await screen.findByTestId("quiz-section");
    expect(screen.getByText(/closed/i)).toBeInTheDocument();
    expect(screen.queryByTestId("quiz-submit")).not.toBeInTheDocument();
  });

  it("uploads a deliverable and lists it", async () => {
    api.getAssignment.mockResolvedValue({
      ...ASSIGNMENT,
      kind: "FILES",
      assignment_problems: [],
      file_extensions: "pdf,zip",
    });
    api.getDeliverables.mockResolvedValue({
      assignment: 3,
      results: [],
    });
    api.uploadDeliverable.mockResolvedValue({ id: 9, original_filename: "tema.pdf" });
    render(<AssignmentDetailPage />);

    expect(await screen.findByTestId("files-section")).toBeInTheDocument();
    const input = screen.getByLabelText(/upload/i) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["%PDF fake"], "tema.pdf")] },
    });
    await waitFor(() => expect(api.uploadDeliverable).toHaveBeenCalled());
    api.getDeliverables.mockResolvedValue({
      assignment: 3,
      results: [
        {
          id: 9,
          student: { id: 10, username: "alice" },
          original_filename: "tema.pdf",
          file: "/media/x.pdf",
          uploaded_at: "2026-11-01T10:00:00Z",
        },
      ],
    });
    // Re-fires the list fetch through the same handler chain.
    fireEvent.change(input, {
      target: { files: [new File(["%PDF fake 2"], "tema2.pdf")] },
    });
    await waitFor(() => expect(api.uploadDeliverable).toHaveBeenCalledTimes(2));
  });
});
