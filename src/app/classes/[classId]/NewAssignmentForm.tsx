'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClassroomService } from '@/services/ApiService';
import { palette } from '@/theme/tokens';

/**
 * EDU-2 — the teacher's temă authoring form (the increment the classroom
 * API always backed but no UI exposed). v1 scope: PROBLEMS-kind teme —
 * a title, the publish window (available → due, optional late-until with
 * the pbinfo soft-expiry semantic) and an ordered "problem id : points"
 * list. Quiz/file teme stay API-authored (their authoring surfaces are
 * the MCQ bank / file policies — documented remainder).
 */
export default function NewAssignmentForm({
    classroomId,
    onCreated,
}: {
    classroomId: number;
    onCreated: () => void;
}) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState('');
    const [availableFrom, setAvailableFrom] = useState('');
    const [dueAt, setDueAt] = useState('');
    const [lateUntil, setLateUntil] = useState('');
    const [problemsText, setProblemsText] = useState('');
    const [isExam, setIsExam] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        // "problem-id : points" lines — forgiving about whitespace.
        const problems: { problem: number; points: number }[] = [];
        for (const line of problemsText.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const [idPart, pointsPart] = trimmed.split(':').map((x) => x.trim());
            const id = Number(idPart);
            if (!Number.isFinite(id) || id <= 0) {
                setError(t('tema_error_problem', 'Problem list must be "id: points" lines (points optional).'));
                return;
            }
            const points = pointsPart ? Number(pointsPart) : 100;
            problems.push({ problem: id, points });
        }
        if (!title.trim() || !availableFrom || !dueAt || problems.length === 0) {
            setError(t('tema_error_fields', 'Title, window and at least one problem are required.'));
            return;
        }
        setBusy(true);
        try {
            await ClassroomService.createAssignment({
                classroom: classroomId,
                title_i18n: { en: title.trim(), ro: title.trim() },
                kind: 'PROBLEMS',
                available_from: new Date(availableFrom).toISOString(),
                due_at: new Date(dueAt).toISOString(),
                ...(lateUntil ? { late_until: new Date(lateUntil).toISOString() } : {}),
                is_exam: isExam,
                problems,
            });
            setTitle('');
            setProblemsText('');
            setLateUntil('');
            setIsExam(false);
            setOpen(false);
            onCreated();
        } catch (err) {
            setError(
                err instanceof Error && err.message
                    ? err.message
                    : t('tema_error_save', 'Could not create the temă.')
            );
        } finally {
            setBusy(false);
        }
    };

    const inputStyle: React.CSSProperties = {
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        color: 'var(--foreground)',
        padding: '8px',
        width: '100%',
    };

    return (
        <section aria-label={t('tema_new', 'New temă')} data-testid="new-assignment">
            {!open ? (
                <button type="button" onClick={() => setOpen(true)} data-testid="new-assignment-open">
                    + {t('tema_new', 'New temă')}
                </button>
            ) : (
                <form
                    onSubmit={submit}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                        border: `1px solid ${palette.border}`,
                        borderRadius: '10px',
                        padding: '1rem',
                        maxWidth: 560,
                    }}
                >
                    <label style={{ fontSize: '0.85rem', color: palette.muted }}>
                        {t('tema_title', 'Title')}
                        <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} data-testid="tema-title" />
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <label style={{ fontSize: '0.85rem', color: palette.muted }}>
                            {t('tema_available', 'Available from')}
                            <input type="datetime-local" value={availableFrom} onChange={(e) => setAvailableFrom(e.target.value)} style={inputStyle} />
                        </label>
                        <label style={{ fontSize: '0.85rem', color: palette.muted }}>
                            {t('tema_due', 'Due at')}
                            <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} style={inputStyle} />
                        </label>
                    </div>
                    <label style={{ fontSize: '0.85rem', color: palette.muted }}>
                        {t('tema_late', 'Late until (optional — late work counts, flagged late)')}
                        <input type="datetime-local" value={lateUntil} onChange={(e) => setLateUntil(e.target.value)} style={inputStyle} />
                    </label>
                    <label style={{ fontSize: '0.85rem', color: palette.muted }}>
                        {t('tema_problems', 'Problems — one "id: points" per line')}
                        <textarea
                            value={problemsText}
                            onChange={(e) => setProblemsText(e.target.value)}
                            rows={4}
                            style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                            placeholder={'12: 30\n13: 70'}
                            data-testid="tema-problems"
                        />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: palette.muted }}>
                        <input type="checkbox" checked={isExam} onChange={(e) => setIsExam(e.target.checked)} />
                        {t('tema_exam', 'Exam mode (site lockdown while the temă runs)')}
                    </label>
                    {error && (
                        <p role="alert" style={{ color: palette.danger, fontSize: '0.85rem', margin: 0 }}>
                            {error}
                        </p>
                    )}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button type="submit" disabled={busy} data-testid="tema-submit">
                            {busy ? t('tema_saving', 'Saving…') : t('tema_create', 'Create temă')}
                        </button>
                        <button type="button" onClick={() => setOpen(false)}>
                            {t('cancel', 'Cancel')}
                        </button>
                    </div>
                </form>
            )}
        </section>
    );
}
