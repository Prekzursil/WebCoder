// Ported from frontend/webcoder_ui/src/pages/NotFoundPage.tsx (CRA reference) —
// the `*` catch-all route (App.tsx:46), mapped to the App Router's built-in
// not-found.tsx so unmatched URLs render a real 404.
//
// The CRA component accepted an optional `message` prop that overrode the
// heading; no call site ever passed it (the route rendered the component
// bare), so the prop is dropped here — the two i18n keys and the visual are
// preserved verbatim.

import { createTranslator, getLocale } from './_lib/public-i18n';

export default async function NotFoundPage() {
  const t = createTranslator(await getLocale());

  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      <h2>{t('not_found_default_header', '404 - Page Not Found')}</h2>
      <p>
        {t(
          'not_found_default_message',
          'The page you are looking for does not exist or you may not have permission to view it.'
        )}
      </p>
    </div>
  );
}
