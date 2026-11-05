// Wave A learning-layer panel tests: hints ladder (EDT-2), editorial
// gating UI (EDT-1), problem stats + satisfaction vote (UXP-7), custom
// test (X7) and the markdown/KaTeX statement renderer (A7).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useAuth } from "@/context/AuthContext";
import { ProblemService, ScratchService } from "@/services/ApiService";

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/services/ApiService", () => ({
  ProblemService: {
    getEditorial: vi.fn(),
    getStatistics: vi.fn(),
    rate: vi.fn(),
  },
  ScratchService: {
    run: vi.fn(),
  },
}));

vi.mock("./CodeEditor", () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="Code" value={value} onChange={(e) => onChange(e.target.value)} rows={6} />
  ),
}));

import HintsPanel from "./HintsPanel";
import EditorialPanel from "./EditorialPanel";
import ProblemStatsPanel from "./ProblemStatsPanel";
import ScratchPanel from "./ScratchPanel";
import StatementMarkdown from "@/components/common/StatementMarkdown";

const getEditorialMock = vi.mocked(ProblemService.getEditorial);
const getStatisticsMock = vi.mocked(ProblemService.getStatistics);
const rateMock = vi.mocked(ProblemService.rate);
const scratchRunMock = vi.mocked(ScratchService.run);

function mockAuth({ isAuthenticated }: { isAuthenticated: boolean }) {
  vi.mocked(useAuth).mockReturnValue({
    isAuthenticated,
    user: isAuthenticated ? { id: 1, username: "u" } : null,
    login: vi.fn(),
    logout: vi.fn(),
  } as ReturnType<typeof useAuth>);
}

afterEach(cleanup);

beforeEach(() => {
  vi.mocked(useAuth).mockReset();
  getEditorialMock.mockReset();
  getStatisticsMock.mockReset();
  rateMock.mockReset();
  scratchRunMock.mockReset();
});

describe("HintsPanel [EDT-2]", () => {
  it("reveals hints one at a time", () => {
    render(<HintsPanel hints={["Hint A", "Hint B"]} />);
    expect(screen.queryByText("Hint A")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Show hint 1 of 2/i }));
    expect(screen.getByText("Hint A")).toBeInTheDocument();
    expect(screen.queryByText("Hint B")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Show hint 2 of 2/i }));
    expect(screen.getByText("Hint B")).toBeInTheDocument();
  });

  it("hides everything again after the last reveal", () => {
    render(<HintsPanel hints={["Only hint"]} />);
    fireEvent.click(screen.getByRole("button", { name: /Show hint 1 of 1/i }));
    fireEvent.click(screen.getByRole("button", { name: /Hide hints/i }));
    expect(screen.queryByText("Only hint")).not.toBeInTheDocument();
  });

  it("renders nothing without hints", () => {
    const { container } = render(<HintsPanel hints={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("EditorialPanel [EDT-1]", () => {
  it("renders the editorial content when unlocked", async () => {
    getEditorialMock.mockResolvedValue({
      content_en: "Use a set.",
      content_ro: "Folosește un set.",
      publish_policy: "AFTER_AC",
    });
    render(<EditorialPanel problemId="7" hasEditorial locale="en" />);
    await waitFor(() => expect(screen.getByText("Use a set.")).toBeInTheDocument());
  });

  it("prefers the Romanian content in the RO locale", async () => {
    getEditorialMock.mockResolvedValue({
      content_en: "Use a set.",
      content_ro: "Folosește un set.",
      publish_policy: "AFTER_AC",
    });
    render(<EditorialPanel problemId="7" hasEditorial locale="ro" />);
    await waitFor(() => expect(screen.getByText("Folosește un set.")).toBeInTheDocument());
  });

  it("shows the locked message for AFTER_AC without a solve", async () => {
    const err = new Error("locked") as Error & { responseLocked: boolean; policy: string };
    err.responseLocked = true;
    err.policy = "AFTER_AC";
    getEditorialMock.mockRejectedValue(err);
    render(<EditorialPanel problemId="7" hasEditorial locale="en" />);
    await waitFor(() => expect(screen.getByText(/locked until you solve/i)).toBeInTheDocument());
  });

  it("renders nothing when there is no editorial", () => {
    const { container } = render(<EditorialPanel problemId="7" hasEditorial={false} locale="en" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ProblemStatsPanel [UXP-7]", () => {
  it("shows tried/solved/AC-rate and the vote widget for authenticated users", async () => {
    mockAuth({ isAuthenticated: true });
    getStatisticsMock.mockResolvedValue({
      problem: 7,
      tried: 12,
      solved: 6,
      acceptance_rate: 0.5,
      verdict_distribution: { AC: 6 },
      language_counts: { python3: 12 },
      rating_avg: null,
      rating_count: 0,
    });
    render(<ProblemStatsPanel problemId="7" />);
    await waitFor(() => expect(screen.getByText("12")).toBeInTheDocument());
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();

    rateMock.mockResolvedValue({ rating_avg: 3, rating_count: 1, your_rating: 3 });
    fireEvent.click(screen.getByRole("button", { name: /Rate this problem 3 of 3/i }));
    await waitFor(() => expect(rateMock).toHaveBeenCalledWith("7", 3));
  });

  it("hides the vote widget for anonymous visitors", async () => {
    mockAuth({ isAuthenticated: false });
    getStatisticsMock.mockResolvedValue({
      problem: 7,
      tried: 4,
      solved: 1,
      acceptance_rate: 0.25,
      verdict_distribution: {},
      language_counts: {},
      rating_avg: null,
      rating_count: 0,
    });
    render(<ProblemStatsPanel problemId="7" />);
    await waitFor(() => expect(screen.getByText("4")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Rate this problem/i })).not.toBeInTheDocument();
  });

  it("stays hidden when statistics fail to load", async () => {
    mockAuth({ isAuthenticated: true });
    getStatisticsMock.mockRejectedValue(new Error("down"));
    const { container } = render(<ProblemStatsPanel problemId="7" />);
    await waitFor(() => expect(getStatisticsMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ScratchPanel [X7]", () => {
  it("is hidden for anonymous visitors", () => {
    mockAuth({ isAuthenticated: false });
    const { container } = render(<ScratchPanel allowedLanguages={["python3"]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("runs a custom test and shows the output", async () => {
    mockAuth({ isAuthenticated: true });
    scratchRunMock.mockResolvedValue({
      id: 1,
      status: "OK",
      output: "42",
      error: "",
    });
    render(<ScratchPanel allowedLanguages={["python3"]} />);
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "print(input())" } });
    fireEvent.change(screen.getByLabelText(/Custom input/i), { target: { value: "42" } });
    fireEvent.click(screen.getByRole("button", { name: /Run custom test/i }));
    await waitFor(() => expect(screen.getByText("42")).toBeInTheDocument());
    expect(scratchRunMock).toHaveBeenCalledWith({
      language: "python3",
      code: "print(input())",
      input: "42",
    });
  });

  it("surfaces run errors", async () => {
    mockAuth({ isAuthenticated: true });
    scratchRunMock.mockRejectedValue(new Error("429 too many runs"));
    render(<ScratchPanel allowedLanguages={["python3"]} />);
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /Run custom test/i }));
    await waitFor(() => expect(screen.getByText("429 too many runs")).toBeInTheDocument());
  });
});

describe("StatementMarkdown [A7]", () => {
  it("renders markdown formatting and inline math", () => {
    const { container } = render(
      <StatementMarkdown markdown={"**Input:** value $a + b$\n\n- item one\n- item two"} />,
    );
    expect(container.querySelector("strong")?.textContent).toContain("Input:");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("renders tables via GFM", () => {
    const { container } = render(
      <StatementMarkdown markdown={"| a | b |\n| - | - |\n| 1 | 2 |"} />,
    );
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelectorAll("td")).toHaveLength(2);
  });
});
