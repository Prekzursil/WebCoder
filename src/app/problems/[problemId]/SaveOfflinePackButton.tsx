'use client';

// [Wave G item 92] Save the offline statement pack: fetches the
// self-contained HTML (statement + samples + hints, both locales) and
// downloads it as a file — the study-anywhere copy. The fetch itself
// lands in the service worker's page cache (network-first HTML), so the
// pack is also readable offline from the PWA.

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StudyAidService } from '@/services/ApiService';
import CloudDownloadOutlinedIcon from '@mui/icons-material/CloudDownloadOutlined';

export default function SaveOfflinePackButton({
  problemId,
  title,
}: {
  problemId: string;
  title: string;
}): ReactNode {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const lang = (i18n.language ?? 'en').startsWith('ro') ? 'ro' : 'en';
      const pack = await StudyAidService.getStatementPack(problemId, lang);
      const blob = new Blob([pack.html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      const safe = title.replace(/[^\w-]+/g, '-').slice(0, 40) || 'problem';
      anchor.download = `webcoder-${safe}-${pack.lang}.html`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError(t('offline_pack_failed', 'Could not build the offline pack.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span>
      <button
        type="button"
        className="btn"
        onClick={save}
        disabled={busy}
        data-testid="save-offline-pack"
        style={{ fontSize: '0.8rem' }}
      >
        <CloudDownloadOutlinedIcon fontSize="small" />
        <span style={{ marginLeft: 4 }}>
          {busy ? t('offline_pack_building', 'Building…') : t('offline_pack_save', 'Offline pack')}
        </span>
      </button>
      {error && (
        <span role="alert" style={{ color: 'var(--danger)', fontSize: '0.75rem', marginLeft: 8 }}>
          {error}
        </span>
      )}
    </span>
  );
}
