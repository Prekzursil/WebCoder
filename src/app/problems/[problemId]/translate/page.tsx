// Community-translation propose form (i18n wave, owner rule (c)).
//
// Server shell: loads the problem (EN is the mandatory authoring source)
// and hands the EN original to the client form, which offers every
// translatable language, submits to /api/v1/translations/proposals/ and
// explains the curation step (nothing is published until a VERIFIER/ADMIN
// approves — or, when the AI curator runs with AI_CURATOR_AUTO_APPROVE,
// it is still reviewed under the same atomic promotion).

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createTranslator, getLocale } from '@/app/_lib/public-i18n';
import { getProblemDetail } from '@/app/problems/_lib/problems-api';
import TranslateForm from './TranslateForm';

interface TranslatePageProps {
  params: Promise<{ problemId: string }>;
}

export async function generateMetadata({
  params,
}: TranslatePageProps): Promise<Metadata> {
  const { problemId } = await params;
  const t = createTranslator(await getLocale());
  return { title: `${t('translate_page_title', 'Translate this problem')} · #${problemId}` };
}

export default async function TranslateProblemPage({ params }: TranslatePageProps) {
  const { problemId } = await params;
  const t = createTranslator(await getLocale());

  let problem = null;
  try {
    problem = await getProblemDetail(problemId);
  } catch {
    problem = null;
  }
  if (!problem) {
    notFound();
  }

  return (
    <div className="page-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem', fontSize: '0.8rem', color: 'var(--muted)', flexWrap: 'wrap' }}>
        <Link href={`/problems/${problem.id}`} style={{ color: 'var(--accent)' }}>
          #{problem.id} · {problem.title_i18n.en}
        </Link>
        <span aria-hidden="true">›</span>
        <span>{t('translate_page_title', 'Translate this problem')}</span>
      </div>
      <TranslateForm
        problemId={problem.id}
        englishTitle={problem.title_i18n.en || ''}
        englishStatement={problem.statement_i18n?.en || ''}
        existingLanguages={Object.keys(problem.title_i18n)}
      />
    </div>
  );
}
