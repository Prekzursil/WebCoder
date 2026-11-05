// Complexity-hint analyzer tests (pure function; no Blockly needed).
import { describe, expect, it } from "vitest";
import { analyzeComplexity, hintMessage } from "./complexity";

describe("analyzeComplexity", () => {
  it("flat single loop is fine", () => {
    const code = "n = int(input())\nfor i in range(n):\n    print(i)\n";
    expect(analyzeComplexity(code)).toEqual([]);
  });

  it("nested loops are flagged", () => {
    const code = [
      "n = int(input())",
      "for i in range(n):",
      "    for j in range(n):",
      "        print(i, j)",
      'print("done")',
    ].join("\n");
    expect(analyzeComplexity(code)).toEqual(["nested-loops"]);
  });

  it("sequential (non-nested) loops are fine", () => {
    const code = [
      "for i in range(10):",
      "    print(i)",
      "for j in range(10):",
      "    print(j)",
    ].join("\n");
    expect(analyzeComplexity(code)).toEqual([]);
  });

  it("while True without exit is flagged", () => {
    const code = 'while True:\n    print("x")\n';
    expect(analyzeComplexity(code)).toEqual(["no-exit-forever"]);
  });

  it("while True with break is fine", () => {
    const code = [
      "while True:",
      "    x = int(input())",
      "    if x == 0:",
      "        break",
      "    print(x)",
    ].join("\n");
    expect(analyzeComplexity(code)).toEqual([]);
  });

  it("both hints can fire together", () => {
    const code = ["while True:", "    for j in range(10):", "        print(j)"].join("\n");
    expect(analyzeComplexity(code)).toContain("nested-loops");
    expect(analyzeComplexity(code)).toContain("no-exit-forever");
  });

  it("empty code has no hints", () => {
    expect(analyzeComplexity("")).toEqual([]);
  });

  it("JS-generated code is analyzed the same way", () => {
    const code = [
      "for (let wcI = 1; wcI <= n; wcI++) {",
      "  for (let j = 1; j <= n; j++) {",
      "    console.log(wcI, j);",
      "  }",
      "}",
    ].join("\n");
    expect(analyzeComplexity(code)).toEqual(["nested-loops"]);
  });
});

describe("hintMessage", () => {
  const t = (key: string, fallback: string) =>
    key === "blocks_hint_nested_loops" ? "RO-nested" : fallback;

  it("uses the translation when present", () => {
    expect(hintMessage("nested-loops", t)).toBe("RO-nested");
  });

  it("falls back to the built-in text", () => {
    expect(hintMessage("no-exit-forever", t)).toContain("never stops");
  });
});
