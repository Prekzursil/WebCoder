// Ported from frontend/webcoder_ui/src/pages/problems/ProblemDetailPage.tsx
// (CRA reference) — route "/problems/:problemId" (App.tsx:38).
//
// SEO-critical public detail page: the read-only content (localized title,
// statement, limits, sample test cases) renders as a Server Component with
// generateMetadata; the interactive submit form (auth-gated, code editor,
// confirmation modal, submission POST) is a client island
// (SubmitSolutionForm.tsx).
//
// Data-contract note: the CRA page read `response.data` from
// ProblemService.getProblemDetail(); the DRF backend returns the problem
// object directly (backend/problems/views.py — ModelViewSet, ProblemDetailSerializer
// nests test_cases), so the port consumes it directly — docs/PORT-MAP.md §0.1.
//
// Security change (sanctioned by docs/PORT-MAP.md §0.5): the CRA page rendered
// the author-supplied statement via dangerouslySetInnerHTML with only a
// \n -> <br/> replacement (stored XSS surface). This port renders the
// statement as preformatted text, which preserves newlines without the
// \n-><br/> hack and cannot execute markup.
//
// The CRA "Problem not found." null-state maps to notFound(), so missing
// problems now answer HTTP 404 instead of 200-with-message.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createTranslator, getLocale, PublicLocale } from '../../_lib/public-i18n';
import { getProblemDetail } from '../_lib/problems-api';
import SubmitSolutionForm from './SubmitSolutionForm';
import { ProblemType } from '@/types';

interface ProblemDetailPageProps {
  params: Promise<{ problemId: string }>;
}

function localizedTitle(problem: ProblemType, locale: PublicLocale, fallback: string): string {
  return problem.title_i18n[locale] || problem.title_i18n.en || fallback;
}

export async function generateMetadata({
  params,
}: ProblemDetailPageProps): Promise<Metadata> {
  const { problemId } = await params;
  const locale = await getLocale();
  const t = createTranslator(locale);

  let problem: ProblemType | null = null;
  try {
    problem = await getProblemDetail(problemId);
  } catch {
    return { title: t('problem_not_found', 'Problem not found.') };
  }

  if (!problem) {
    return { title: t('problem_not_found', 'Problem not found.') };
  }

  const title = localizedTitle(
    problem,
    locale,
    `${t('problem_id_label', 'Problem ID')}: ${problem.id}`
  );
  const statement =
    problem.statement_i18n?.[locale] || problem.statement_i18n?.en || '';
  const description =
    statement.replace(/\s+/g, ' ').trim().slice(0, 160) ||
    t('solve_problem_description', 'Solve this problem on WebCoder.');

  return { title, description };
}

export default async function ProblemDetailPage({ params }: ProblemDetailPageProps) {
  const { problemId } = await params;
  const locale = await getLocale();
  const t = createTranslator(locale);

  let problem: ProblemType | null = null;
  try {
    problem = await getProblemDetail(problemId);
  } catch (err) {
    return (
      <div>
        <p style={{ color: 'red' }}>
          {err instanceof Error ? err.message : 'Failed to load problem.'}
        </p>
      </div>
    );
  }

  if (!problem) {
    notFound();
  }

  const problemTitle = localizedTitle(
    problem,
    locale,
    `${t('problem_id_label', 'Problem ID')}: ${problem.id}`
  );
  const problemStatement =
    problem.statement_i18n?.[locale] || problem.statement_i18n?.en || '';
  const sampleTestCases = problem.test_cases?.filter((tc) => tc.is_sample) || [];

  return (
    <div>
      <h2>{problemTitle}</h2>
      <p>
        <strong>{t('difficulty_label', 'Difficulty')}:</strong>{' '}
        {t(`difficulty_${problem.difficulty?.toLowerCase()}`, problem.difficulty)}
      </p>
      {problem.default_time_limit_ms && (
        <p>
          <strong>{t('time_limit_label', 'Time Limit')}:</strong>{' '}
          {problem.default_time_limit_ms} ms
        </p>
      )}
      {problem.default_memory_limit_kb && (
        <p>
          <strong>{t('memory_limit_label', 'Memory Limit')}:</strong>{' '}
          {problem.default_memory_limit_kb} KB
        </p>
      )}
      <h3>{t('problem_statement_header', 'Problem Statement')}</h3>
      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{problemStatement}</pre>
      {sampleTestCases.length > 0 && (
        <>
          <h3>{t('sample_test_cases_header', 'Sample Test Cases')}</h3>
          {sampleTestCases.map((tc, index) => (
            <div
              key={index}
              style={{ marginBottom: '10px', padding: '10px', border: '1px solid #eee' }}
            >
              <p>
                <strong>{t('sample_input_label', 'Sample Input')} {index + 1}:</strong>
              </p>
              <pre>{tc.input_data}</pre>
              <p>
                <strong>{t('sample_output_label', 'Sample Output')} {index + 1}:</strong>
              </p>
              <pre>{tc.expected_output_data}</pre>
            </div>
          ))}
        </>
      )}
      <hr style={{ margin: '20px 0' }} />
      <h3>{t('submit_solution_header', 'Submit Solution')}</h3>
      <SubmitSolutionForm
        problemId={problemId}
        allowedLanguages={problem.allowed_languages || []}
        problemTitle={problemTitle}
      />
    </div>
  );
}
