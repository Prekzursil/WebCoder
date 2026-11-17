// Scratch-in-a-WebView — the mobile lane of the judge-fairness wave-D
// Scratch editor (the slice PR #317 documented as "until a native Scratch
// stage ships"; this IS that stage). The web app mounts scratch-vm +
// scratch-blocks + scratch-render in the DOM (src/components/blocks/
// ScratchEditor.tsx); React Native has no DOM, so the SAME stack runs
// inside a react-native-webview loading an esbuild IIFE bundle built from
// the same root node_modules (scripts/build-scratch.mjs — committed at
// assets/scratch/editor.txt with the media set + default assets inlined
// as data URIs). The sb3 project JSON flows back over the bridge and is
// submitted through the NORMAL judge pipeline with `language: 'scratch'`
// (the server transpiles it — problems/scratch_transpiler.py).
//
// This module is the pure half (no React, no native imports): the toolbox
// generator + starter-project default (ported verbatim from the web
// ScratchEditor.tsx so both lanes offer the SAME curated blocks), the
// HTML document builder, and the bridge-message parser. 100% unit-tested.

/** Opcodes offered per Scratch category — the toolbox generator's source.
 * Kept in lockstep with problems/scratch_transpiler.KNOWN_OPCODES
 * (verbatim port of the web editor's table). */
export const OPCODE_CATEGORIES: Record<string, string[]> = {
  events: ['event_whenflagclicked'],
  control: [
    'control_wait',
    'control_repeat',
    'control_forever',
    'control_if',
    'control_if_else',
    'control_whileUntil',
    'control_repeat_until',
    'control_stop',
  ].filter((op) => op !== 'control_wait'), // wait has no judged semantics
  looks: ['looks_say', 'looks_sayforsecs', 'looks_think'],
  sensing: ['sensing_askandwait', 'sensing_answer'],
  operators: [
    'operator_add',
    'operator_subtract',
    'operator_multiply',
    'operator_divide',
    'operator_mod',
    'operator_random',
    'operator_lt',
    'operator_gt',
    'operator_equals',
    'operator_and',
    'operator_or',
    'operator_not',
    'operator_join',
    'operator_letter_of',
    'operator_length',
    'operator_round',
    'operator_mathop',
  ].filter(
    // Only judged-mappable operators are offered (the curated set).
    (op) => op !== 'operator_random',
  ),
  variables: ['data_variable', 'data_setvariableto', 'data_changevariableby'],
};

/** Build the static scratch-blocks toolbox XML for a curated opcode set
 * (verbatim port of the web editor's generator, including the per-variable
 * VARIABLE-field blocks so the palette works without scratch-gui's modal). */
export function buildToolboxXml(
  allowedOpcodes: string[] | null,
  variableNames: string[],
  labels: Record<string, string>,
): string {
  const allowed = allowedOpcodes ? new Set(allowedOpcodes) : null;
  const parts: string[] = [];
  for (const [category, opcodes] of Object.entries(OPCODE_CATEGORIES)) {
    const offered = opcodes.filter((op) => !allowed || allowed.has(op));
    if (offered.length === 0) continue;
    const blocks = offered
      .map((op) => {
        if (op === 'data_variable') {
          return variableNames
            .map(
              (name) =>
                `<block type="data_variable"><field name="VARIABLE">${name}</field></block>`,
            )
            .join('');
        }
        if (op === 'data_setvariableto' || op === 'data_changevariableby') {
          const holder = variableNames[0] ?? 'n';
          return `<block type="${op}"><field name="VARIABLE">${holder}</field></block>`;
        }
        return `<block type="${op}"></block>`;
      })
      .join('');
    const label = labels[category] ?? category;
    parts.push(`<category name="${label}">${blocks}</category>`);
  }
  return `<xml xmlns="https://developers.google.com/blockly/xml">${parts.join('')}</xml>`;
}

/** Variable names declared in a starter project (display names, in order). */
export function declaredVariableNames(projectJson: string | null | undefined): string[] {
  if (!projectJson) return [];
  try {
    const project = JSON.parse(projectJson) as {
      targets?: { variables?: Record<string, [string, unknown]> }[];
    };
    const names: string[] = [];
    for (const target of project.targets ?? []) {
      for (const value of Object.values(target.variables ?? {})) {
        if (Array.isArray(value) && typeof value[0] === 'string') {
          names.push(value[0]);
        }
      }
    }
    return names;
  } catch {
    return [];
  }
}

/** The default starter project: the Scratch cat with one green-flag →
 * say("Hello!") script (verbatim port of the web editor's constant). */
export const DEFAULT_SCRATCH_PROJECT = JSON.stringify({
  targets: [
    {
      isStage: true,
      name: 'Stage',
      variables: {},
      lists: {},
      broadcasts: {},
      blocks: {},
      currentCostume: 0,
      costumes: [
        {
          name: 'backdrop1',
          assetId: 'cd21514d0531fdffb22204e0ec5ed84a',
          md5ext: 'cd21514d0531fdffb22204e0ec5ed84a.svg',
          dataFormat: 'svg',
          rotationCenterX: 240,
          rotationCenterY: 180,
        },
      ],
      sounds: [],
      volume: 100,
      layerOrder: 0,
      tempo: 60,
      videoTransparency: 50,
      videoState: 'on',
      textToSpeechLanguage: null,
    },
    {
      isStage: false,
      name: 'Sprite1',
      variables: {},
      lists: {},
      broadcasts: {},
      blocks: {
        flag: {
          opcode: 'event_whenflagclicked',
          next: 'say',
          parent: null,
          inputs: {},
          fields: {},
          topLevel: true,
          shadow: false,
          x: 60,
          y: 60,
        },
        say: {
          opcode: 'looks_say',
          next: null,
          parent: 'flag',
          inputs: { MESSAGE: [1, [10, 'Hello!']] },
          fields: {},
          topLevel: false,
          shadow: false,
        },
      },
      currentCostume: 0,
      costumes: [
        {
          name: 'cat1',
          assetId: 'bcf454acf82e4504149f7ffe07081dbc',
          md5ext: 'bcf454acf82e4504149f7ffe07081dbc.svg',
          dataFormat: 'svg',
          rotationCenterX: 48,
          rotationCenterY: 50,
        },
      ],
      sounds: [],
      volume: 100,
      layerOrder: 1,
      x: 0,
      y: 0,
      size: 100,
      direction: 90,
      draggable: false,
      rotationStyle: 'all around',
    },
  ],
  monitors: [],
  extensions: [],
  meta: { semver: '3.0.0', vm: '2.3.0', agent: 'WebCoder' },
});

/** The esbuild bundle injected into the WebView document. */
export interface ScratchScripts {
  /** mobile/assets/scratch/editor.txt */
  editor: string;
}

/** Bridge messages the page posts to RN. */
export type ScratchMessage =
  | { type: 'boot' }
  | { type: 'ready' }
  | { type: 'project'; json: string }
  | { type: 'say'; text: string }
  | { type: 'error'; message: string };

export function parseScratchMessage(raw: unknown): ScratchMessage | null {
  if (typeof raw !== 'string') return null;
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof candidate !== 'object' || candidate === null) return null;
  const msg = candidate as Record<string, unknown>;
  if (msg.type === 'ready') return { type: 'ready' };
  if (msg.type === 'boot') return { type: 'boot' };
  if (msg.type === 'project' && typeof msg.json === 'string') {
    return { type: 'project', json: msg.json };
  }
  if (msg.type === 'say' && typeof msg.text === 'string') {
    return { type: 'say', text: msg.text };
  }
  if (msg.type === 'error' && typeof msg.message === 'string') {
    return { type: 'error', message: msg.message };
  }
  return null;
}

export interface BuildScratchHtmlOptions {
  /** Starter sb3 project JSON (problem config; null = the default cat). */
  projectJson?: string;
  /** Per-problem curated block set (opcodes); null = the full curated set. */
  allowedOpcodes?: string[] | null;
  /** UI locale ('ro…' selects the Romanian block labels). */
  locale: string;
  /** Localized toolbox category labels (the caller's t() output). */
  categoryLabels: Record<string, string>;
  scripts: ScratchScripts;
}

function safeInlineScript(source: string): string {
  return source.replace(/<\/script>/gi, '<\\/script>');
}

export function buildScratchHtml(options: BuildScratchHtmlOptions): string {
  const toolbox = buildToolboxXml(
    options.allowedOpcodes ?? null,
    declaredVariableNames(options.projectJson ?? DEFAULT_SCRATCH_PROJECT),
    options.categoryLabels,
  );
  const config = {
    toolbox,
    projectJson: options.projectJson ?? null,
    defaultProject: DEFAULT_SCRATCH_PROJECT,
    locale: options.locale,
  };
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden;
    background: #fff; font-family: sans-serif; }
  #wc-blocks { position: absolute; inset: 0; }
  #wc-stage-outer { position: absolute; right: 0; top: 0; bottom: 0; width: 38%;
    display: flex; align-items: center; justify-content: center; pointer-events: none; }
  #wc-stage { width: 100%; aspect-ratio: 4 / 3; max-height: 100%; }
  .blocklyToolboxDiv { background: #fff; }
</style>
</head>
<body>
<div id="wc-blocks"></div>
<div id="wc-stage-outer"><canvas id="wc-stage"></canvas></div>
<script>${safeInlineScript(options.scripts.editor)}</script>
<script>
(function () {
  function report(type, payload) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify(
        Object.assign({ type: type }, payload || {}),
      ));
    } catch (_) { /* the bridge is gone — nothing to report to */ }
  }
  window.onerror = function (message, src, line, col, err) {
    // Surface the stack (or source position) with the message: minified
    // bundle errors are undiagnosable from the message alone. (Plain
    // concatenation — this script lives inside a template literal.)
    var where = err && err.stack ? String(err.stack).slice(0, 500) : src + ':' + line + ':' + col;
    report('error', { message: String(message) + ' @ ' + where });
    return false;
  };
  try {
    window.WebCoderScratch.init(${JSON.stringify(config)});
  } catch (e) {
    report('error', { message: String((e && e.message) || e) });
  }
})();
</script>
</body>
</html>`;
}
