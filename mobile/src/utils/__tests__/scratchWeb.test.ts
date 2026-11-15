// scratchWeb — the pure half of the mobile Scratch lane: the curated
// opcode table + toolbox generator (ported verbatim from the web
// ScratchEditor.tsx), the default cat project, the HTML document builder
// and the bridge-message parser.
import {
  DEFAULT_SCRATCH_PROJECT,
  OPCODE_CATEGORIES,
  buildScratchHtml,
  buildToolboxXml,
  declaredVariableNames,
  parseScratchMessage,
} from '../scratchWeb';

const LABELS: Record<string, string> = {
  events: 'Evenimente',
  control: 'Control',
  looks: 'Aspect',
  sensing: 'Simțire',
  operators: 'Operatori',
  variables: 'Variabile',
};

describe('OPCODE_CATEGORIES (web parity)', () => {
  it('keeps the curated table: no control_wait, no operator_random', () => {
    expect(OPCODE_CATEGORIES.control).not.toContain('control_wait');
    expect(OPCODE_CATEGORIES.operators).not.toContain('operator_random');
    // Every offered opcode is judged-mappable (scratch_transpiler parity).
    expect(OPCODE_CATEGORIES.events).toEqual(['event_whenflagclicked']);
    expect(OPCODE_CATEGORIES.looks).toEqual(['looks_say', 'looks_sayforsecs', 'looks_think']);
    expect(OPCODE_CATEGORIES.sensing).toEqual(['sensing_askandwait', 'sensing_answer']);
  });
});

describe('buildToolboxXml', () => {
  it('offers the full curated set when no allowlist is given', () => {
    const xml = buildToolboxXml(null, [], LABELS);
    expect(xml).toContain('<category name="Evenimente">');
    expect(xml).toContain('<block type="control_if"></block>');
    expect(xml).toContain('<block type="operator_add"></block>');
    // With no declared variables the data_variable block emits nothing
    // and the setter blocks fall back to the 'n' holder variable.
    expect(xml).not.toContain('<block type="data_variable">');
    expect(xml).toContain(
      '<block type="data_setvariableto"><field name="VARIABLE">n</field></block>',
    );
    // With a declared variable the palette gains its reader block.
    expect(buildToolboxXml(null, ['n'], LABELS)).toContain(
      '<block type="data_variable"><field name="VARIABLE">n</field></block>',
    );
  });

  it('curates to the allowed opcodes and drops empty categories', () => {
    const xml = buildToolboxXml(['looks_say', 'data_variable'], ['count'], LABELS);
    expect(xml).toContain('<block type="looks_say"></block>');
    expect(xml).toContain(
      '<block type="data_variable"><field name="VARIABLE">count</field></block>',
    );
    expect(xml).not.toContain('operator_add');
    // Only Looks + Variables survive → two categories.
    expect(xml.match(/<category /g)?.length).toBe(2);
  });

  it('uses the category key as label when no translation is given', () => {
    const xml = buildToolboxXml(['looks_say'], [], {});
    expect(xml).toContain('<category name="looks">');
  });
});

describe('declaredVariableNames', () => {
  it('collects variable display names across targets in order', () => {
    const project = JSON.stringify({
      targets: [
        { variables: {} },
        { variables: { a: ['n', 0], b: ['total', 0] } },
        { variables: { c: ['found', true] } },
      ],
    });
    expect(declaredVariableNames(project)).toEqual(['n', 'total', 'found']);
  });

  it('tolerates null and malformed project JSON', () => {
    expect(declaredVariableNames(null)).toEqual([]);
    expect(declaredVariableNames(undefined)).toEqual([]);
    expect(declaredVariableNames('not json')).toEqual([]);
  });
});

describe('DEFAULT_SCRATCH_PROJECT', () => {
  it('is a valid cat starter: flag → say("Hello!")', () => {
    const project = JSON.parse(DEFAULT_SCRATCH_PROJECT);
    expect(project.targets).toHaveLength(2);
    const sprite = project.targets[1];
    expect(sprite.blocks.flag.opcode).toBe('event_whenflagclicked');
    expect(sprite.blocks.say.opcode).toBe('looks_say');
    expect(sprite.blocks.say.inputs.MESSAGE).toEqual([1, [10, 'Hello!']]);
    // The bundled assets' md5s (cat costume + backdrop) must be the ones
    // the WebView pre-registers into scratch-storage.
    expect(sprite.costumes[0].md5ext).toBe('bcf454acf82e4504149f7ffe07081dbc.svg');
    expect(project.targets[0].costumes[0].md5ext).toBe('cd21514d0531fdffb22204e0ec5ed84a.svg');
  });
});

describe('parseScratchMessage', () => {
  it('accepts every bridge message type', () => {
    expect(parseScratchMessage('{"type":"boot"}')).toEqual({ type: 'boot' });
    expect(parseScratchMessage('{"type":"ready"}')).toEqual({ type: 'ready' });
    expect(parseScratchMessage('{"type":"project","json":"{\\"targets\\":[]}"}')).toEqual({
      type: 'project',
      json: '{"targets":[]}',
    });
    expect(parseScratchMessage('{"type":"say","text":"Hello!"}')).toEqual({
      type: 'say',
      text: 'Hello!',
    });
    expect(parseScratchMessage('{"type":"error","message":"boom"}')).toEqual({
      type: 'error',
      message: 'boom',
    });
  });

  it('rejects malformed JSON, non-objects and wrong shapes', () => {
    expect(parseScratchMessage(42)).toBeNull();
    expect(parseScratchMessage(null)).toBeNull();
    expect(parseScratchMessage({ type: 'boot' })).toBeNull();
    expect(parseScratchMessage('not json')).toBeNull();
    expect(parseScratchMessage('"str"')).toBeNull();
    expect(parseScratchMessage('42')).toBeNull();
    expect(parseScratchMessage('{"type":"other"}')).toBeNull();
    expect(parseScratchMessage('{"type":"project"}')).toBeNull();
    expect(parseScratchMessage('{"type":"project","json":7}')).toBeNull();
    expect(parseScratchMessage('{"type":"say"}')).toBeNull();
    expect(parseScratchMessage('{"type":"error"}')).toBeNull();
  });
});

describe('buildScratchHtml', () => {
  const scripts = { editor: '/*EDITOR_BUNDLE*/' };

  it('injects the bundle, config and mounts the init call', () => {
    const html = buildScratchHtml({
      allowedOpcodes: ['looks_say'],
      locale: 'en',
      categoryLabels: LABELS,
      scripts,
    });
    expect(html).toContain('<script>/*EDITOR_BUNDLE*/</script>');
    expect(html).toContain('window.WebCoderScratch.init(');
    expect(html).toContain('"toolbox"');
    // The default project is always present as the loadProject fallback.
    expect(html).toContain('"defaultProject"');
    // A </script> inside the bundle would break the document — it is escaped.
    const escaped = buildScratchHtml({
      locale: 'en',
      categoryLabels: {},
      scripts: { editor: '</script><b>x</b>' },
    });
    expect(escaped).toContain('<\\/script>');
    expect(escaped).not.toContain('</script><b>');
  });

  it('passes the caller project as the starter and the locale through', () => {
    const html = buildScratchHtml({
      projectJson: '{"targets":[{"variables":{"v":["n",0]}}]}',
      locale: 'ro',
      categoryLabels: LABELS,
      scripts,
    });
    expect(html).toContain(
      '"projectJson":"{\\"targets\\":[{\\"variables\\":{\\"v\\":[\\"n\\",0]}}]}"',
    );
    expect(html).toContain('"locale":"ro"');
    // The starter's declared variable rides into the toolbox, which is
    // embedded JSON-escaped inside the injected init config.
    expect(html).toContain(
      '<block type=\\"data_variable\\"><field name=\\"VARIABLE\\">n</field></block>',
    );
  });
});
