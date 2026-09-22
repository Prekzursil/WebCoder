'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import ProtectedRoute from '@/components/common/ProtectedRoute';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { ProblemService } from '@/services/ApiService';
import { useAuth } from '@/context/AuthContext';
import { ProblemType } from '@/types';

// Ported from frontend/webcoder_ui/src/pages/problems/MyCreatedProblemsPage.tsx (CRA reference).
//
// Next.js adaptations:
// - react-router <Link> -> next/link.
// - The CRA App.tsx routing-table guard (App.tsx:41, roles
//   [ADMIN, PROBLEM_CREATOR, PROBLEM_VERIFIER]) is applied here via the
//   scaffold ProtectedRoute.
// - ApiService responses are consumed directly: the scaffold's ApiService
//   returns the parsed payload (no {data: ...} envelope), dropping the CRA
//   `response.data` access (PORT-MAP §0.1 normalization).
// - The CRA `!auth.isAuthenticated -> "Please login..."` render branch is
//   dropped as structurally dead: initial loading=true means it can only be
//   reached after the effect ran, and every effect path that clears loading
//   with isAuthenticated falsy first sets the error (which renders instead);
//   a mid-session flip to unauthenticated always nulls user too, which the
//   ProtectedRoute guard turns into a null render + redirect.

const AUTHORING_ROLES = ['ADMIN', 'PROBLEM_CREATOR', 'PROBLEM_VERIFIER'];

// Named export for direct unit testing (the default export is the guarded route).
export function MyCreatedProblemsPage() {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const [myProblems, setMyProblems] = useState<ProblemType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (auth.isAuthenticated && auth.user?.id && auth.token) {
      setLoading(true);
      ProblemService.getProblems({ authorId: auth.user.id })
        .then((problems: ProblemType[]) => {
          setMyProblems(problems);
          setError(null);
          setLoading(false);
        })
        .catch((err: { message?: string }) => {
          setError(err.message || t('error_loading_my_problems', 'Failed to load your problems.'));
          setLoading(false);
        });
    } else if (!auth.isAuthenticated) {
      setError(t('error_auth_required', 'Authentication required.'));
      setLoading(false);
    }
  }, [auth.isAuthenticated, auth.user, auth.token, t]);

  const handleSubmitForApproval = async (problemId: number) => {
    if (!auth.token) {
      toast.error(t('error_auth_required_action', 'Authentication required for this action.'));
      return;
    }
    try {
      await ProblemService.submitForApproval(problemId);
      setMyProblems((prev) => prev.map((p) => (p.id === problemId ? { ...p, status: 'PENDING_APPROVAL' } : p)));
      toast.success(t('problem_submitted_for_approval_success', 'Problem submitted for approval!'));
    } catch (err) {
      toast.error(t('error_submitting_for_approval', 'Failed to submit for approval: ') + ((err as { message?: string }).message || 'Unknown error'));
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;

  return (
    <div>
      <h2>{t('my_created_problems_header', 'My Created Problems')}</h2>
      {myProblems.length === 0 ? (
        <p>{t('no_problems_created_yet', 'You have not created any problems yet.')}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t('problem_title_th', 'Title')}</th>
              <th>{t('problem_status_th', 'Status')}</th>
              <th>{t('problem_difficulty_th', 'Difficulty')}</th>
              <th>{t('actions_th', 'Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {myProblems.map((problem) => (
              <tr key={problem.id}>
                <td><Link href={`/problems/${problem.id}`}>{problem.title_i18n[i18n.language] || problem.title_i18n.en}</Link></td>
                <td>{t(`status_${problem.status.toLowerCase()}`, problem.status)}</td>
                <td>{t(`difficulty_${problem.difficulty.toLowerCase()}`, problem.difficulty)}</td>
                <td>
                  {(problem.status === 'DRAFT' || problem.status === 'PRIVATE') && (
                    <Link href={`/problems/${problem.id}/edit`} style={{ marginRight: '10px' }}>{t('edit_button', 'Edit')}</Link>
                  )}
                  {problem.status === 'DRAFT' && (
                    <button onClick={() => handleSubmitForApproval(problem.id)}>{t('submit_for_approval_button', 'Submit for Approval')}</button>
                  )}
                  {problem.status === 'PRIVATE' && problem.verifier_feedback && (
                    <p style={{ color: 'orange', fontSize: '0.9em', marginTop: '5px' }}>
                      <em>{t('verifier_feedback_label', 'Feedback')}: {problem.verifier_feedback}</em>
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function MyCreatedProblemsRoute() {
  return (
    <ProtectedRoute roles={AUTHORING_ROLES}>
      <MyCreatedProblemsPage />
    </ProtectedRoute>
  );
}
