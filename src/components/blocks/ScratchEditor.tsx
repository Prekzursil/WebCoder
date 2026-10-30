'use client';

// [wave D, engine 2 — Scratch layer] The authentic Scratch editing
// experience on site: scratch-vm + scratch-blocks + scratch-render, wired
// the way scratch-gui wires them, with a CURATED toolbox (the per-problem
// block restrictions mirrored from the Blockly layer) and a judge
// integration that transpiles the project JSON to Python server-side
// (problems/scratch_transpiler.py — see docs/BLOCK-PROGRAMMING.md for the
// decision record).
//
// Everything here is browser-only and imported lazily: SSR never loads
// the Scratch stack, and the route bundle only pays for it on pages that
// render the editor.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { palette } from '@/theme/tokens';

/** The official default-project assets bundled locally (public/scratch-assets)
 * so the Scratch-cat starter never depends on the external asset CDN. */
const BUNDLED_ASSETS: Record<string, string> = {
  // The Scratch cat costume and the default backdrop, verified md5s.
  bcf454acf82e4504149f7ffe07081dbc: 'svg',
  cd21514d0531fdffb22204e0ec5ed84a: 'svg',
};

/** Opcodes offered per Scratch category — the toolbox generator's source.
 * Kept in lockstep with problems/scratch_transpiler.KNOWN_OPCODES. */
const OPCODE_CATEGORIES: Record<string, string[]> = {
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

/** Build the static scratch-blocks toolbox XML for a curated opcode set.
 * Variable blocks carry a VARIABLE field for each declared variable so the
 * palette works without scratch-gui's dynamic variable modal (v1: the
 * creator pre-declares the variables in the starter project — documented
 * in docs/BLOCK-PROGRAMMING.md). */
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
            .map((name) => `<block type="data_variable"><field name="VARIABLE">${name}</field></block>`)
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
 * say("Hello!") script. Assets resolve through the bundled files. */
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

export interface ScratchEditorProps {
  /** Starter sb3 project JSON (problem config or playground default). */
  projectJson?: string;
  /** Per-problem curated block set (opcodes); null = the full curated set. */
  allowedOpcodes?: string[] | null;
  height?: number;
  /** Called with the current project JSON whenever it changes. */
  onProjectChange?: (projectJson: string) => void;
}

export default function ScratchEditor({
  projectJson,
  allowedOpcodes = null,
  height = 460,
  onProjectChange,
}: ScratchEditorProps) {
  const { t, i18n } = useTranslation();
  const blocksRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vmRef = useRef<{ greenFlag: () => void; stopAll: () => void } | null>(
    null,
  );
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const onChangeRef = useRef(onProjectChange);
  onChangeRef.current = onProjectChange;

  const pushConsole = useCallback((line: string) => {
    setConsoleLines((lines) => [...lines.slice(-40), line]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let vm: { stopAll: () => void; quit: () => void } | null = null;

    (async () => {
      const VirtualMachine = (await import('scratch-vm')).default;
      const ScratchRender = (await import('scratch-render')).default;
      // scratch-storage ships its own types: named exports.
      const { ScratchStorage, AssetType } = await import('scratch-storage');
      // Deep import: the package's "browser" field points at a shim with
      // webpack inline-loader syntax that Turbopack cannot resolve; the
      // dist bundle is the exact same module, self-contained.
      const Blockly = (
        await import('scratch-blocks/dist/vertical.js')
      ).default;
      if (cancelled) return;

      // RO block labels from the official scratch-l10n catalog (same
      // mechanism scratch-gui uses); EN is baked into scratch-blocks.
      if (i18n.language?.startsWith('ro')) {
        const ro = (await import('scratch-l10n/editor/blocks/ro.json')).default;
        for (const [key, value] of Object.entries(
          ro as Record<string, string>,
        )) {
          (Blockly as { Msg: Record<string, string> }).Msg[key] = value;
        }
      }

      const storage = new ScratchStorage();
      // Pre-register the bundled default assets (cat + backdrop) so the
      // starter project loads with zero external requests.
      const builtin = (
        storage as unknown as {
          builtinHelper: {
            store: (
              type: unknown,
              format: string,
              data: ArrayBuffer,
              id: string,
            ) => string;
          };
        }
      ).builtinHelper;
      await Promise.all(
        Object.entries(BUNDLED_ASSETS).map(async ([md5, format]) => {
          const response = await fetch(`/scratch-assets/${md5}.${format}`);
          if (!response.ok) return;
          builtin.store(
            AssetType.ImageVector,
            format,
            await response.arrayBuffer(),
            md5,
          );
        }),
      );

      const machine = new VirtualMachine();
      vm = machine as unknown as { stopAll: () => void; quit: () => void };
      vmRef.current = machine as unknown as {
        greenFlag: () => void;
        stopAll: () => void;
      };
      machine.attachStorage(storage);
      if (canvasRef.current) {
        try {
          const renderer = new ScratchRender(canvasRef.current);
          machine.attachRenderer(renderer);
        } catch {
          // No WebGL (headless browsers, locked-down GPUs): the stage
          // stays blank but block editing and project export are fully
          // functional — grading never needs the renderer.
        }
      }
      machine.start();

      // Say/think output → the learner-visible console strip (the judge's
      // transpiled print stream mirrors exactly this).
      (machine.runtime as unknown as {
        on: (event: string, cb: (...args: unknown[]) => void) => void;
      }).on('SAY', (_target: unknown, type: unknown, text: unknown) => {
        if (type !== 'say' && type !== 'think') return;
        pushConsole(String(text ?? ''));
      });

      const toolbox = buildToolboxXml(
        allowedOpcodes,
        declaredVariableNames(projectJson ?? DEFAULT_SCRATCH_PROJECT),
        {
          events: t('sbx_cat_events', 'Events'),
          control: t('sbx_cat_control', 'Control'),
          looks: t('sbx_cat_looks', 'Looks'),
          sensing: t('sbx_cat_sensing', 'Sensing'),
          operators: t('sbx_cat_operators', 'Operators'),
          variables: t('sbx_cat_variables', 'Variables'),
        },
      );
      if (!blocksRef.current) return;
      const workspace = (Blockly as unknown as {
        inject: (el: HTMLElement, options: Record<string, unknown>) => unknown;
      }).inject(blocksRef.current, {
        toolbox,
        media: '/scratch-blocks-media/',
        zoom: { controls: true, startScale: 0.75, maxScale: 1.5, minScale: 0.25 },
        trashcan: true,
        grid: { spacing: 40, natural: true },
      });
      const ws = workspace as unknown as {
        addChangeListener: (cb: (e: unknown) => void) => void;
        removeChangeListener: (cb: (e: unknown) => void) => void;
      };
      const machineAny = machine as unknown as {
        blockListener: (e: unknown) => void;
        on: (event: string, cb: (data: { xml: string }) => void) => void;
        emitWorkspaceUpdate: () => void;
        loadProject: (input: string | object) => Promise<void>;
        toJSON: () => string;
        greenFlag: () => void;
        stopAll: () => void;
      };
      ws.addChangeListener(machineAny.blockListener);
      machineAny.on('workspaceUpdate', ({ xml }) => {
        const B = Blockly as unknown as {
          Xml: {
            textToDom: (text: string) => unknown;
            clearWorkspaceAndLoadFromXml: (dom: unknown, ws: unknown) => void;
          };
        };
        B.Xml.clearWorkspaceAndLoadFromXml(B.Xml.textToDom(xml), workspace);
      });

      try {
        await machineAny.loadProject(
          JSON.parse(projectJson ?? DEFAULT_SCRATCH_PROJECT),
        );
      } catch {
        // A creator-supplied starter that fails validation still leaves a
        // usable editor: fall back to the default cat project.
        await machineAny.loadProject(JSON.parse(DEFAULT_SCRATCH_PROJECT));
      }
      machineAny.emitWorkspaceUpdate();
      machineAny.on('PROJECT_CHANGED', () => {
        try {
          onChangeRef.current?.(machineAny.toJSON());
        } catch {
          // serialization races during block deletion; next event wins
        }
      });
      setReady(true);
      try {
        onChangeRef.current?.(machineAny.toJSON());
      } catch {
        /* initial export race — PROJECT_CHANGED re-exports */
      }
    })().catch((exc) => {
      if (!cancelled) {
        setError(
          exc instanceof Error ? exc.message : 'Failed to load the Scratch editor.',
        );
      }
    });

    return () => {
      cancelled = true;
      vmRef.current = null;
      vm?.stopAll();
    };
    // Re-mount when the problem's starter project or curated block set or
    // the locale changes (blocks re-localize on language switch).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectJson, allowedOpcodes, i18n.language]);

  return (
    <div data-testid="scratch-editor">
      <div style={{ display: 'flex', gap: '12px', alignItems: 'stretch' }}>
        <div
          ref={blocksRef}
          style={{
            flex: '1 1 62%',
            height,
            border: '1px solid var(--border)',
            borderRadius: 12,
            overflow: 'hidden',
            background: '#fff',
          }}
          aria-label={t('sbx_editor_label', 'Scratch block editor')}
        />
        <div
          style={{
            flex: '1 1 38%',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
            }}
          >
            <button
              type="button"
              className="btn btn--primary"
              data-testid="scratch-green-flag"
              onClick={() => {
                setConsoleLines([]);
                vmRef.current?.greenFlag();
              }}
            >
              ⚑ {t('sbx_run', 'Run (green flag)')}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              data-testid="scratch-stop"
              onClick={() => vmRef.current?.stopAll()}
            >
              ⏹ {t('sbx_stop', 'Stop')}
            </button>
          </div>
          <canvas
            ref={canvasRef}
            style={{
              width: '100%',
              aspectRatio: '4 / 3',
              border: '1px solid var(--border)',
              borderRadius: 12,
              background: '#fff',
            }}
            aria-label={t('sbx_stage_label', 'Scratch stage')}
          />
          <div
            data-testid="scratch-console"
            style={{
              border: `1px solid ${palette.border}`,
              borderRadius: 8,
              background: 'var(--surface-2)',
              padding: '8px 10px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem',
              color: 'var(--muted)',
              minHeight: '60px',
              maxHeight: '120px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
            }}
            aria-live="polite"
          >
            {consoleLines.length === 0
              ? t('sbx_console_empty', '(say blocks print here when you run)')
              : consoleLines.map((line, i) => <div key={i}>{line}</div>)}
          </div>
        </div>
      </div>
      {error && (
        <p
          role="alert"
          style={{ color: palette.danger, fontSize: '0.82rem', marginTop: 8 }}
        >
          {t('sbx_load_error', 'Scratch editor failed to load:')} {error}
        </p>
      )}
      {!ready && !error && (
        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', marginTop: 8 }}>
          {t('sbx_loading', 'Loading the Scratch editor…')}
        </p>
      )}
      <p style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem', marginTop: 8 }}>
        {t(
          'sbx_submit_hint',
          'Your Scratch project is translated to Python and judged like any other submission.',
        )}
      </p>
    </div>
  );
}
