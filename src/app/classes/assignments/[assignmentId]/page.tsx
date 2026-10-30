'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ClassroomService } from '@/services/ApiService';
import { useAuth } from '@/context/AuthContext';
import {
    AssignmentGrid,
    ClassroomAssignment,
    DeliverableRow,
    QuizSheet,
    QuizSubmitResult,
} from '@/types/api';
import { palette } from '@/theme/tokens';
import EmptyState from '@/components/common/EmptyState';
import SolutionsDiffPanel from './SolutionsDiffPanel';
import PageHeader from '@/components/common/PageHeader';

/** Temă detail: students see the problem set + their own best scores
 * (EDU-2/EDU-3); the owning teacher additionally gets the EDU-5 progress
 * grid and the EDU-6 CSV gradebook export. */
export default function AssignmentDetailPage() {
    const params = useParams<{ assignmentId: string }>();
    const assignmentId = params?.assignmentId;
    const { t, i18n } = useTranslation();
    const auth = useAuth();
    const lang = i18n.language === 'ro' ? 'ro' : 'en';

    const [assignment, setAssignment] = useState<ClassroomAssignment | null>(null);
    const [grid, setGrid] = useState<AssignmentGrid | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [sheet, setSheet] = useState<QuizSheet | null>(null);
    const [answers, setAnswers] = useState<Record<string, number>>({});
    const [quizResult, setQuizResult] = useState<QuizSubmitResult | null>(null);
    const [quizError, setQuizError] = useState<string | null>(null);
    const [deliverables, setDeliverables] = useState<DeliverableRow[] | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!assignmentId) return;
        try {
            const a = await ClassroomService.getAssignment(assignmentId);
            setAssignment(a);
            // The grid is teacher-only; students 403 → that's fine.
            try {
                const g = await ClassroomService.getGrid(assignmentId);
                setGrid(g);
            } catch {
                setGrid(null);
            }
            if (a.kind === 'QUIZ') {
                try {
                    setSheet(await ClassroomService.getQuizSheet(assignmentId));
                } catch {
                    setSheet(null);
                }
            }
            if (a.kind === 'FILES') {
                try {
                    const rows = await ClassroomService.getDeliverables(assignmentId);
                    setDeliverables(rows.results);
                } catch {
                    setDeliverables([]);
                }
            }
        } catch (err) {
            setError(
                err instanceof Error && err.message
                    ? err.message
                    : t('assignment_load_error', 'Failed to load the assignment.')
            );
        }
    }, [assignmentId, t]);

    useEffect(() => {
        if (auth.isAuthenticated) load();
    }, [auth.isAuthenticated, load]);

    const submitQuiz = async () => {
        if (!assignmentId) return;
        setQuizError(null);
        try {
            setQuizResult(await ClassroomService.submitQuiz(assignmentId, answers));
        } catch (err) {
            setQuizError(err instanceof Error ? err.message : String(err));
        }
    };

    const uploadFile = async (file: File | undefined) => {
        if (!assignmentId || !file) return;
        setUploadError(null);
        try {
            await ClassroomService.uploadDeliverable(assignmentId, file);
            const rows = await ClassroomService.getDeliverables(assignmentId);
            setDeliverables(rows.results);
        } catch (err) {
            setUploadError(err instanceof Error ? err.message : String(err));
        }
    };

    if (!auth.isAuthenticated) {
        return (
            <main style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>
                <EmptyState
                    title={t('classes_login_required', 'Log in to see your classes')}
                    action={
                        <Link href="/login" style={{ color: palette.accent, fontWeight: 600 }}>
                            {t('nav_login', 'Login')}
                        </Link>
                    }
                />
            </main>
        );
    }

    if (error || !assignment) {
        return (
            <main style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>
                <div role="alert" style={{ color: palette.danger }}>
                    {error ?? t('assignment_not_found', 'Assignment not found.')}
                </div>
                <Link href="/classes" style={{ color: palette.accent }}>
                    ← {t('classes_back', 'Back to classes')}
                </Link>
            </main>
        );
    }

    const title = String(assignment.title_i18n[lang] ?? assignment.title_i18n.en ?? '');
    const isTeacherView = grid !== null;

    return (
        <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
            <PageHeader
                title={title}
                subtitle={`${assignment.classroom_name} · ${new Date(
                    assignment.available_from
                ).toLocaleString()} → ${new Date(assignment.due_at).toLocaleString()}`}
            />

            {assignment.description && (
                <p style={{ color: palette.body, whiteSpace: 'pre-wrap', marginBottom: 16 }}>
                    {assignment.description}
                </p>
            )}

            {assignment.kind === 'QUIZ' && sheet && (
                <section
                    aria-label={t('assignment_quiz', 'Quiz')}
                    data-testid="quiz-section"
                    style={{ marginBottom: 20 }}
                >
                    <h2 style={{ fontSize: '1.1rem' }}>
                        {t('assignment_quiz', 'Quiz')}
                        {sheet.state === 'OPEN' ? '' : ' · ' + t('assignment_quiz_closed', 'closed')}
                    </h2>
                    {sheet.items.map((entry, index) => {
                        const variants =
                            lang === 'ro' && entry.variants_ro.length
                                ? entry.variants_ro
                                : entry.variants_en;
                        const question = String(
                            entry.question_i18n[lang] ?? entry.question_i18n.en ?? ''
                        );
                        return (
                            <fieldset
                                key={entry.item_id}
                                style={{
                                    border: `1px solid ${palette.border}`,
                                    borderRadius: 8,
                                    padding: '10px 14px',
                                    marginBottom: 12,
                                }}
                            >
                                <legend style={{ fontWeight: 600, padding: '0 6px' }}>
                                    {index + 1}. {question}
                                </legend>
                                {variants.map((variant, choiceIndex) => (
                                    <label
                                        key={choiceIndex}
                                        style={{ display: 'block', padding: '4px 0' }}
                                    >
                                        <input
                                            type="radio"
                                            name={`item-${entry.item_id}`}
                                            checked={
                                                answers[String(entry.item_id)] === choiceIndex
                                            }
                                            onChange={() =>
                                                setAnswers((prev) => ({
                                                    ...prev,
                                                    [String(entry.item_id)]: choiceIndex,
                                                }))
                                            }
                                            style={{ marginRight: 8 }}
                                        />
                                        {variant}
                                    </label>
                                ))}
                            </fieldset>
                        );
                    })}
                    {sheet.state === 'OPEN' && !isTeacherView && (
                        <button
                            type="button"
                            onClick={submitQuiz}
                            data-testid="quiz-submit"
                            style={{ padding: '8px 18px' }}
                        >
                            {t('assignment_quiz_submit', 'Submit answers')}
                        </button>
                    )}
                    {quizError && (
                        <p role="alert" style={{ color: palette.danger }}>
                            {quizError}
                        </p>
                    )}
                    {quizResult && (
                        <p data-testid="quiz-result" style={{ color: palette.success }}>
                            {t('assignment_quiz_score', 'Score')}:{' '}
                            {Math.round(quizResult.score * 100)}% (
                            {quizResult.correct_count}/{quizResult.total_count})
                        </p>
                    )}
                </section>
            )}

            {assignment.kind === 'FILES' && (
                <section
                    aria-label={t('assignment_files', 'Files')}
                    data-testid="files-section"
                    style={{ marginBottom: 20 }}
                >
                    <h2 style={{ fontSize: '1.1rem' }}>
                        {t('assignment_files', 'Files')}
                        {assignment.file_extensions
                            ? ` (${assignment.file_extensions}, ≤ ${assignment.max_file_mb} MB)`
                            : ''}
                    </h2>
                    {!isTeacherView && assignment.state === 'OPEN' && (
                        <input
                            type="file"
                            aria-label={t('assignment_upload', 'Upload')}
                            onChange={(event) => uploadFile(event.target.files?.[0])}
                        />
                    )}
                    {uploadError && (
                        <p role="alert" style={{ color: palette.danger }}>
                            {uploadError}
                        </p>
                    )}
                    {(deliverables ?? []).length === 0 ? (
                        <p style={{ color: palette.muted }}>
                            {t('assignment_no_files', 'No files uploaded yet.')}
                        </p>
                    ) : (
                        <ul>
                            {(deliverables ?? []).map((row) => (
                                <li key={row.id}>
                                    {row.student.username} — {row.original_filename}
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}

            {assignment.kind === 'PROBLEMS' && (
            <section aria-label={t('assignment_problems', 'Problems')} style={{ marginBottom: 20 }}>
                <h2 style={{ fontSize: '1.1rem' }}>{t('assignment_problems', 'Problems')}</h2>
                {(assignment.assignment_problems ?? []).length === 0 ? (
                    <EmptyState
                        title={t('assignment_no_problems', 'No problems in this temă')}
                    />
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', color: palette.muted }}>
                                <th style={{ padding: 8 }}>#</th>
                                <th>{t('contest_problem', 'Problem')}</th>
                                <th>{t('contest_points', 'Points')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(assignment.assignment_problems ?? []).map((ap) => (
                                <tr key={ap.id} style={{ borderTop: `1px solid ${palette.border}` }}>
                                    <td style={{ padding: 8, fontWeight: 700 }}>{ap.label}</td>
                                    <td style={{ padding: 8 }}>
                                        <Link
                                            href={`/problems/${ap.problem}`}
                                            style={{ color: palette.accent }}
                                        >
                                            {String(ap.problem_title[lang] ?? ap.problem_title.en ?? '')}
                                        </Link>
                                    </td>
                                    <td style={{ padding: 8 }}>{ap.points}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>
            )}

            {isTeacherView && (
                <SolutionsDiffPanel assignmentId={Number(assignmentId)} />
            )}
            {isTeacherView && grid && (
                <section aria-label={t('assignment_grid', 'Progress grid')}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                        <h2 style={{ fontSize: '1.1rem' }}>
                            {t('assignment_grid', 'Progress grid')}
                        </h2>
                        {/* EDU-6: CSV gradebook — the auth cookie rides the
                            navigation, so a plain link downloads the file. */}
                        <a
                            href={`/classroom/assignments/${assignment.id}/export`}
                            data-testid="gradebook-csv"
                            style={{ color: palette.accent, fontWeight: 600 }}
                        >
                            {t('assignment_export_csv', '⬇ Export grades (CSV)')}
                        </a>
                    </div>
                    {grid.students.length === 0 || grid.problems.length === 0 ? (
                        <EmptyState
                            title={t('assignment_grid_empty', 'Nothing to grade yet')}
                            description={t(
                                'assignment_grid_empty_hint',
                                'The grid fills as students submit inside the temă window.'
                            )}
                        />
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table
                                style={{ minWidth: 560, width: '100%', borderCollapse: 'collapse' }}
                            >
                                <thead>
                                    <tr style={{ textAlign: 'left', color: palette.muted }}>
                                        <th style={{ padding: 8 }}>{t('contest_participant', 'Participant')}</th>
                                        {grid.problems.map((p) => (
                                            <th key={p.id} style={{ padding: 8 }}>
                                                {p.label}{' '}
                                                <span style={{ opacity: 0.7 }}>({p.points}p)</span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {grid.students.map((student) => (
                                        <tr
                                            key={student.id}
                                            style={{ borderTop: `1px solid ${palette.border}` }}
                                            data-testid={`grid-row-${student.username}`}
                                        >
                                            <td style={{ padding: 8, fontWeight: 600 }}>
                                                {student.username}
                                            </td>
                                            {grid.problems.map((p) => {
                                                const cell = grid.cells[`${student.id}:${p.problem_id}`];
                                                return (
                                                    <td
                                                        key={p.id}
                                                        style={{
                                                            padding: 8,
                                                            color:
                                                                cell && cell.best_score >= p.points
                                                                    ? palette.success
                                                                    : 'inherit',
                                                        }}
                                                        title={
                                                            cell
                                                                ? t('contest_attempts', '{{count}} attempts', {
                                                                      count: cell.attempts,
                                                                  }) +
                                                                  (cell.late
                                                                      ? ` · ${t('assignment_late', 'late')}`
                                                                      : '')
                                                                : undefined
                                                        }
                                                    >
                                                        {cell
                                                            ? `${cell.best_score}${
                                                                  cell.late ? ' ⏰' : ''
                                                              }`
                                                            : '—'}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            )}
        </main>
    );
}
