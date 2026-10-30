'use client';

// [judge-fairness wave D] Scratch on site: a Blockly block editor whose
// generated source (Python or JavaScript) is submitted through the NORMAL
// judge pipeline — a block problem is just a submission whose source came
// from blocks.
//
// Why Blockly over scratch-vm (decision recorded in the PR): Apache-2.0
// licensing, a browser-only bundle vs scratch-vm's full stage/sprite
// runtime, mature Python AND JavaScript code generators (scratch-vm has
// neither), official Romanian message packs (blockly/msg/ro), and an XML
// toolbox model that maps directly onto per-problem block sets.
// scratch-vm fits a sprite-animation product, not a judge.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { WC_JS_PREAMBLE } from './wcBlocks';
import { palette } from '@/theme/tokens';

export type BlockGenerator = 'python3' | 'nodejs20';

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
  <category name="%(variables)s" colour="%{BKY_VARIABLES_HUE}" custom="VARIABLE"></category>
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

export const WC_BLOCK_MESSAGES_RO = {
  WC_INPUT_NUMBER: 'citește un număr de la intrare',
  WC_INPUT_NUMBER_TIP: 'Citește un întreg de la intrarea standard.',
  WC_INPUT_LINE: 'citește o linie de la intrare',
  WC_INPUT_LINE_TIP: 'Citește o linie de text de la intrarea standard.',
} as const;

/** Apply the site blocks' messages to a loaded Blockly bundle. */
function applyWcMessages(Blockly: { Msg: Record<string, string> }, locale: string) {
  const msgs =
    locale.startsWith('ro') || locale === 'ro' ? WC_BLOCK_MESSAGES_RO : WC_BLOCK_MESSAGES_EN;
  for (const [key, value] of Object.entries(msgs)) {
    Blockly.Msg[key] = value;
  }
}

export interface BlockEditorProps {
  generator?: BlockGenerator;
  toolboxXml?: string;
  starterXml?: string;
  height?: number;
  /** Called with the generated source whenever the workspace changes. */
  onCodeChange?: (code: string) => void;
}

export default function BlockEditor({
  generator = 'python3',
  toolboxXml,
  starterXml,
  height = 420,
  onCodeChange,
}: BlockEditorProps) {
  const { t, i18n } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<unknown>(null);
  const genRef = useRef<((ws: unknown) => string) | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState('');
  const onChangeRef = useRef(onCodeChange);
  onChangeRef.current = onCodeChange;

  const refreshCode = useCallback(() => {
    if (workspaceRef.current && genRef.current) {
      const generated = genRef.current(workspaceRef.current);
      setCode(generated);
      onChangeRef.current?.(generated);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let detach: (() => void) | undefined;

    (async () => {
      // Blockly touches the DOM heavily — import lazily so SSR never
      // loads it and the route bundle stays lean.
      const Blockly = await import('blockly');
      const { registerBlockTypes } = await import('./wcBlocks');
      const { pythonGenerator } = await import('blockly/python');
      const { javascriptGenerator } = await import('blockly/javascript');
      if (cancelled || !containerRef.current) return;

      // RO/EN block labels come from Blockly's official message packs.
      // (The msg modules' `default` export interop differs across build
      // targets — normalize to the message record either way.)
      const localeModule = await (i18n.language?.startsWith('ro')
        ? import('blockly/msg/ro')
        : import('blockly/msg/en'));
      const locale = localeModule.default ?? localeModule;
      Blockly.setLocale(locale as Parameters<typeof Blockly.setLocale>[0]);
      applyWcMessages(Blockly, i18n.language || 'en');
      registerBlockTypes(Blockly, pythonGenerator, javascriptGenerator);

      const toolbox = localizeToolbox(toolboxXml ?? DEFAULT_TOOLBOX_XML, {
        logic: t('blocks_cat_logic', 'Logic'),
        loops: t('blocks_cat_loops', 'Loops'),
        math: t('blocks_cat_math', 'Math'),
        text: t('blocks_cat_text', 'Text'),
        input: t('blocks_cat_input', 'Input'),
        variables: t('blocks_cat_variables', 'Variables'),
      });

      const workspace = Blockly.inject(containerRef.current, {
        toolbox,
        grid: { spacing: 24, length: 3, colour: palette.border, snap: true },
        zoom: { controls: true, wheel: false },
        trashcan: true,
      });
      workspaceRef.current = workspace;
      genRef.current =
        generator === 'nodejs20'
          ? (ws: unknown) => {
              const js = javascriptGenerator.workspaceToCode(ws as never);
              // The wc_* stdin helpers need their preamble exactly once.
              return js.includes('wcRead')
                ? `${WC_JS_PREAMBLE}\n${js}`
                : js;
            }
          : (ws: unknown) => pythonGenerator.workspaceToCode(ws as never);

      const starter = starterXml ?? DEFAULT_STARTER_XML;
      Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(starter), workspace as never);

      const handler = () => refreshCode();
      workspace.addChangeListener(handler);
      detach = () => workspace.removeChangeListener(handler);
      refreshCode();
    })();

    return () => {
      cancelled = true;
      detach?.();
    };
    // The effect re-runs when the problem's block set or the locale
    // changes (blocks re-localize on language switch).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generator, toolboxXml, starterXml, i18n.language]);

  return (
    <div>
      <div
        ref={containerRef}
        style={{ width: '100%', height, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}
        aria-label={t('blocks_editor_label', 'Block editor')}
        data-testid="blockly-editor"
      />
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => {
            setShowCode((v) => !v);
            refreshCode();
          }}
        >
          {showCode
            ? t('blocks_hide_code', 'Hide generated code')
            : t('blocks_show_code', 'Show generated code')}
        </button>
        <span style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>
          {generator === 'nodejs20'
            ? t('blocks_generates_js', 'generates JavaScript (Node.js 20)')
            : t('blocks_generates_python', 'generates Python 3')}
        </span>
      </div>
      {showCode && (
        <pre
          data-testid="generated-code"
          style={{
            marginTop: '8px',
            padding: '12px',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontFamily: 'var(--font-mono)',
            fontSize: '0.82rem',
            color: 'var(--muted)',
            whiteSpace: 'pre-wrap',
          }}
        >
{code || t('blocks_empty', '(no blocks yet)')}
        </pre>
      )}
    </div>
  );
}
