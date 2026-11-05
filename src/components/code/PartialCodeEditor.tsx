"use client";

// [judge-fairness wave E] Partial-code editor: renders the ENTIRE template
// file in CodeMirror 6 with LOCKED regions greyed and non-editable — the
// learner sees and keeps the whole skeleton (includes, main, I/O), which
// is exactly the HackerRank-style affordance the owner asked for (and
// strictly better than pbinfo's context-free function paste, which is the
// degenerate case of this model).
//
// Enforcement is SERVER-side (submit 400 + judge-time re-check): the
// editor's read-only ranges are UX, not the security boundary.

import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { EditorView, Decoration, type DecorationSet } from "@codemirror/view";
import { EditorState, StateEffect, StateField, type Extension } from "@codemirror/state";
import { python } from "@codemirror/lang-python";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
  loading: () => null,
});

const LANGUAGE_EXTENSIONS: Record<string, () => ReturnType<typeof python>> = {
  python3: python,
  cpp17: cpp,
  c11: cpp,
  java11: java,
  nodejs20: javascript,
};

/** One parsed template region (mirrors backend/code_template.py). */
export interface TemplateSegment {
  locked: boolean;
  text: string;
}

export const EDIT_START = "WC_EDIT_START";
export const EDIT_END = "WC_EDIT_END";

const SENTINEL_RE = /^\s*(?:\/\/|#|--|;)?\s*(WC_EDIT_START|WC_EDIT_END)\s*$/;

/** Client twin of the backend parser (same sentinel contract). */
export function parseTemplate(template: string | null | undefined): TemplateSegment[] {
  if (!template) return [];
  const segments: TemplateSegment[] = [];
  let lockedBuf: string[] = [];
  let editableBuf: string[] | null = null;
  for (const line of template.split("\n")) {
    const match = line.match(SENTINEL_RE);
    if (match) {
      if (match[1] === EDIT_START) {
        if (lockedBuf.length) {
          segments.push({ locked: true, text: lockedBuf.join("\n") });
          lockedBuf = [];
        }
        editableBuf = [];
      } else {
        if (editableBuf !== null) {
          segments.push({ locked: false, text: editableBuf.join("\n") });
          editableBuf = null;
        }
      }
      continue;
    }
    (editableBuf ?? lockedBuf).push(line);
  }
  if (lockedBuf.length) segments.push({ locked: true, text: lockedBuf.join("\n") });
  return segments;
}

/** Char ranges of the locked regions inside the FULL assembled document.
 * The document keeps the sentinel lines (the server compares exactly what
 * the learner sees), so scan the TEMPLATE itself with a running offset:
 * locked spans run from after each END sentinel to the next START
 * sentinel (plus head and tail of the file). */
export function lockedRangesInTemplate(template: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const lines = template.split("\n");
  let pos = 0;
  let lockStart: number | null = 0; // file head is locked
  for (const line of lines) {
    const lineStart = pos;
    pos += line.length + 1; // +1 newline
    const match = line.match(SENTINEL_RE);
    if (!match) continue;
    if (match[1] === EDIT_START) {
      // lock everything up to (and including) the sentinel line
      if (lockStart !== null) ranges.push([lockStart, lineStart + line.length]);
      lockStart = null;
    } else {
      // locking resumes at the start of the END sentinel's line
      lockStart = lineStart;
    }
  }
  if (lockStart !== null) ranges.push([lockStart, template.length]);
  return ranges.filter(([lo, hi]) => hi > lo);
}

const setLocked = StateEffect.define<Array<[number, number]>>();

const lockedField = StateField.define<Array<[number, number]>>({
  create: () => [],
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setLocked)) return effect.value;
    }
    return value;
  },
});

/** Reject any change that touches a locked range (read-only scaffolding). */
const changeGuard = EditorState.changeFilter.of((tr) => {
  const locked = tr.state.field(lockedField) as Array<[number, number]>;
  if (!locked.length) return true;
  let allowed = true;
  tr.changes.iterChangedRanges((from: number, to: number) => {
    for (const [lo, hi] of locked) {
      // a change strictly inside an editable gap is fine; anything that
      // overlaps (or deletes across) a locked range is rejected
      if (from < hi && to > lo) allowed = false;
    }
  });
  return allowed;
});

const lockedMark = Decoration.mark({ class: "cm-wc-locked" });

const lockedDecorations = EditorView.decorations.compute([lockedField], (state) => {
  const locked = state.field(lockedField) as Array<[number, number]>;
  const builder: DecorationSet = Decoration.set(
    locked.filter(([lo, hi]) => hi > lo).map(([lo, hi]) => lockedMark.range(lo, hi)),
  );
  return builder;
});

/** Build the extensions that keep the scaffolding read-only + greyed. */
export function lockedRegionExtensions(ranges: Array<[number, number]>): Extension[] {
  return [
    lockedField.init(() => ranges),
    changeGuard,
    lockedDecorations,
    EditorView.theme({
      ".cm-wc-locked": {
        opacity: "0.55",
        cursor: "not-allowed",
        backgroundColor: "rgba(148, 163, 184, 0.08)",
      },
    }),
  ];
}

export interface PartialCodeEditorProps {
  template: string;
  language: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  height?: string;
}

/** Judge language id -> CodeMirror extension (mirrors CodeEditor.tsx). */
function languageExtensionFor(language: string): Extension {
  const pack = LANGUAGE_EXTENSIONS[language] ?? python;
  return pack() as Extension;
}

export default function PartialCodeEditor({
  template,
  language,
  value,
  onChange,
  ariaLabel,
  height = "420px",
}: PartialCodeEditorProps) {
  const extensions = useMemo(
    () => lockedRegionExtensions(lockedRangesInTemplate(template)),
    [template],
  );

  // The editor mounts with the template (sentinels kept) and is then
  // UNCONTROLLED: rapid typing under a controlled value re-renders with a
  // stale doc and CodeMirror resets, swallowing keystrokes. The parent
  // receives every edit through onChange instead (the submit flow only
  // needs the final assembled document).
  const [initialDoc] = useState(value || template);

  return (
    <div data-testid="partial-code-editor" style={{ position: "relative" }}>
      <CodeMirror
        value={initialDoc}
        height={height}
        extensions={[...extensions, languageExtensionFor(language)]}
        onChange={onChange}
        aria-label={ariaLabel}
        basicSetup={{ foldGutter: false }}
      />
    </div>
  );
}
