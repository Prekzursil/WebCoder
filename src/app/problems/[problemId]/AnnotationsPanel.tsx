'use client';

// [Wave G item 78] Statement annotations: the reader's private notes on a
// problem. Selecting text in the statement arms the "Annotate selection"
// button (the quote anchors the note); notes list below with delete.
// Everything is auth-scoped and invisible to other users.

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { StudyAidService } from '@/services/ApiService';
import NotesOutlinedIcon from '@mui/icons-material/NotesOutlined';

interface AnnotationRow {
  id: number;
  quote: string;
  note: string;
  updated_at: string;
}

export default function AnnotationsPanel({ problemId }: { problemId: string }): ReactNode {
  const { t } = useTranslation();
  const auth = useAuth();
  const [rows, setRows] = useState<AnnotationRow[]>([]);
  const [quote, setQuote] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.isAuthenticated) return;
    StudyAidService.listAnnotations(problemId)
      .then(setRows)
      .catch(() => setRows([]));
  }, [auth.isAuthenticated, problemId]);

  if (!auth.isAuthenticated) return null;

  // Capture the current text selection inside the statement column.
  const captureSelection = () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? '';
    setQuote(text.slice(0, 500));
  };

  const submit = async () => {
    if (busy || !quote.trim() || !note.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await StudyAidService.addAnnotation(problemId, quote.trim(), note.trim());
      setRows((current) => [created, ...current]);
      setQuote('');
      setNote('');
    } catch {
      setError(t('annotations_save_failed', 'Could not save the annotation.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await StudyAidService.deleteAnnotation(problemId, id);
      setRows((current) => current.filter((row) => row.id !== id));
    } catch {
      setError(t('annotations_delete_failed', 'Could not delete the annotation.'));
    }
  };

  return (
    <div className="card" style={{ marginTop: '1.5rem' }} data-testid="annotations-panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
        <span style={{ color: 'var(--violet)', display: 'inline-flex' }} aria-hidden="true">
          <NotesOutlinedIcon fontSize="small" />
        </span>
        <strong style={{ color: 'var(--foreground)', fontSize: '0.95rem' }}>
          {t('annotations_title', 'My notes (private)')}
        </strong>
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
        {t(
          'annotations_hint',
          'Select a phrase in the statement, press “Capture selection”, and keep your own note on it. Only you see these.',
        )}
      </p>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '0.5rem' }}>
        <button type="button" className="btn" onClick={captureSelection}>
          {t('annotations_capture', 'Capture selection')}
        </button>
        {quote && (
          <em
            style={{
              color: 'var(--body)',
              fontSize: '0.8rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '60%',
            }}
            title={quote}
          >
            “{quote}”
          </em>
        )}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder={t('annotations_note_placeholder', 'Your note…')}
        aria-label={t('annotations_note_placeholder', 'Your note…')}
        style={{ width: '100%', marginBottom: '0.5rem' }}
      />
      <button
        type="button"
        className="btn btn--primary"
        onClick={submit}
        disabled={busy || !quote.trim() || !note.trim()}
      >
        {t('annotations_add', 'Add note')}
      </button>
      {error && (
        <p role="alert" style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
          {error}
        </p>
      )}
      {rows.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, marginTop: '1rem' }}>
          {rows.map((row) => (
            <li
              key={row.id}
              style={{
                borderTop: '1px solid var(--border)',
                paddingTop: '0.75rem',
                marginTop: '0.75rem',
              }}
            >
              <blockquote
                style={{
                  borderInlineStart: '3px solid var(--violet)',
                  margin: '0 0 6px',
                  paddingInlineStart: '10px',
                  color: 'var(--muted)',
                  fontSize: '0.8rem',
                }}
              >
                “{row.quote}”
              </blockquote>
              <p style={{ color: 'var(--body)', fontSize: '0.875rem', margin: 0 }}>{row.note}</p>
              <button
                type="button"
                className="btn btn--danger"
                style={{ marginTop: '6px', fontSize: '0.7rem' }}
                onClick={() => remove(row.id)}
              >
                {t('annotations_delete', 'Delete')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
