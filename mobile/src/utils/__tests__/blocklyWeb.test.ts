// blocklyWeb — the pure half of the mobile block editor. Contract
// parity with the web's BlockEditor/wcBlocks: the default toolbox and
// starter XML are byte-identical ports, the site-block snippets map to
// the canonical stdin reads, and the built HTML loads the UMD bundles in
// dependency order with a working postMessage bridge.
import {
  DEFAULT_STARTER_XML,
  DEFAULT_TOOLBOX_XML,
  WC_BLOCK_MESSAGES_EN,
  WC_BLOCK_MESSAGES_RO,
  WC_BRIDGE_SCRIPT,
  WC_JS_LINE,
  WC_JS_NUMBER,
  WC_JS_PREAMBLE,
  WC_PY_LINE,
  WC_PY_NUMBER,
  buildBlocklyHtml,
  localizeToolbox,
  parseBlocklyMessage,
  type BlocklyScripts,
} from '../blocklyWeb';

const SCRIPTS: BlocklyScripts = {
  core: '/*CORE*/',
  blocks: '/*BLOCKS*/',
  python: '/*PYTHON*/',
  javascript: '/*JAVASCRIPT*/',
  messages: '/*MESSAGES*/',
};

describe('default toolbox / starter (web parity)', () => {
  it('carries the site input blocks in the toolbox', () => {
    expect(DEFAULT_TOOLBOX_XML).toContain('<block type="wc_input_number">');
    expect(DEFAULT_TOOLBOX_XML).toContain('<block type="wc_input_line">');
    expect(DEFAULT_TOOLBOX_XML).toContain('custom="VARIABLE"');
    expect(DEFAULT_TOOLBOX_XML).toContain('custom="PROCEDURE"');
  });

  it('starter reads n and prints n % 10', () => {
    expect(DEFAULT_STARTER_XML).toContain('variables_set');
    expect(DEFAULT_STARTER_XML).toContain('math_modulo');
    expect(DEFAULT_STARTER_XML).toContain('<field name="NUM">10</field>');
  });
});

describe('localizeToolbox', () => {
  it('replaces the %(key)s category placeholders', () => {
    const out = localizeToolbox('<category name="%(logic)s">%(loops)s</category>', {
      logic: 'Logica',
      loops: 'Bucle',
    });
    expect(out).toBe('<category name="Logica">Bucle</category>');
  });

  it('falls back to the key when a label is missing', () => {
    expect(localizeToolbox('%(math)s', {})).toBe('math');
  });
});

describe('site block snippets (judge contract)', () => {
  it('python reads map to the canonical stdin lines', () => {
    expect(WC_PY_NUMBER).toBe('int(input())');
    expect(WC_PY_LINE).toBe('input()');
  });

  it('javascript reads call the preamble helpers exactly once', () => {
    expect(WC_JS_NUMBER).toBe('wcReadNumber()');
    expect(WC_JS_LINE).toBe('wcReadLine()');
    expect(WC_JS_PREAMBLE).toContain('function wcReadLine()');
    expect(WC_JS_PREAMBLE).toContain("require('fs').readFileSync(0, 'utf8')");
  });

  it('registers both generators for both site blocks', () => {
    for (const snippet of [WC_PY_NUMBER, WC_PY_LINE, WC_JS_NUMBER, WC_JS_LINE]) {
      expect(WC_BRIDGE_SCRIPT).toContain(snippet);
    }
    expect(WC_BRIDGE_SCRIPT).toContain("type: 'wc_input_number'");
    expect(WC_BRIDGE_SCRIPT).toContain("type: 'wc_input_line'");
  });

  it('ships EN + RO messages for the site blocks', () => {
    expect(WC_BLOCK_MESSAGES_EN.WC_INPUT_NUMBER).toBeTruthy();
    expect(WC_BLOCK_MESSAGES_RO.WC_INPUT_NUMBER).toBeTruthy();
    expect(WC_BLOCK_MESSAGES_EN.WC_INPUT_LINE_TIP).toBeTruthy();
  });
});

describe('buildBlocklyHtml', () => {
  it('loads the UMD bundles in dependency order before the bridge', () => {
    const html = buildBlocklyHtml({
      generator: 'python3',
      locale: 'en',
      categoryLabels: {},
      scripts: SCRIPTS,
    });
    const core = html.indexOf('/*CORE*/');
    const blocks = html.indexOf('/*BLOCKS*/');
    const python = html.indexOf('/*PYTHON*/');
    const javascript = html.indexOf('/*JAVASCRIPT*/');
    const messages = html.indexOf('/*MESSAGES*/');
    const bridge = html.indexOf('wcRegisterBlocks');
    expect(core).toBeGreaterThan(-1);
    expect(core).toBeLessThan(blocks);
    expect(blocks).toBeLessThan(python);
    expect(python).toBeLessThan(javascript);
    expect(javascript).toBeLessThan(messages);
    expect(messages).toBeLessThan(bridge);
  });

  it('embeds the localized toolbox, starter, and config as JSON', () => {
    const html = buildBlocklyHtml({
      generator: 'nodejs20',
      toolboxXml: '<xml>TOOLBOX</xml>',
      starterXml: '<xml>STARTER</xml>',
      locale: 'en',
      categoryLabels: { logic: 'Logica' },
      scripts: SCRIPTS,
    });
    expect(html).toContain('TOOLBOX');
    expect(html).toContain('STARTER');
    expect(html).toContain('"generator":"nodejs20"');
    expect(html).toContain('"preamble":');
    // RO messages only selected for ro locales.
    expect(html).not.toContain('citește');
  });

  it('selects the RO message strings for ro locales', () => {
    const html = buildBlocklyHtml({
      generator: 'python3',
      locale: 'ro-RO',
      categoryLabels: {},
      scripts: SCRIPTS,
    });
    expect(html).toContain('citește un număr de la intrare');
  });

  it('includes the JS preamble config only for the JS generator', () => {
    const js = buildBlocklyHtml({
      generator: 'nodejs20',
      locale: 'en',
      categoryLabels: {},
      scripts: SCRIPTS,
    });
    const py = buildBlocklyHtml({
      generator: 'python3',
      locale: 'en',
      categoryLabels: {},
      scripts: SCRIPTS,
    });
    expect(js).toContain('wcReadLine');
    expect(JSON.parse(js.match(/var cfg = (\{.*?\});\n/s)![1]).preamble).toContain(
      'wcReadNumber',
    );
    expect(JSON.parse(py.match(/var cfg = (\{.*?\});\n/s)![1]).preamble).toBe('');
  });

  it('neutralizes </script> inside the injected bundles', () => {
    const html = buildBlocklyHtml({
      generator: 'python3',
      locale: 'en',
      categoryLabels: {},
      scripts: { ...SCRIPTS, core: 'evil</script><img src=x>' },
    });
    expect(html).not.toContain('evil</script>');
    expect(html).toContain('evil<\\/script>');
  });
});

describe('parseBlocklyMessage', () => {
  it('accepts a code message', () => {
    expect(parseBlocklyMessage('{"type":"code","code":"print(1)"}')).toEqual({
      type: 'code',
      code: 'print(1)',
    });
  });

  it('accepts an error report from the page-side error handler', () => {
    expect(parseBlocklyMessage('{"type":"error","message":"Blockly is not defined"}')).toEqual({
      type: 'error',
      message: 'Blockly is not defined',
    });
  });

  it('rejects malformed JSON, non-objects, and wrong shapes', () => {
    expect(parseBlocklyMessage('not json')).toBeNull();
    expect(parseBlocklyMessage('"a string"')).toBeNull();
    expect(parseBlocklyMessage('null')).toBeNull();
    expect(parseBlocklyMessage('{"type":"other","code":"x"}')).toBeNull();
    expect(parseBlocklyMessage('{"type":"code"}')).toBeNull();
    expect(parseBlocklyMessage('{"type":"code","code":42}')).toBeNull();
    expect(parseBlocklyMessage('{"type":"error"}')).toBeNull();
    expect(parseBlocklyMessage('{"type":"error","message":7}')).toBeNull();
  });
});
