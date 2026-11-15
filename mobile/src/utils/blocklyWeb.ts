// Blockly-in-a-WebView — the mobile lane of the judge-fairness wave-D
// block editor. The web app mounts Blockly directly in the DOM
// (src/components/blocks/BlockEditor.tsx); React Native has no DOM, so
// the SAME editor runs inside a react-native-webview loading the official
// Blockly UMD bundles (copied verbatim from the pinned `blockly` package
// by scripts/copy-blockly.mjs). Generated source flows back over the
// WebView postMessage bridge and is submitted through the NORMAL judge
// pipeline with `language` = the generator — identical to the web.
//
// This module is the pure half (no React, no native imports): the HTML
// document builder, the site-block definitions (a port of the web's
// wcBlocks.ts), the default toolbox/starter (ported verbatim from the
// web's BlockEditor.tsx) and the bridge-message parser. 100% unit-tested.

export type BlockGenerator = 'python3' | 'nodejs20';

/** The UMD bundles + message pack injected into the WebView document. */
export interface BlocklyScripts {
  /** node_modules/blockly/blockly_compressed.js */
  core: string;
  /** node_modules/blockly/blocks_compressed.js */
  blocks: string;
  /** node_modules/blockly/python_compressed.js */
  python: string;
  /** node_modules/blockly/javascript_compressed.js */
  javascript: string;
  /** blockly/msg/en.js or blockly/msg/ro.js */
  messages: string;
}

/** The default beginner toolbox: logic, loops, math, text, I/O, vars. */
export const DEFAULT_TOOLBOX_XML = `
<xml xmlns="https://developers.google.com/blockly/xml">
  <category name="%(logic)s" colour="%{BKY_LOGIC_HUE}">
    <block type="controls_if"></block>
    <block type="logic_compare"></block>
    <block type="logic_operation"></block>
  </category>
  <category name="%(loops)s" colour="%{BKY_LOOPS_HUE}">
    <block type="controls_repeat_ext"></block>
    <block type="controls_whileUntil"></block>
    <block type="controls_for"></block>
  </category>
  <category name="%(math)s" colour="%{BKY_MATH_HUE}">
    <block type="math_number"></block>
    <block type="math_arithmetic"></block>
    <block type="math_modulo"></block>
    <block type="math_integer_division"></block>
  </category>
  <category name="%(text)s" colour="%{BKY_TEXTS_HUE}">
    <block type="text"></block>
    <block type="text_print"></block>
  </category>
  <category name="%(input)s" colour="%{BKY_TEXTS_HUE}">
    <block type="wc_input_number"></block>
    <block type="wc_input_line"></block>
  </category>
  <category name="%(lists)s" colour="%{BKY_LISTS_HUE}">
    <block type="lists_create_with"></block>
    <block type="lists_length"></block>
    <block type="lists_getIndex"></block>
  </category>
  <category name="%(variables)s" colour="%{BKY_VARIABLES_HUE}" custom="VARIABLE"></category>
  <category name="%(functions)s" colour="%{BKY_PROCEDURES_HUE}" custom="PROCEDURE"></category>
</xml>`;

/** Starter workspace: read n, print n % 10. */
export const DEFAULT_STARTER_XML = `
<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="variables_set" x="40" y="40">
    <field name="VAR">n</field>
    <value name="VALUE">
      <block type="wc_input_number"></block>
    </value>
    <next>
      <block type="text_print">
        <value name="TEXT">
          <block type="math_modulo">
            <value name="DIVIDEND">
              <block type="variables_get">
                <field name="VAR">n</field>
              </block>
            </value>
            <value name="DIVISOR">
              <block type="math_number">
                <field name="NUM">10</field>
              </block>
            </value>
          </block>
        </value>
      </block>
    </next>
  </block>
</xml>`;

/** Localize the toolbox category labels (msg packs localize blocks). */
export function localizeToolbox(toolbox: string, labels: Record<string, string>): string {
  return toolbox.replace(/%\((\w+)\)s/g, (_m, key: string) => labels[key] ?? key);
}

/** English strings for the two site blocks (appended to the msg pack). */
export const WC_BLOCK_MESSAGES_EN = {
  WC_INPUT_NUMBER: 'read a number from input',
  WC_INPUT_NUMBER_TIP: 'Reads one integer from the standard input.',
  WC_INPUT_LINE: 'read a line from input',
  WC_INPUT_LINE_TIP: 'Reads one line of text from the standard input.',
} as const;

/** Romanian strings for the two site blocks. */
export const WC_BLOCK_MESSAGES_RO = {
  WC_INPUT_NUMBER: 'citește un număr de la intrare',
  WC_INPUT_NUMBER_TIP: 'Citește un întreg de la intrarea standard.',
  WC_INPUT_LINE: 'citește o linie de la intrare',
  WC_INPUT_LINE_TIP: 'Citește o linie de text de la intrarea standard.',
} as const;

/** Judge-compatible stdin reads in generated Python. */
export const WC_PY_NUMBER = 'int(input())';
export const WC_PY_LINE = 'input()';
/** JS counterparts (the preamble defines the helpers). */
export const WC_JS_NUMBER = 'wcReadNumber()';
export const WC_JS_LINE = 'wcReadLine()';

/** Emitted once at the top of generated JS programs (stdin reader). */
export const WC_JS_PREAMBLE = `const wcLines = require('fs').readFileSync(0, 'utf8').split('\\n');
let wcIdx = 0;
function wcReadLine() { return wcLines[wcIdx++] ?? ''; }
function wcReadNumber() { return Number(wcReadLine()); }
`;

/**
 * The site-specific block registration + generator hooks, injected into
 * the WebView after the UMD bundles load — the bridge-side twin of the
 * web's `registerBlockTypes` (wcBlocks.ts).
 */
export const WC_BRIDGE_SCRIPT = `
globalThis.wcRegisterBlocks = function (Blockly, pythonGen, jsGen) {
  Blockly.defineBlocksWithJsonArray([
    {
      type: 'wc_input_number',
      message0: '%{BKY_WC_INPUT_NUMBER}',
      output: 'Number',
      colour: '%{BKY_TEXTS_HUE}',
      tooltip: '%{BKY_WC_INPUT_NUMBER_TIP}',
    },
    {
      type: 'wc_input_line',
      message0: '%{BKY_WC_INPUT_LINE}',
      output: 'String',
      colour: '%{BKY_TEXTS_HUE}',
      tooltip: '%{BKY_WC_INPUT_LINE_TIP}',
    },
  ]);
  pythonGen.forBlock['wc_input_number'] = () => [${JSON.stringify(WC_PY_NUMBER)}, 0];
  pythonGen.forBlock['wc_input_line'] = () => [${JSON.stringify(WC_PY_LINE)}, 0];
  jsGen.forBlock['wc_input_number'] = () => [${JSON.stringify(WC_JS_NUMBER)}, 0];
  jsGen.forBlock['wc_input_line'] = () => [${JSON.stringify(WC_JS_LINE)}, 0];
};
`;

export interface BuildBlocklyHtmlOptions {
  generator: BlockGenerator;
  /** Per-problem toolbox XML (falls back to the default beginner set). */
  toolboxXml?: string;
  /** Per-problem starter workspace XML. */
  starterXml?: string;
  /** 'ro' selects the Romanian message pack; anything else English. */
  locale: string;
  /** Localized toolbox category labels (the caller's t() output). */
  categoryLabels: Record<string, string>;
  scripts: BlocklyScripts;
}

/** Neutralize `</script>` inside an inline script so it cannot close the
 * wrapping tag early (the UMD bundles never contain it; defense anyway). */
function safeInlineScript(js: string): string {
  return js.replace(/<\/script/gi, '<\\/script');
}

/**
 * Build the complete self-contained HTML document for the editor
 * WebView: UMD bundles → message pack → site blocks → workspace → the
 * postMessage bridge that emits generated code on every change.
 */
export function buildBlocklyHtml(options: BuildBlocklyHtmlOptions): string {
  const { generator, toolboxXml, starterXml, locale, categoryLabels, scripts } = options;
  const toolbox = localizeToolbox(toolboxXml ?? DEFAULT_TOOLBOX_XML, categoryLabels);
  const starter = starterXml ?? DEFAULT_STARTER_XML;
  const wcMessages = locale.startsWith('ro') ? WC_BLOCK_MESSAGES_RO : WC_BLOCK_MESSAGES_EN;
  const isJs = generator === 'nodejs20';
  const preamble = isJs ? WC_JS_PREAMBLE : '';
  const config = {
    toolbox,
    starter,
    messages: wcMessages,
    generator,
    preamble,
  };
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden;
    background: #0f172a; }
  #blockly-div { position: absolute; inset: 0; }
  .blocklyToolboxDiv { background: #1e293b; }
  .blocklyTreeLabel { font-family: sans-serif; font-size: 12px; color: #e2e8f0; }
  .blocklyMainBackground { stroke: none; }
  .blocklyWidgetDiv, .blocklyDropDownDiv { background: #1e293b; color: #e2e8f0; }
  .blocklyDropDownDiv .blocklyMenuItem { color: #e2e8f0; }
</style>
</head>
<body>
<div id="blockly-div"></div>
<script>${safeInlineScript(scripts.core)}</script>
<script>${safeInlineScript(scripts.blocks)}</script>
<script>${safeInlineScript(scripts.python)}</script>
<script>${safeInlineScript(scripts.javascript)}</script>
<script>${safeInlineScript(scripts.messages)}</script>
<script>${safeInlineScript(WC_BRIDGE_SCRIPT)}
(function () {
  function report(type, payload) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify(
        Object.assign({ type: type }, payload),
      ));
    } catch (_) { /* the bridge is gone — nothing to report to */ }
  }
  // Surface script failures to the RN side (a blank editor is the worst
  // possible failure mode); window.onerror fires before the code below.
  report('boot', {});
  window.onerror = function (message) {
    report('error', { message: String(message) });
    return false;
  };
  try {
    var cfg = ${JSON.stringify(config)};
    // Apply the site-block messages on top of the message pack.
    for (var key in cfg.messages) { Blockly.Msg[key] = cfg.messages[key]; }
    var pythonGen = Blockly.Python;
    var jsGen = Blockly.JavaScript;
    globalThis.wcRegisterBlocks(Blockly, pythonGen, jsGen);
    var workspace = Blockly.inject('blockly-div', {
      toolbox: cfg.toolbox,
      grid: { spacing: 24, length: 3, colour: '#334155', snap: true },
      zoom: { controls: false, wheel: false },
      trashcan: false,
      sounds: false,
      move: { scrollbars: true, drag: true, wheel: true },
    });
    Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(cfg.starter), workspace);
    function generated() {
      var code = cfg.generator === 'nodejs20'
        ? jsGen.workspaceToCode(workspace)
        : pythonGen.workspaceToCode(workspace);
      // The wc_* stdin helpers need their preamble exactly once (JS only).
      if (cfg.generator === 'nodejs20' && code.indexOf('wcRead') !== -1) {
        code = cfg.preamble + '\\n' + code;
      }
      return code;
    }
    function post() {
      report('code', { code: generated() });
    }
    workspace.addChangeListener(post);
    post();
  } catch (err) {
    report('error', { message: err && err.message ? err.message : String(err) });
  }
})();
</script>
</body>
</html>`;
}

/** A parsed WebView bridge message: generated code, or a reported error. */
export type BlocklyBridgeMessage =
  | { type: 'code'; code: string }
  | { type: 'error'; message: string }
  | { type: 'boot' };

/** Parse a raw postMessage payload; null when it is not a bridge message
 * (malformed JSON, foreign messages, or missing fields are dropped). */
export function parseBlocklyMessage(raw: string): BlocklyBridgeMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const candidate = parsed as { type?: unknown; code?: unknown; message?: unknown };
  if (candidate.type === 'code' && typeof candidate.code === 'string') {
    return { type: 'code', code: candidate.code };
  }
  if (candidate.type === 'error' && typeof candidate.message === 'string') {
    return { type: 'error', message: candidate.message };
  }
  if (candidate.type === 'boot') return { type: 'boot' };
  return null;
}
