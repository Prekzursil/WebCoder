// [judge-fairness wave E] Partial-code editor: the pure template math
// (client twin of the backend parser) — segment parsing, locked-range
// offsets over the assembled document, and the change-guard predicate.

import { describe, expect, it } from "vitest";
import { EDIT_END, EDIT_START, lockedRangesInTemplate, parseTemplate } from "./PartialCodeEditor";

const TEMPLATE = [
  "#include <cstdio>",
  "",
  "int f(int n) {",
  "    // " + EDIT_START,
  "    // " + EDIT_END,
  "}",
  "",
  "int main() { return f(0); }",
].join("\n");

describe("parseTemplate (client twin)", () => {
  it("splits locked and editable segments", () => {
    const segments = parseTemplate(TEMPLATE);
    expect(segments.some((s) => s.locked)).toBe(true);
    expect(segments.some((s) => !s.locked)).toBe(true);
    const locked = segments
      .filter((s) => s.locked)
      .map((s) => s.text)
      .join("");
    expect(locked).toContain("#include <cstdio>");
    expect(locked).toContain("int main()");
  });

  it("returns [] for empty templates", () => {
    expect(parseTemplate("")).toEqual([]);
    expect(parseTemplate(null)).toEqual([]);
  });

  it("accepts python-hash sentinels too", () => {
    const py = ["x = 1", "# " + EDIT_START, "# " + EDIT_END, "print(x)"].join("\n");
    expect(parseTemplate(py).some((s) => !s.locked)).toBe(true);
  });
});

describe("lockedRangesInTemplate", () => {
  it("locks head, editable hole, locks tail — offsets into the document", () => {
    const ranges = lockedRangesInTemplate(TEMPLATE);
    expect(ranges.length).toBe(2); // head..START, END..EOF
    const [headStart, headEnd] = ranges[0];
    expect(TEMPLATE.slice(headStart, headEnd)).toContain("#include <cstdio>");
    expect(TEMPLATE.slice(headStart, headEnd)).toContain("int f(int n) {");
    const [tailStart] = ranges[1];
    expect(TEMPLATE.slice(tailStart)).toContain("int main()");
    // The head lock ENDS with the START sentinel line; the tail lock
    // STARTS at the END sentinel line — the editable hole is exactly what
    // sits between them (here: adjacent, so just the newline).
    expect(TEMPLATE.slice(headStart, headEnd)).toContain(EDIT_START);
    expect(TEMPLATE.slice(tailStart, tailStart + 20)).toContain(EDIT_END);
    expect(tailStart - headEnd).toBe(1); // only the newline between
  });

  it("multiple holes yield alternating ranges", () => {
    const tpl = [
      "a",
      "WC_EDIT_START",
      "b",
      "WC_EDIT_END",
      "c",
      "WC_EDIT_START",
      "d",
      "WC_EDIT_END",
      "e",
    ].join("\n");
    const ranges = lockedRangesInTemplate(tpl);
    expect(ranges.length).toBe(3);
  });

  it("no sentinels -> the whole document is locked", () => {
    const ranges = lockedRangesInTemplate("int main() {}\n");
    expect(ranges).toEqual([[0, "int main() {}\n".length]]);
  });
});
