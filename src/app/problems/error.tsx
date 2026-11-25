'use client';

// App Router error boundary for the public problems routes — replaces the CRA
// pages' red `<p>{error}</p>` returns (ProblemsListPage.tsx:33,
// ProblemDetailPage.tsx:92). Priority order matches the CRA catch blocks:
// the API error message first, translated fallback second. The reset button
// is the App Router addition (retries the failed server render).

import { useTranslation } from 'react-i18next';

interface ProblemsErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ProblemsError({ error, reset }: ProblemsErrorProps) {
  const { t } = useTranslation();

  return (
    <div>
      <p style={{ color: 'red' }}>
        {error.message || t('error_loading_problems', 'Failed to load problems.')}
      </p>
      <button
        type="button"
        onClick={reset}
        style={{ marginTop: '10px', padding: '10px 15px', cursor: 'pointer' }}
      >
        {t('try_again_button', 'Try Again')}
      </button>
    </div>
  );
}
