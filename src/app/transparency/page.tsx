// [wave G item 150] The public transparency report page — aggregate
// platform data (users, content, activity, moderation + appeals) from
// GET /api/v1/public/transparency/. Server-rendered; the year-end
// markdown report snapshots the same endpoint.

import { getLocale } from '../_lib/public-i18n';
import { createTranslator } from '@/app/_lib/public-messages';
import { apiUrl } from '@/lib/api-config';

export const dynamic = 'force-dynamic';

interface TransparencyFeed {
  users: { total: number };
  content: { problems_by_status: Record<string, number> };
  activity: {
    submissions_total: number;
    submission_verdicts: Record<string, number>;
    contests_held: number;
    teacher_certificates: number;
  };
  moderation: {
    actions_by_kind: Record<string, number>;
    appeals_by_outcome: Record<string, number>;
  };
}

async function getFeed(): Promise<TransparencyFeed | null> {
  const cacheOpts = process.env.E2E_API_BASE
    ? ({ cache: 'no-store' } as RequestInit)
    : ({ next: { revalidate: 300 } } as RequestInit);
  try {
    const response = await fetch(apiUrl('/public/transparency/'), cacheOpts);
    if (!response.ok) return null;
    return (await response.json()) as TransparencyFeed;
  } catch {
    return null;
  }
}

function Row({ label, value }: { label: string; value: number | string }) {
  return (
    <p>
      {label}: <strong>{value}</strong>
    </p>
  );
}

export default async function TransparencyPage() {
  const locale = await getLocale();
  const t = createTranslator(locale);
  const feed = await getFeed();

  return (
    <div className="page-container" data-testid="transparency-page">
      <h1 style={{ fontSize: '1.75rem', color: 'var(--foreground)' }}>
        {t('transparency_title', 'Transparency report')}
      </h1>
      <p>
        {t(
          'transparency_intro',
          'Live aggregate numbers about the platform — the same data layer feeds the annual report.',
        )}
      </p>

      {!feed ? (
        <p role="status" data-testid="transparency-unavailable">
          {t('transparency_unavailable', 'The transparency feed is unavailable right now.')}
        </p>
      ) : (
        <>
          <section data-testid="transparency-activity" style={{ marginTop: '1rem' }}>
            <h2>{t('transparency_activity_header', 'Activity')}</h2>
            <Row label={t('transparency_users', 'Registered users')} value={feed.users.total} />
            <Row
              label={t('transparency_submissions', 'Submissions judged')}
              value={feed.activity.submissions_total}
            />
            <Row
              label={t('transparency_contests', 'Contests held')}
              value={feed.activity.contests_held}
            />
            <Row
              label={t('transparency_teacher_certs', 'Certified teachers')}
              value={feed.activity.teacher_certificates}
            />
          </section>

          <section data-testid="transparency-content" style={{ marginTop: '1rem' }}>
            <h2>{t('transparency_content_header', 'Content')}</h2>
            {Object.entries(feed.content.problems_by_status).map(([status, count]) => (
              <Row key={status} label={status} value={count} />
            ))}
          </section>

          <section data-testid="transparency-moderation" style={{ marginTop: '1rem' }}>
            <h2>{t('transparency_moderation_header', 'Moderation & appeals')}</h2>
            {Object.entries(feed.moderation.actions_by_kind).map(([kind, count]) => (
              <Row key={kind} label={kind} value={count} />
            ))}
            {Object.entries(feed.moderation.appeals_by_outcome).map(([outcome, count]) => (
              <Row
                key={outcome}
                label={`${t('transparency_appeals', 'appeals')}: ${outcome}`}
                value={count}
              />
            ))}
            <p style={{ color: 'var(--muted)' }}>
              {t(
                'transparency_moderation_note',
                'Aggregate counts only — no usernames, ever. Appeals outcomes document every moderator decision audited by the appeal flow.',
              )}
            </p>
          </section>
        </>
      )}
    </div>
  );
}
