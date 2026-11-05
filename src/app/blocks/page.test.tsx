// [judge-fairness wave D] /blocks playground page: renders the (mocked)
// block editor, hands the generated code to the scratch run, and surfaces
// the output; the auth gate and the empty-code guard both message.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import BlocksPlaygroundPage from "./page";

const scratch = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/services/ApiService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/ApiService")>();
  return {
    ...actual,
    ScratchService: { run: scratch.run },
  };
});

// The real BlockEditor loads Blockly in a browser DOM; jsdom is not one.
// Mock it with the contract the page depends on: onCodeChange(code).
vi.mock("@/components/blocks/BlockEditor", () => ({
  default: ({ onCodeChange }: { onCodeChange?: (code: string) => void }) => (
    <div data-testid="blockly-editor" onLoad={undefined}>
      <button
        type="button"
        data-testid="emit-code"
        onClick={() => onCodeChange?.("n = int(input())\nprint(n % 10)\n")}
      >
        emit
      </button>
    </div>
  ),
}));

const authState = vi.hoisted(() => ({
  isAuthenticated: true,
  user: { id: 1, username: "u", email: "u@e.local", role: "BASIC" },
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => authState }));

beforeEach(() => {
  vi.clearAllMocks();
  authState.isAuthenticated = true;
  scratch.run.mockResolvedValue({ id: 1, status: "OK", output: "2\n", error: "" });
});

afterEach(() => cleanup());

describe("BlocksPlaygroundPage", () => {
  it("renders the editor, generator picker and run button", async () => {
    render(<BlocksPlaygroundPage />);
    // next/dynamic loads the editor asynchronously — await it.
    expect(await screen.findByTestId("blockly-editor")).toBeTruthy();
    expect(screen.getByRole("button", { name: /run on the judge/i })).toBeTruthy();
    expect(screen.getByLabelText(/generates/i)).toBeTruthy();
  });

  it("runs the generated code through the scratch endpoint", async () => {
    render(<BlocksPlaygroundPage />);
    fireEvent.click(await screen.findByTestId("emit-code"));
    fireEvent.change(screen.getByLabelText(/input \(stdin\)/i), {
      target: { value: "42" },
    });
    fireEvent.click(screen.getByRole("button", { name: /run on the judge/i }));
    await waitFor(() =>
      expect(scratch.run).toHaveBeenCalledWith({
        language: "python3",
        code: expect.stringContaining("int(input())"),
        input: "42",
      }),
    );
    expect(await screen.findByTestId("blocks-output")).toHaveTextContent("2");
  });

  it("switches the generator language for runs", async () => {
    render(<BlocksPlaygroundPage />);
    fireEvent.change(screen.getByLabelText(/generates/i), {
      target: { value: "nodejs20" },
    });
    fireEvent.click(screen.getByTestId("emit-code"));
    fireEvent.click(screen.getByRole("button", { name: /run on the judge/i }));
    await waitFor(() =>
      expect(scratch.run).toHaveBeenCalledWith(expect.objectContaining({ language: "nodejs20" })),
    );
  });

  it("guards on empty code and on auth", async () => {
    const { rerender } = render(<BlocksPlaygroundPage />);
    // no blocks emitted -> code empty
    fireEvent.click(screen.getByRole("button", { name: /run on the judge/i }));
    expect(await screen.findByText(/add some blocks first/i)).toBeTruthy();
    expect(scratch.run).not.toHaveBeenCalled();

    authState.isAuthenticated = false;
    rerender(<BlocksPlaygroundPage />);
    fireEvent.click(screen.getByRole("button", { name: /run on the judge/i }));
    expect(await screen.findByText(/sign in to run your blocks/i)).toBeTruthy();
  });

  it("surfaces a scratch failure as an alert", async () => {
    scratch.run.mockRejectedValue(new Error("judge exploded"));
    render(<BlocksPlaygroundPage />);
    fireEvent.click(await screen.findByTestId("emit-code"));
    fireEvent.click(screen.getByRole("button", { name: /run on the judge/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("judge exploded");
  });
});
