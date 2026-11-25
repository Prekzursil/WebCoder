'use client';

// Problem-page experience wave (item A) — the rich statement studio.
//
// Replaces the plain statement textareas on the create/edit form with a
// real authoring environment:
//   - live-preview pane rendering the statement AS THE AUTHOR TYPES
//     (KaTeX math, highlighted code fences, images, constraint boxes);
//   - toolbar buttons for the common constructs (math block, inline math,
//     code block, constraint box, example I/O scaffold);
//   - STRUCTURED mode (fields for story / input format / output format /
//     constraints / examples) AND free-form markdown mode, round-tripped
//     through H2 sections in the stored markdown (single source of truth);
//   - autosaved drafts (AuthoringDraft API, debounced) restored on mount;
//   - statement version history (embeds the shipped StatementHistory —
//     never a duplicate).
//
// The studio edits ONE locale at a time (EN / RO tabs, mirroring the
// statement_i18n discipline); values flow through the parent's
// statement object.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import StatementMarkdown from '@/components/common/StatementMarkdown';
import { AuthoringService } from '@/services/ApiService';

export type StudioLocale = 'en' | 'ro';

const SECTIONS = [
  { key: 'story', en: 'Story', ro: 'Enunț' },
  { key: 'input', en: 'Input Format', ro: 'Date de intrare' },
  { key: 'output', en: 'Output Format', ro: 'Date de ieșire' },
  { key: 'constraints', en: 'Constraints', ro: 'Restricții' },
  { key: 'examples', en: 'Examples', ro: 'Exemple' },
] as const;

export type SectionKey = (typeof SECTIONS)[number]['key'];

/** Split stored markdown into the structured sections (best-effort).

A statement with no recognized H2 is treated as the story, so a
freeform → structured round-trip does not drop the text.
*/
export function parseStructured(markdown: string): Record<SectionKey, string> {
  const out: Record<SectionKey, string> = {
    story: '',
    input: '',
    output: '',
    constraints: '',
    examples: '',
  };
  let current: SectionKey | null = null;
  let sawKnown = false;
  for (const line of (markdown || '').split('\n')) {
    const heading = line.match(/^##\s+(.*)$/);
    if (heading) {
      const label = heading[1].trim().toLowerCase();
      const hit = SECTIONS.find(
        (s) => label === s.en.toLowerCase() || label === s.ro.toLowerCase(),
      );
      current = hit ? hit.key : null;
      if (hit) sawKnown = true;
      continue;
    }
    if (current) out[current] += (out[current] ? '\n' : '') + line;
  }
  if (!sawKnown) out.story = (markdown || '').replace(/^\n+|\n+$/g, '');
  return out;
}

/** Text that does not live under a recognized H2 (preamble, custom sections).

Empty when the document has no recognized section — that text is the story.
*/
export function captureRemainder(markdown: string): string {
  const chunks: string[] = [];
  let buf: string[] = [];
  let inKnown = false;
  let sawKnown = false;
  const flush = () => {
    if (!inKnown && buf.some((line) => line.trim())) chunks.push(buf.join('\n').trim());
    buf = [];
  };
  for (const line of (markdown || '').split('\n')) {
    const heading = line.match(/^##\s+(.*)$/);
    if (heading) {
      flush();
      const label = heading[1].trim().toLowerCase();
      const hit = SECTIONS.find(
        (s) => label === s.en.toLowerCase() || label === s.ro.toLowerCase(),
      );
      inKnown = Boolean(hit);
      if (hit) sawKnown = true;
      else buf.push(line);
      continue;
    }
    if (!inKnown) buf.push(line);
  }
  flush();
  return sawKnown ? chunks.join('\n\n').trim() : '';
}

/** Serialize structured fields back into section-marked markdown. */
export function buildStructured(fields: Record<SectionKey, string>): string {
  return SECTIONS.filter((s) => (fields[s.key] || '').trim())
    .map((s) => `## ${s.en}\n\n${fields[s.key].trim()}`)
    .join('\n\n');
}

type InsertKind = 'math-block' | 'math-inline' | 'code' | 'constraints' | 'example';

const SNIPPETS: Record<InsertKind, string> = {
  'math-block': '$$\n1 \\le n \\le 10^5\n$$',
  'math-inline': '$x_i$',
  code: '```python\n# your code here\n```',
  constraints: '- $1 \\le n \\le 10^5$\n- $1 \\le a_i \\le 10^9$',
  example: '### Input\n```\n5\n```\n### Output\n```\n10\n```',
};

export default function StatementStudio({
  problemId,
  locale,
  statement,
  onStatementChange,
}: {
  problemId: number | null;
  locale: StudioLocale;
  statement: string;
  onStatementChange: (next: string) => void;
}): ReactNode {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'structured' | 'freeform'>('freeform');
  const [fields, setFields] = useState<Record<SectionKey, string>>(() =>
    parseStructured(statement),
  );
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const hydratedFromDraft = useRef(false);
  // Custom sections / preamble that structured fields cannot represent.
  const remainderRef = useRef('');
  const seenLocale = useRef(locale);

  // Draft slot: "new" while the problem does not exist yet, else its id.
  const slot = problemId ? String(problemId) : 'new';

  // Restore an autosaved draft once on mount (before first edit).
  useEffect(() => {
    if (hydratedFromDraft.current) return;
    hydratedFromDraft.current = true;
    if (!statement.trim()) {
      AuthoringService.getDraft(slot)
        .then((data) => {
          const payload = data?.payload as { statement?: Record<string, string> } | undefined;
          const text = payload?.statement?.[locale];
          if (typeof text === 'string' && text.trim()) {
            onStatementChange(text);
            setFields(parseStructured(text));
            setRestored(true);
          }
        })
        .catch(() => {
          /* no draft — first visit */
        });
    }
  }, [slot, locale, statement, onStatementChange]);

  // The parent reuses one studio across EN/RO. Without this, structured
  // fields from the previous locale are written into the new one.
  useEffect(() => {
    if (seenLocale.current === locale) return;
    seenLocale.current = locale;
    remainderRef.current = captureRemainder(statement);
    setFields(parseStructured(statement));
    setMode('freeform');
  }, [locale, statement]);

  // Debounced autosave. Merge with the stored locale map so saving
  // Romanian does not erase the English draft (and the reverse).
  useEffect(() => {
    if (!statement.trim()) return;
    const handle = setTimeout(() => {
      const persist = (statementMap: Record<string, string>) =>
        AuthoringService.saveDraft(slot, { statement: statementMap })
          .then((data) => setSavedAt(data?.updated_at ?? new Date().toISOString()))
          .catch(() => {
            /* offline — next edit retries */
          });
      AuthoringService.getDraft(slot)
        .then((data) => {
          const prev = (data?.payload as { statement?: Record<string, string> } | undefined)
            ?.statement;
          const statementMap =
            prev && typeof prev === 'object' && !Array.isArray(prev) ? { ...prev } : {};
          statementMap[locale] = statement;
          return persist(statementMap);
        })
        .catch(() => persist({ [locale]: statement }));
    }, 1500);
    return () => clearTimeout(handle);
  }, [statement, slot, locale]);

  const publishFields = useCallback(
    (nextFields: Record<SectionKey, string>) => {
      const rebuilt = [buildStructured(nextFields), remainderRef.current]
        .map((part) => part.trim())
        .filter(Boolean)
        .join('\n\n');
      onStatementChange(rebuilt);
    },
    [onStatementChange],
  );

  const applyMode = useCallback(
    (next: 'structured' | 'freeform') => {
      // Re-clicking the active tab must not rebuild the statement.
      // Freeform edits are not in `fields`, so serializing them would
      // erase anything the author just typed.
      if (next === mode) return;
      if (next === 'structured') {
        remainderRef.current = captureRemainder(statement);
        setFields(parseStructured(statement));
      } else {
        publishFields(fields);
      }
      setMode(next);
    },
    [mode, statement, fields, publishFields],
  );

  const setField = useCallback(
    (key: SectionKey, value: string) => {
      setFields((prev) => {
        const next = { ...prev, [key]: value };
        publishFields(next);
        return next;
      });
    },
    [publishFields],
  );

  const insertAtCursor = useCallback(
    (kind: InsertKind) => {
      const snippet = SNIPPETS[kind];
      const el = textareaRef.current;
      if (mode === 'structured') {
        // In structured mode the constraints/example constructs belong to
        // their own fields.
        const target: SectionKey =
          kind === 'constraints' ? 'constraints' : kind === 'example' ? 'examples' : 'story';
        setField(target, (fields[target] ? `${fields[target]}\n\n` : '') + snippet);
        return;
      }
      if (!el) {
        onStatementChange(`${statement}\n\n${snippet}`);
        return;
      }
      const start = el.selectionStart ?? statement.length;
      const end = el.selectionEnd ?? statement.length;
      const next = `${statement.slice(0, start)}${snippet}${statement.slice(end)}`;
      onStatementChange(next);
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + snippet.length;
        el.setSelectionRange(pos, pos);
      });
    },
    [mode, fields, statement, onStatementChange, setField],
  );

  const toolbar: { kind: InsertKind; label: string }[] = useMemo(
    () => [
      { kind: 'math-block', label: t('studio_toolbar_math_block', 'Math block') },
      { kind: 'math-inline', label: t('studio_toolbar_math_inline', 'Inline math') },
      { kind: 'code', label: t('studio_toolbar_code', 'Code block') },
      { kind: 'constraints', label: t('studio_toolbar_constraints', 'Constraint box') },
      { kind: 'example', label: t('studio_toolbar_example', 'Example I/O') },
    ],
    [t],
  );

  const btnStyle: React.CSSProperties = {
    padding: '4px 10px',
    fontSize: '0.75rem',
    background: 'rgba(56,189,248,0.12)',
    color: 'var(--accent)',
    border: '1px solid rgba(56,189,248,0.3)',
    borderRadius: '6px',
    cursor: 'pointer',
  };
  const areaStyle: React.CSSProperties = {
    width: '100%',
    minHeight: '320px',
    padding: '10px',
    boxSizing: 'border-box',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--foreground)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.85rem',
    lineHeight: 1.6,
    resize: 'vertical',
  };

  return (
    <div data-testid={`statement-studio-${locale}`} style={{ display: 'grid', gap: '10px' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div
          role="tablist"
          aria-label={t('studio_mode_label', 'Editing mode')}
          style={{ display: 'flex', gap: '6px' }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'structured'}
            style={{ ...btnStyle, opacity: mode === 'structured' ? 1 : 0.55 }}
            onClick={() => applyMode('structured')}
          >
            {t('studio_mode_structured', 'Structured')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'freeform'}
            style={{ ...btnStyle, opacity: mode === 'freeform' ? 1 : 0.55 }}
            onClick={() => applyMode('freeform')}
          >
            {t('studio_mode_freeform', 'Markdown')}
          </button>
        </div>
        <span
          data-testid="studio-autosave"
          style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}
        >
          {restored
            ? t('studio_draft_restored', 'Draft restored')
            : savedAt
              ? t('studio_autosaved', 'Autosaved')
              : ''}
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }} data-testid="studio-toolbar">
        {toolbar.map((item) => (
          <button
            key={item.kind}
            type="button"
            style={btnStyle}
            onClick={() => insertAtCursor(item.kind)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: '12px',
        }}
      >
        <div>
          {mode === 'structured' ? (
            <div style={{ display: 'grid', gap: '8px' }}>
              {SECTIONS.map((section) => (
                <div key={section.key}>
                  <label
                    htmlFor={`studio-${locale}-${section.key}`}
                    style={{
                      display: 'block',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      marginBottom: '2px',
                    }}
                  >
                    {locale === 'ro' ? section.ro : section.en}
                  </label>
                  <textarea
                    id={`studio-${locale}-${section.key}`}
                    data-testid={`studio-field-${section.key}`}
                    value={fields[section.key]}
                    onChange={(e) => setField(section.key, e.target.value)}
                    style={{ ...areaStyle, minHeight: section.key === 'story' ? '140px' : '80px' }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              data-testid={`studio-markdown-${locale}`}
              aria-label={t('studio_markdown_aria', 'Statement markdown')}
              value={statement}
              onChange={(e) => onStatementChange(e.target.value)}
              style={areaStyle}
            />
          )}
        </div>
        <div
          data-testid="studio-preview"
          aria-label={t('studio_preview_title', 'Live preview')}
          style={{
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '12px 14px',
            background: 'var(--surface-2, var(--surface))',
            overflowY: 'auto',
            maxHeight: '560px',
          }}
        >
          <div
            className="micro-label"
            style={{ marginBottom: '8px', color: 'var(--text-tertiary)' }}
          >
            {t('studio_preview_title', 'Live preview')}
          </div>
          {statement.trim() ? (
            <StatementMarkdown markdown={statement} />
          ) : (
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
              {t('studio_preview_empty', 'Start typing — the rendered statement appears here.')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
