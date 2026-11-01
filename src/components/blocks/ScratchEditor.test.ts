// ScratchEditor unit tests. The scratch-* packages need a real DOM,
// WebGL canvas and Blockly runtime — the editor's heavy imports are
// mocked and the pure helpers (toolbox construction, variable
// extraction, the default project) are tested directly.
import { describe, expect, it, vi } from "vitest";

vi.mock("scratch-vm", () => ({ default: vi.fn() }));
vi.mock("scratch-blocks/dist/vertical.js", () => ({ default: vi.fn() }));
vi.mock("scratch-render", () => ({ default: vi.fn() }));
vi.mock("scratch-storage", () => ({
  ScratchStorage: vi.fn(),
  AssetType: { ImageVector: "ImageVector" },
}));

import { DEFAULT_SCRATCH_PROJECT, buildToolboxXml, declaredVariableNames } from "./ScratchEditor";

describe("DEFAULT_SCRATCH_PROJECT", () => {
  it("is valid JSON with a cat sprite and a flag script", () => {
    const project = JSON.parse(DEFAULT_SCRATCH_PROJECT) as {
      targets: {
        isStage: boolean;
        name: string;
        blocks: Record<string, { opcode: string }>;
        costumes: { md5ext: string }[];
      }[];
    };
    const sprite = project.targets.find((t) => !t.isStage);
    expect(sprite?.name).toBe("Sprite1");
    const hat = Object.values(sprite?.blocks ?? {}).find(
      (b) => b.opcode === "event_whenflagclicked",
    );
    expect(hat).toBeTruthy();
    // The cat costume references the bundled asset.
    expect(sprite?.costumes[0].md5ext).toBe("bcf454acf82e4504149f7ffe07081dbc.svg");
  });
});

describe("declaredVariableNames", () => {
  it("extracts variable display names across targets", () => {
    const json = JSON.stringify({
      targets: [{ variables: { a: ["total", 0] } }, { variables: { b: ["n", 0], c: "malformed" } }],
    });
    expect(declaredVariableNames(json)).toEqual(["total", "n"]);
  });

  it("returns empty for null/invalid JSON", () => {
    expect(declaredVariableNames(null)).toEqual([]);
    expect(declaredVariableNames("not json")).toEqual([]);
  });
});

describe("buildToolboxXml", () => {
  it("offers only curated opcodes when an allowlist is given", () => {
    const xml = buildToolboxXml(["event_whenflagclicked", "looks_say"], [], {
      events: "Events",
      control: "Control",
      looks: "Looks",
      sensing: "Sensing",
      operators: "Operators",
      variables: "Variables",
    });
    expect(xml).toContain('<block type="event_whenflagclicked"');
    expect(xml).toContain('<block type="looks_say"');
    expect(xml).not.toContain("control_repeat");
    expect(xml).not.toContain("operator_add");
  });

  it("offers the full curated set when no allowlist is given", () => {
    const xml = buildToolboxXml(null, [], {
      events: "Events",
      control: "Control",
      looks: "Looks",
      sensing: "Sensing",
      operators: "Operators",
      variables: "Variables",
    });
    expect(xml).toContain("control_repeat");
    expect(xml).toContain("operator_add");
    expect(xml).toContain("sensing_askandwait");
    // control_wait is filtered: it has no judged semantics.
    expect(xml).not.toContain("control_wait");
    // operator_random is filtered: nondeterministic blocks cannot be judged.
    expect(xml).not.toContain("operator_random");
  });

  it("emits one data_variable block per declared variable", () => {
    const xml = buildToolboxXml(
      ["event_whenflagclicked", "data_variable", "data_setvariableto"],
      ["n", "total"],
      {
        events: "Events",
        control: "Control",
        looks: "Looks",
        sensing: "Sensing",
        operators: "Operators",
        variables: "Variables",
      },
    );
    expect(xml).toContain('<field name="VARIABLE">n</field>');
    expect(xml).toContain('<field name="VARIABLE">total</field>');
  });

  it("drops a category whose every opcode is disallowed", () => {
    const xml = buildToolboxXml(["event_whenflagclicked"], [], {
      events: "Events",
      control: "Control",
      looks: "Looks",
      sensing: "Sensing",
      operators: "Operators",
      variables: "Variables",
    });
    expect(xml).not.toContain('name="Looks"');
    expect(xml).toContain('name="Events"');
  });

  it("localizes category labels", () => {
    const xml = buildToolboxXml(null, [], {
      events: "Evenimente",
      control: "Control",
      looks: "Aspect",
      sensing: "Percepție",
      operators: "Operatori",
      variables: "Variabile",
    });
    expect(xml).toContain('name="Evenimente"');
    expect(xml).toContain('name="Percepție"');
  });
});
