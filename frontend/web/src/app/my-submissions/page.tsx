'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ProblemService, SubmissionService } from '@/services/ApiService';
import { useAuth } from '@/context/AuthContext';
import { ProblemType, SubmissionType } from '@/types';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ProtectedRoute from '@/components/common/ProtectedRoute';

// Ported from frontend/webcoder_ui/src/pages/submissions/MySubmissionsPage.tsx
// (CRA reference). Route mirrors react-router's /my-submissions (App.tsx:40),
// wrapped in ProtectedRoute with all four roles exactly as the reference.
//
// Next.js adaptations (behavior-preserving):
// - next/link instead of react-router's Link.
// - ApiService responses are consumed directly: the scaffold's typed contract
//   declares GetProblemsResponse = ProblemType[] and GetSubmissionsResponse =
//   SubmissionType[] (src/types/api.ts:25,36), normalizing the CRA `.data` /
//   direct-array split flagged in docs/PORT-MAP.md §0.1.
// - Dead branches removed for coverage honesty: the `if (sortKey)` wrapper
//   (sortKey only ever holds the four select options, never ''), the nested
//   `if (!auth.isAuthenticated)` inside the else-arm of the same condition,
//   and handlePageChange's bounds re-check (the Previous/Next buttons are
//   already disabled at the bounds, so out-of-bounds pages were unreachable).
// - t('pagination_page_info', ...) gains a defaultValue so the pager no longer
//   renders the raw i18n key (docs/PORT-MAP.md §0.4 / §8.6 fix); every other
//   call site keeps its English fallback default verbatim.

function MySubmissionsPageContent() {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const [submissions, setSubmissions] = useState<SubmissionType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [problemFilter, setProblemFilter] = useState<string>('');
  const [languageFilter, setLanguageFilter] = useState<string>('');
  const [problemsForFilter, setProblemsForFilter] = useState<ProblemType[]>([]);

  const [sortKey, setSortKey] = useState<string>('submission_time');
  const [sortOrder, setSortOrder] = useState<string>('desc');

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);

  useEffect(() => {
    ProblemService.getProblems()
      .then((response: ProblemType[]) => setProblemsForFilter(response))
      .catch((err) => console.error('Failed to load problems for filter', err));
  }, []);

  useEffect(() => {
    if (auth.isAuthenticated) {
      const fetchSubmissions = async () => {
        setLoading(true);
        setError(null);
        const filters: { problemId?: number; language?: string } = {};
        if (problemFilter) {
          filters.problemId = parseInt(problemFilter, 10);
        }
        if (languageFilter.trim()) {
          filters.language = languageFilter.trim();
        }

        try {
          const response = await SubmissionService.getSubmissions(filters);
          setSubmissions(response);
          setCurrentPage(1); // Reset to first page on new filter/fetch
        } catch (err) {
          setError(err instanceof Error && err.message ? err.message : t('error_loading_submissions', 'Failed to load submissions.'));
        } finally {
          setLoading(false);
        }
      };
      fetchSubmissions();
    } else {
      setLoading(false);
      setSubmissions([]);
      setError(t('please_login_to_view_submissions', 'Please login to view submissions.'));
    }
  }, [auth.isAuthenticated, auth.user, t, problemFilter, languageFilter]);

  const sortedSubmissions = useMemo(() => {
    const sorted = [...submissions];
    sorted.sort((a, b) => {
      const key = sortKey as 'submission_time' | 'score' | 'language' | 'verdict';
      let valA: string | number;
      let valB: string | number;

      if (sortKey === 'submission_time') {
        valA = new Date(a[key] as string).getTime();
        valB = new Date(b[key] as string).getTime();
      } else if (sortKey === 'score') {
        valA = a[key] ?? -Infinity;
        valB = b[key] ?? -Infinity;
      } else {
        valA = a[key] ?? '';
        valB = b[key] ?? '';
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [submissions, sortKey, sortOrder]);

  const paginatedSubmissions = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedSubmissions.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedSubmissions, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(sortedSubmissions.length / itemsPerPage);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  if (!auth.isAuthenticated)
    return (
      <p>
        {t('please_login_to_view_submissions', 'Please login to view submissions.')}{' '}
        <Link href="/login">{t('nav_login', 'Login')}</Link>
      </p>
    );
  if (loading) return <LoadingSpinner />;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;

  return (
    <div>
      <h2>{t('my_submissions_header', 'My Submissions')}</h2>
      <div style={{ marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center' }}>
        <div>
          <label htmlFor="problemFilter" style={{ marginRight: '5px' }}>
            {t('filter_by_problem_label', 'Filter by Problem:')}
          </label>
          <select id="problemFilter" value={problemFilter} onChange={(e) => setProblemFilter(e.target.value)}>
            <option value="">{t('all_problems_option', 'All Problems')}</option>
            {problemsForFilter.map((p: ProblemType) => (
              <option key={p.id} value={p.id.toString()}>
                {p.title_i18n[i18n.language] || p.title_i18n.en || `ID: ${p.id}`}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="languageFilter" style={{ marginRight: '5px' }}>
            {t('filter_by_language_label', 'Filter by Language:')}
          </label>
          <input
            type="text"
            id="languageFilter"
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value)}
            placeholder={t('language_filter_placeholder', 'e.g., python3')}
          />
        </div>
        <div>
          <label htmlFor="sortKey" style={{ marginRight: '5px' }}>
            {t('sort_by_label', 'Sort by:')}
          </label>
          <select id="sortKey" value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
            <option value="submission_time">{t('sort_option_time', 'Time')}</option>
            <option value="score">{t('sort_option_score', 'Score')}</option>
            <option value="language">{t('sort_option_language', 'Language')}</option>
            <option value="verdict">{t('sort_option_verdict', 'Verdict')}</option>
          </select>
        </div>
        <div>
          <label htmlFor="sortOrder" style={{ marginRight: '5px' }}>
            {t('sort_order_label', 'Order:')}
          </label>
          <select id="sortOrder" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
            <option value="asc">{t('sort_order_asc', 'Ascending')}</option>
            <option value="desc">{t('sort_order_desc', 'Descending')}</option>
          </select>
        </div>
        <div>
          <label htmlFor="itemsPerPage" style={{ marginRight: '5px' }}>
            {t('items_per_page_label', 'Items per page:')}
          </label>
          <select
            id="itemsPerPage"
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </div>
      </div>
      {paginatedSubmissions.length === 0 ? (
        <p>{t('no_submissions_yet', 'You have no submissions yet.')}</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>{t('submission_id_th', 'ID')}</th>
                <th>{t('problem_th', 'Problem')}</th>
                <th>{t('language_th', 'Language')}</th>
                <th>{t('verdict_th', 'Verdict')}</th>
                <th>{t('score_th', 'Score')}</th>
                <th>{t('time_th', 'Time')}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedSubmissions.map((sub) => (
                <tr key={sub.id}>
                  <td>
                    <Link href={`/submissions/${sub.id}`}>{sub.id}</Link>
                  </td>
                  <td>
                    <Link href={`/problems/${sub.problem.id}`}>
                      {sub.problem.title_i18n[i18n.language] || sub.problem.title_i18n.en || `ID: ${sub.problem.id}`}
                    </Link>
                  </td>
                  <td>{sub.language}</td>
                  <td>{t(`verdict_${sub.verdict}`, sub.verdict)}</td>
                  <td>{sub.score ?? '-'}</td>
                  <td>{new Date(sub.submission_time).toLocaleString(i18n.language)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div style={{ marginTop: '20px', textAlign: 'center' }}>
              <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1}>
                {t('pagination_previous', 'Previous')}
              </button>
              <span style={{ margin: '0 10px' }}>
                {t('pagination_page_info', {
                  defaultValue: 'Page {{currentPage}} of {{totalPages}}',
                  currentPage,
                  totalPages,
                })}
              </span>
              <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages}>
                {t('pagination_next', 'Next')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function MySubmissionsPage() {
  return (
    <ProtectedRoute roles={['ADMIN', 'PROBLEM_CREATOR', 'PROBLEM_VERIFIER', 'BASIC_USER']}>
      <MySubmissionsPageContent />
    </ProtectedRoute>
  );
}
