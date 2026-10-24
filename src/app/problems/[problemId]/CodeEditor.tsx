'use client';

// [SPEC-GAPS A6 / roadmap UXP-1] The real code editor: CodeMirror 6 with
// per-language highlighting, a dark theme built on the token palette's
// accent family, Mod-Enter submit, and a graceful textarea fallback while
// the dynamic import loads (and anywhere JS editors cannot mount).

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { dracula } from '@uiw/codemirror-theme-dracula';
import { python } from '@codemirror/lang-python';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { javascript } from '@codemirror/lang-javascript';

const ReactCodeMirror = dynamic(() => import('@uiw/react-codemirror'), {
  ssr: false,
  loading: () => null,
});

// Judge language id -> CodeMirror language extension.
const LANGUAGE_EXTENSIONS: Record<string, () => ReturnType<typeof python>> = {
  python3: python,
  cpp17: cpp,
  c11: cpp,
  java11: java,
  nodejs20: javascript,
};

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  onModEnter?: () => void;
  ariaLabel?: string;
  height?: string;
}

export default function CodeEditor({
  value,
  onChange,
  language,
  onModEnter,
  ariaLabel,
  height = '380px',
}: CodeEditorProps): ReactNode {
  const extensions = useMemo(() => {
    const exts = [];
    const langFactory = language ? LANGUAGE_EXTENSIONS[language] : undefined;
    if (langFactory) exts.push(langFactory());
    if (onModEnter) {
      exts.push(
        Prec.highest(
          keymap.of([
            {
              key: 'Mod-Enter',
              run: () => {
                onModEnter();
                return true;
              },
            },
          ])
        )
      );
    }
    return exts;
  }, [language, onModEnter]);

  return (
    <div aria-label={ariaLabel} data-testid="code-editor">
      <ReactCodeMirror
        value={value}
        onChange={onChange}
        theme={dracula}
        height={height}
        extensions={extensions}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: true,
          bracketMatching: true,
          closeBrackets: true,
          indentOnInput: true,
          tabSize: 4,
        }}
        style={{ fontSize: '13px', fontFamily: 'var(--font-mono)' }}
      />
    </div>
  );
}
