// [wave G item 148] The teacher-certification exam page: fetch the
// active question bank, answer, submit; ≥ 80% issues the TEACHER
// atestat (visible on /certificates + the public verification page).

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '@/services/ApiService';

interface Question {
  id: number;
  question: string;
  choices: string[];
}

interface ExamResult {
  correct: number;
  total: number;
  score: number;
  passed: boolean;
  certificate_uuid: string | null;
}

export default function TeacherCertificationPage() {
  const { t } = useTranslation();
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<ExamResult | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    apiFetch<{ pass_threshold: number; questions: Question[] }>('/certificates/teacher-exam/')
      .then((data) => setQuestions(data.questions))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'error'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    setError('');
    try {
      const payload: Record<string, number> = {};
      Object.entries(answers).forEach(([id, choice]) => {
        payload[id] = choice;
      });
      const data: ExamResult = await apiFetch<ExamResult>('/certificates/teacher-exam/', {
        method: 'POST',
        body: JSON.stringify({ answers: payload }),
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    }
  };

  return (
    <div className="page-container" data-testid="teacher-cert-page">
      <h1 style={{ fontSize: '1.75rem', color: 'var(--foreground)' }}>
        {t('tcert_title', 'Teacher certification')}
      </h1>
      <p>
        {t(
          'tcert_intro',
          'A 10-question exam over the classroom tooling and platform policies. Pass at 80% to earn the certified-teacher atestat.',
        )}
      </p>

      {error && (
        <p role="alert" style={{ color: 'var(--danger)' }} data-testid="tcert-error">
          {error}
        </p>
      )}

      {result ? (
        <div data-testid="tcert-result">
          <p>
            {t('tcert_score', 'Score')}: {result.correct}/{result.total} (
            {Math.round(result.score * 100)}%)
          </p>
          <p role="status">
            {result.passed
              ? t('tcert_passed', 'Passed — your certified-teacher atestat is on /certificates.')
              : t('tcert_failed', 'Not passed — review the classroom docs and try again.')}
          </p>
          <button
            className="btn"
            type="button"
            onClick={() => {
              setResult(null);
              setAnswers({});
              load();
            }}
          >
            {t('tcert_retry', 'Retry')}
          </button>
        </div>
      ) : questions ? (
        <div data-testid="tcert-questions" style={{ display: 'grid', gap: '1rem' }}>
          {questions.map((question, index) => (
            <fieldset key={question.id} data-testid={`tcert-q-${question.id}`}>
              <legend>
                {index + 1}. {question.question}
              </legend>
              {question.choices.map((choice, choiceIndex) => (
                <label key={choiceIndex} style={{ display: 'block' }}>
                  <input
                    type="radio"
                    name={`q-${question.id}`}
                    checked={answers[question.id] === choiceIndex}
                    onChange={() => setAnswers((prev) => ({ ...prev, [question.id]: choiceIndex }))}
                  />
                  {choice}
                </label>
              ))}
            </fieldset>
          ))}
          <button
            className="btn btn--primary"
            type="button"
            onClick={submit}
            disabled={Object.keys(answers).length < questions.length}
            data-testid="tcert-submit"
          >
            {t('tcert_submit', 'Submit answers')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
