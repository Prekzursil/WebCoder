'use client';

// Client island of the problem detail page — ported from
// frontend/webcoder_ui/src/pages/problems/ProblemDetailPage.tsx:18-172
// (state, submit flow, and form rendering).
//
// Behavior parity with the CRA page, except where noted:
//   - language defaults to the first allowed language, or 'python3' when the
//     problem lists none (CRA :39-43);
//   - submission status/error reset whenever code or language changes (:25-28);
//   - empty code is blocked client-side before the modal opens (:84-87);
//   - the confirmation modal gates the actual POST (:55-80);
//   - unauthenticated visitors see a login prompt instead of the form
//     (:123, :159-164).
//
// [SPEC-GAPS F14] The success state is no longer a dead end: it links to the
// submission detail page and polls the verdict live until it resolves.
// [SPEC-GAPS A6-interim] Editor affordances without a new dependency: Tab
// inserts a 2-space indent (Tab no longer moves focus away mid-coding),
// Ctrl/Cmd+Enter submits from the textarea, per-language starter templates,
// and the editor is styled to the card language with the mono font token.
// (The full CodeMirror 6 editor remains A6 for a follow-up.)

import React, { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { SubmissionService } from '@/services/ApiService';
import { useAuth } from '@/context/AuthContext';
import ConfirmationModal from '@/components/common/ConfirmationModal';
import SubmissionStatusDisplay from '@/components/common/SubmissionStatusDisplay';
import CodeEditor from './CodeEditor';
import { palette, hexAlpha } from '@/theme/tokens';

// [wave D] Blockly requires the DOM — client-side only.
import dynamic from 'next/dynamic';
const BlockEditor = dynamic(() => import('@/components/blocks/BlockEditor'), {
  ssr: false,
});
// [wave D engine 2] The Scratch stack (scratch-vm/blocks/render) is
// browser-only and heavy — load it lazily, exactly like Blockly.
const ScratchEditor = dynamic(
  () => import('@/components/blocks/ScratchEditor'),
  { ssr: false, loading: () => null }
);
// [wave E] CodeMirror is client-side too.
const PartialCodeEditor = dynamic(
  () => import('@/components/code/PartialCodeEditor'),
  { ssr: false, loading: () => null }
);

export interface ProblemBlockConfig {
  /** Wave D engine 2: 'scratch' renders the Scratch editor and submits
   * the project JSON as language 'scratch' (the judge transpiles it to
   * Python — see docs/BLOCK-PROGRAMMING.md). */
  engine?: 'blockly' | 'scratch';
  generator?: 'python3' | 'nodejs20';
  toolbox?: string;
  starter?: string;
  /** Scratch engine: the starter sb3 project JSON. */
  scratch_project?: string;
  /** Scratch engine: the curated opcode allowlist (per-problem blocks). */
  scratch_blocks?: string[];
}

interface SubmitSolutionFormProps {
  problemId: string;
  allowedLanguages: string[];
  problemTitle: string;
  /** CON-1: set when arriving from a running contest (?contest=N) — the
   * backend gates (registered + window open) and the judge-contest lane
   * both key off the submission's contest. */
  contestId?: number | null;
  /** [wave D] present => block problem: the editor renders the block
   * engine's editor (Blockly with the problem's toolbox/starter, or the
   * Scratch project editor) and submits the generated/project source
   * through the normal judge pipeline. */
  blockConfig?: ProblemBlockConfig | null;
  /** [wave E] present => partial-code problem: the whole skeleton renders
   * with locked regions read-only; the submission is the FULL assembled
   * file (server verifies locked-region integrity). */
  codeTemplate?: string | null;
}

// [A6-interim] Minimal runnable starter per supported judge language
// (python3 / cpp17 / java11 — judge_utils/compilation.py).
const STARTER_TEMPLATES: Record<string, string> = {
  python3: 'def main():\n    pass\n\n\nif __name__ == "__main__":\n    main()\n',
  cpp17:
    '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(nullptr);\n    return 0;\n}\n',
  java11:
    'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        sc.close();\n    }\n}\n',
};

const TERMINAL_VERDICTS = new Set(['AC', 'WA', 'TLE', 'MLE', 'OLE', 'CE', 'RE', 'IE']);

export default function SubmitSolutionForm({
  problemId,
  allowedLanguages,
  problemTitle,
  contestId,
  blockConfig,
  codeTemplate,
}: SubmitSolutionFormProps) {
  const { t } = useTranslation();
  const auth = useAuth();
  const [code, setCode] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>(
    blockConfig?.engine === 'scratch'
      ? 'scratch'
      : blockConfig?.generator ||
          (allowedLanguages.length > 0 ? allowedLanguages[0] : 'python3')
  );
  const [submissionStatus, setSubmissionStatus] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  // [F14] live verdict tracking after a successful submit
  const [lastSubmissionId, setLastSubmissionId] = useState<number | null>(null);
  const [polledVerdict, setPolledVerdict] = useState<string | null>(null);

  useEffect(() => {
    setSubmissionStatus(null);
    setSubmissionError(null);
  }, [code, selectedLanguage]);

  // [F14] Poll the fresh submission until the judge resolves a verdict.
  useEffect(() => {
    if (lastSubmissionId == null || polledVerdict != null) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const detail = await SubmissionService.getSubmissionDetail(String(lastSubmissionId));
        if (cancelled) return;
        if (detail?.verdict && TERMINAL_VERDICTS.has(detail.verdict)) {
          setPolledVerdict(detail.verdict);
        }
      } catch {
        // Transient poll failure — the next tick retries; the View status
        // link remains as the authoritative escape hatch.
      }
    };
    void poll();
    const intervalId = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [lastSubmissionId, polledVerdict]);

  const handleActualSubmit = async () => {
    if (!auth.isAuthenticated || !problemId) {
      setSubmissionError(
        t('error_not_logged_in_or_no_problem', 'Authentication required to submit.')
      );
      setIsModalOpen(false);
      return;
    }
    if (!selectedLanguage) {
      setSubmissionError(t('error_select_language', 'Please select a language.'));
      setIsModalOpen(false);
      return;
    }
    setIsSubmitting(true);
    setIsModalOpen(false);
    setSubmissionStatus(t('submitting_status', 'Submitting...'));
    setSubmissionError(null);
    try {
      const response = await SubmissionService.createSubmission({
        problem: parseInt(problemId, 10),
        language: selectedLanguage,
        code,
        ...(contestId ? { contest: contestId } : {}),
      });
      setSubmissionStatus(
        t(
          'submission_successful_pending',
          'Solution submitted successfully! It is pending evaluation. (Submission ID: {{id}})',
          { id: response.id }
        )
      );
      setLastSubmissionId(response.id); // [F14]
      setPolledVerdict(null);
      setCode('');
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setSubmissionError(message || t('submission_failed_error', 'Submission failed.'));
      setSubmissionStatus(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitClick = (e?: FormEvent) => {
    e?.preventDefault();
    if (!code.trim()) {
      setSubmissionError(t('error_code_empty', 'Code cannot be empty.'));
      return;
    }
    setIsModalOpen(true);
  };

  const insertTemplate = () => {
    const tpl = STARTER_TEMPLATES[selectedLanguage];
    if (tpl) setCode(tpl);
  };

  const verdictColor = (verdict: string): string => {
    if (verdict === 'AC') return palette.success;
    if (verdict === 'PENDING' || verdict === 'COMPILING' || verdict === 'RUNNING') return palette.muted;
    return palette.danger;
  };

  if (!(auth.isAuthenticated && problemId)) {
    return (
      <p>
        {t('please_login_to_submit_1', 'Please ')}
        <Link href="/login">{t('please_login_to_submit_2', 'login')}</Link>
        {t('please_login_to_submit_3', ' to submit a solution.')}
      </p>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmitClick}>
        {blockConfig?.engine === 'scratch' ? (
          <div style={{ marginBottom: '0.75rem' }}>
            <span className="micro-label">{t('sbx_solve_title', 'Solve with Scratch')}</span>
            <p style={{ margin: '4px 0 10px', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
              {t(
                'sbx_submit_hint',
                'Your Scratch project is translated to Python and judged like any other submission.',
              )}
            </p>
            <ScratchEditor
              projectJson={blockConfig.scratch_project}
              allowedOpcodes={blockConfig.scratch_blocks ?? null}
              onProjectChange={setCode}
              height={380}
            />
          </div>
        ) : blockConfig ? (
          <div style={{ marginBottom: '0.75rem' }}>
            <span className="micro-label">{t('blocks_solve_with_blocks', 'Solve with blocks')}</span>
            <p style={{ margin: '4px 0 10px', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
              {t('blocks_submit_hint', 'Your blocks generate {{language}} code and are judged like any other submission.', { language: blockConfig.generator === 'nodejs20' ? 'JavaScript' : 'Python' })}
            </p>
            <BlockEditor
              generator={blockConfig.generator}
              toolboxXml={blockConfig.toolbox}
              starterXml={blockConfig.starter}
              onCodeChange={setCode}
              height={380}
            />
          </div>
        ) : (
        <>
        <div style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="language-select">{t('language_label', 'Language')}:</label>
          <select
            id="language-select"
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            style={{ margin: '6px 0', padding: '8px 10px', width: '100%' }}
            disabled={allowedLanguages.length === 0}
          >
            <option value="" disabled>
              {t('select_language_placeholder', 'Select Language...')}
            </option>
            {allowedLanguages.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem',
              flexWrap: 'wrap',
            }}
          >
            <label htmlFor="code-editor">{t('code_editor_label', 'Code')}:</label>
            {STARTER_TEMPLATES[selectedLanguage] && (
              <button
                type="button"
                onClick={insertTemplate}
                className="btn"
                style={{ padding: '3px 10px', fontSize: '0.7rem', minHeight: '28px' }}
              >
                {t('insert_template_button', 'Insert {{language}} template', {
                  language: selectedLanguage,
                })}
              </button>
            )}
          </div>
          <div
            id="code-editor"
            data-testid="submit-code-editor"
            style={{
              marginTop: '6px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            {codeTemplate ? (
              <PartialCodeEditor
                template={codeTemplate}
                language={selectedLanguage}
                value={code}
                onChange={(value: string) => setCode(value)}
                ariaLabel={t('code_editor_label', 'Code')}
                height="420px"
              />
            ) : (
              <CodeEditor
                value={code}
                onChange={(value) => setCode(value)}
                language={selectedLanguage}
                onModEnter={handleSubmitClick}
                ariaLabel={t('code_editor_label', 'Code')}
                height="360px"
              />
            )}
          </div>
        </div>
        </>
        )}
        <SubmissionStatusDisplay status={submissionStatus} error={submissionError} />
        {/* [F14] success state: link out + live verdict */}
        {lastSubmissionId != null && (
          <div
            style={{
              marginTop: '12px',
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${hexAlpha(palette.accent, 0.25)}`,
              background: hexAlpha(palette.accent, 0.06),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                {t('verdict_label', 'Verdict')}:{' '}
                <span
                  style={{
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: polledVerdict ? verdictColor(polledVerdict) : 'var(--muted)',
                  }}
                >
                  {polledVerdict ?? t('polling_status', 'Polling for updates...')}
                </span>
              </div>
            </div>
            <Link href={`/submissions/${lastSubmissionId}`} className="btn btn--primary">
              {t('view_submission_button', 'View status')}
            </Link>
          </div>
        )}
        <button
          type="submit"
          className="btn btn--primary"
          style={{ marginTop: '12px', padding: '10px 18px', width: '100%' }}
          disabled={isSubmitting || !selectedLanguage || !code.trim()}
        >
          {isSubmitting
            ? t('submitting_button_text', 'Submitting...')
            : t('submit_button', 'Submit')}
        </button>
      </form>
      {/* Rendered OUTSIDE the form, as in the CRA page: the modal's buttons
          carry no explicit type, so nesting them in the form would make them
          implicit submit buttons and re-fire handleSubmitClick. */}
      <ConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleActualSubmit}
        title={t('confirm_submission_title', 'Confirm Submission')}
        message={t('confirm_submission_message', 'Submit solution in {{language}} to "{{problem}}"?', {
          language: selectedLanguage,
          problem: problemTitle,
        })}
      />
    </>
  );
}
