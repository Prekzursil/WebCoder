import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import CommunityEditorialsPanel from "./CommunityEditorialsPanel";
import type { User } from "@/types";

// EDT-3/EDT-4 — community editorials on the problem page: visibility,
// license line, lang filter, the creator write form.

const api = vi.hoisted(() => ({
  getCommunityEditorials: vi.fn(),
  createCommunityEditorial: vi.fn(),
}));

vi.mock("@/services/ApiService", () => ({
  CommunityService: api,
}));

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    user: { id: 7, username: "creator", email: "c@x.com", role: "CREATOR" } as User | null,
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => mocks.auth,
  AuthContext: {
    // A render-prop-free stand-in: React reads .Provider/_currentValue at
    // render; tests exercise the panel through this object shape.
    Provider: ({ children }: { children: React.ReactNode }) => children,
    Consumer: ({ children }: { children: (value: unknown) => React.ReactNode }) =>
      children(mocks.auth),
    _currentValue: mocks.auth,
  },
}));

// React's useContext reads the raw _currentValue slot on the context
// object — keep it live per test through the module mock.

const ROW = {
  id: 11,
  problem: 1,
  author: 7,
  author_username: "creator",
  title: "Two pointers, one pass",
  body: "Walk inward from both ends.",
  lang: "en" as const,
  status: "APPROVED" as const,
  verifier_feedback: "",
  is_hidden: false,
  license: "CC BY-SA 4.0",
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("CommunityEditorialsPanel", () => {
  it("lists rows with the license note and opens a body", async () => {
    api.getCommunityEditorials.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [ROW],
    });
    render(<CommunityEditorialsPanel problemId={1} />);

    expect(await screen.findByTestId("ce-row-11")).toBeInTheDocument();
    expect(screen.getAllByText(/CC BY-SA 4\.0/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId("ce-row-11"));
    expect(await screen.findByTestId("ce-body-11")).toHaveTextContent("Walk inward");
  });

  it("refetches with the lang filter", async () => {
    api.getCommunityEditorials.mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });
    render(<CommunityEditorialsPanel problemId={1} />);
    await screen.findByText(/No community editorials yet/i);
    fireEvent.click(screen.getByTestId("ce-filter-ro"));
    await waitFor(() => expect(api.getCommunityEditorials).toHaveBeenCalledWith(1, { lang: "ro" }));
  });

  it("offers the write form to creators and submits for review", async () => {
    api.getCommunityEditorials.mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });
    api.createCommunityEditorial.mockResolvedValue(ROW);
    render(<CommunityEditorialsPanel problemId={1} />);

    fireEvent.click(await screen.findByTestId("ce-write-button"));
    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: "Two pointers, one pass" },
    });
    fireEvent.change(screen.getByLabelText(/body/i), {
      target: { value: "Walk inward." },
    });
    fireEvent.click(screen.getByTestId("ce-submit"));

    await waitFor(() =>
      expect(api.createCommunityEditorial).toHaveBeenCalledWith(1, {
        title: "Two pointers, one pass",
        body: "Walk inward.",
        lang: "en",
      }),
    );
    expect(await screen.findByText(/No community editorials yet/i)).toBeInTheDocument();
  });

  it("hides the write button from plain users", async () => {
    mocks.auth.user = {
      id: 8,
      username: "stud",
      email: "s@x.com",
      role: "BASIC",
    } as User;
    api.getCommunityEditorials.mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });
    render(<CommunityEditorialsPanel problemId={1} />);
    await screen.findByText(/No community editorials yet/i);
    expect(screen.queryByTestId("ce-write-button")).not.toBeInTheDocument();
    mocks.auth.user = {
      id: 7,
      username: "creator",
      email: "c@x.com",
      role: "CREATOR",
    } as User;
  });
});
