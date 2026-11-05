import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import ClassesPage from "./page";
import type { User } from "@/types";

// Classes page tests (Wave B EDU-1/EDU-2 UI): student self-join with code,
// teacher create-class, enrolled list with open-teme counts, homework list
// with derived states, and the unauthenticated empty state.

const api = vi.hoisted(() => ({
  getMyClasses: vi.fn(),
  getClasses: vi.fn(),
  getMyAssignments: vi.fn(),
  joinClass: vi.fn(),
  createClass: vi.fn(),
}));

vi.mock("@/services/ApiService", () => ({
  ClassroomService: api,
}));

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    user: { id: 1, username: "bob", email: "b@x.com", role: "BASIC_USER" } as User | null,
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => mocks.auth,
}));

const CLASSROOM = {
  id: 5,
  name: "IX-A",
  school: "Liceul X",
  is_open: true,
  created_at: "2026-10-01T00:00:00Z",
  teacher_username: "teacher",
  member_count: 22,
  assignment_count: 2,
  is_owner: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.user = { id: 1, username: "bob", email: "b@x.com", role: "BASIC_USER" };
  api.getMyClasses.mockResolvedValue({
    results: [
      {
        membership_id: 9,
        joined_at: "2026-10-02T00:00:00Z",
        classroom: CLASSROOM,
        open_assignments: 2,
      },
    ],
  });
  api.getMyAssignments.mockResolvedValue({ results: [] });
});

afterEach(cleanup);

describe("ClassesPage", () => {
  it("student: enrolled classes with open-teme badge and join form", async () => {
    render(<ClassesPage />);
    expect(await screen.findByText("IX-A")).toBeInTheDocument();
    expect(screen.getByText("2 open teme")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open →" })).toHaveAttribute("href", "/classes/5");
    expect(screen.getByRole("button", { name: "Join" })).toBeInTheDocument();
    // Students never see the create-class form.
    expect(screen.queryByRole("button", { name: "Create class" })).not.toBeInTheDocument();
  });

  it("join flow posts the code (+password) and reloads", async () => {
    api.joinClass.mockResolvedValue({ detail: "Joined.", classroom_id: 5 });
    render(<ClassesPage />);
    fireEvent.change(screen.getByRole("textbox", { name: "Class code" }), {
      target: { value: "abcd1234" },
    });
    // input[type=password] has no textbox role — query by label.
    fireEvent.change(screen.getByLabelText(/Password/), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    await waitFor(() => expect(api.joinClass).toHaveBeenCalledWith("ABCD1234", "secret"));
  });

  it("join errors surface inline", async () => {
    api.joinClass.mockRejectedValue(new Error("invalid_code_or_password"));
    render(<ClassesPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Join" }));
    expect(await screen.findByText("invalid_code_or_password")).toBeInTheDocument();
  });

  it("teacher: sees own classes with the join code and can create one", async () => {
    mocks.auth.user = { id: 2, username: "teacher", email: "t@x.com", role: "TEACHER" };
    api.getClasses.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [{ ...CLASSROOM, is_owner: true, join_code: "ABCD1234" }],
    });
    api.createClass.mockResolvedValue({ ...CLASSROOM, id: 6 });
    render(<ClassesPage />);

    expect(await screen.findByText("Classes I teach")).toBeInTheDocument();
    expect(await screen.findByTestId("join-code-5")).toHaveTextContent("ABCD1234");
    fireEvent.change(screen.getByRole("textbox", { name: /Class name/ }), {
      target: { value: "X-B" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create class" }));
    await waitFor(() => expect(api.createClass).toHaveBeenCalledWith({ name: "X-B" }));
  });

  it("homework list renders assignments with derived states", async () => {
    api.getMyAssignments.mockResolvedValue({
      results: [
        {
          id: 3,
          classroom: 5,
          classroom_name: "IX-A",
          title_i18n: { en: "Tema 1 — loops", ro: "Tema 1 — bucle" },
          description: "",
          available_from: "2026-10-20T00:00:00Z",
          due_at: "2999-01-01T00:00:00Z",
          late_until: null,
          is_exam: false,
          state: "OPEN",
          solved_count: 2,
        },
      ],
    });
    render(<ClassesPage />);
    const link = await screen.findByRole("link", { name: /Tema 1/ });
    expect(link).toHaveAttribute("href", "/classes/assignments/3");
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("2 solved")).toBeInTheDocument();
  });

  it("unauthenticated visitors see the login empty state", async () => {
    mocks.auth.isAuthenticated = false;
    render(<ClassesPage />);
    expect(await screen.findByText("Log in to see your classes")).toBeInTheDocument();
    mocks.auth.isAuthenticated = true;
  });
});
