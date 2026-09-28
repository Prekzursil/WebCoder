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
//   - success message interpolates the new submission id and the editor is
//     cleared (:72-73). The CRA call passed NO default value to t() here, so
//     i18next rendered the raw key — fixed in the port with an explicit
//     default (docs/PORT-MAP.md §0.4/§8.6);
//   - unauthenticated visitors see a login prompt instead of the form
//     (:123, :159-164).

import React, { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { SubmissionService } from '@/services/ApiService';
import { useAuth } from '@/context/AuthContext';
import ConfirmationModal from '@/components/common/ConfirmationModal';
import SubmissionStatusDisplay from '@/components/common/SubmissionStatusDisplay';

interface SubmitSolutionFormProps {
  problemId: string;
  allowedLanguages: string[];
  problemTitle: string;
}

export default function SubmitSolutionForm({
  problemId,
  allowedLanguages,
  problemTitle,
}: SubmitSolutionFormProps) {
  const { t } = useTranslation();
  const auth = useAuth();
  const [code, setCode] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>(
    allowedLanguages.length > 0 ? allowedLanguages[0] : 'python3'
  );
  const [submissionStatus, setSubmissionStatus] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  useEffect(() => {
    setSubmissionStatus(null);
    setSubmissionError(null);
  }, [code, selectedLanguage]);

  const handleActualSubmit = async () => {
    if (!auth.token || !problemId) {
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
      });
      setSubmissionStatus(
        t(
          'submission_successful_pending',
          'Solution submitted successfully! It is pending evaluation. (Submission ID: {{id}})',
          { id: response.id }
        )
      );
      setCode('');
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setSubmissionError(message || t('submission_failed_error', 'Submission failed.'));
      setSubmissionStatus(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitClick = (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setSubmissionError(t('error_code_empty', 'Code cannot be empty.'));
      return;
    }
    setIsModalOpen(true);
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
        <div>
          <label htmlFor="language-select">{t('language_label', 'Language')}:</label>
          <select
            id="language-select"
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            style={{ margin: '10px', padding: '5px' }}
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
          <label htmlFor="code-editor">{t('code_editor_label', 'Code')}:</label>
          <textarea
            id="code-editor"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            rows={15}
            style={{
              width: '90%',
              fontFamily: 'monospace',
              fontSize: '14px',
              padding: '10px',
              border: '1px solid #ccc',
            }}
            placeholder={t('code_placeholder', 'Paste your code here...')}
            required
          />
        </div>
        <SubmissionStatusDisplay status={submissionStatus} error={submissionError} />
        <button
          type="submit"
          style={{ marginTop: '10px', padding: '10px 15px' }}
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
