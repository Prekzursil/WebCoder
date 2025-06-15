import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ProblemService, SubmissionService } from '../../services/ApiService';
import { useAuth } from '../../context/AuthContext';
import { ProblemType, SubmissionType } from '../../types';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const MySubmissionsPage: React.FC = () => {
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
      .then((response: any) => setProblemsForFilter(response.data))
      .catch(err => console.error("Failed to load problems for filter", err));
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
          setSubmissions(response as SubmissionType[]);
          setCurrentPage(1); // Reset to first page on new filter/fetch
        } catch (err: any) {
          setError(err.message || t('error_loading_submissions', 'Failed to load submissions.'));
        } finally {
          setLoading(false);
        }
      };
      fetchSubmissions();
    } else {
      setLoading(false);
      setSubmissions([]);
      if (!auth.isAuthenticated) {
        setError(t('please_login_to_view_submissions', 'Please login to view submissions.'));
      }
    }
  }, [auth.isAuthenticated, auth.user, t, problemFilter, languageFilter]);

  const sortedSubmissions = useMemo(() => {
    let sorted = [...submissions];
    if (sortKey) {
      sorted.sort((a, b) => {
        let valA = (a as any)[sortKey];
        let valB = (b as any)[sortKey];

        if (sortKey === 'submission_time') {
          valA = new Date(valA).getTime();
          valB = new Date(valB).getTime();
        } else if (sortKey === 'score') {
          valA = valA ?? -Infinity; 
          valB = valB ?? -Infinity;
        }

        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sorted;
  }, [submissions, sortKey, sortOrder]);

  const paginatedSubmissions = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedSubmissions.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedSubmissions, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(sortedSubmissions.length / itemsPerPage);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  if (!auth.isAuthenticated) return <p>{t('please_login_to_view_submissions', 'Please login to view submissions.')} <Link to="/login">{t('login_link_text', 'Login')}</Link></p>;
  if (loading) return <LoadingSpinner />;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;

  return (
    <div>
      <h2>{t('my_submissions_header', 'My Submissions')}</h2>
      <div style={{ marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center' }}>
        <div>
          <label htmlFor="problemFilter" style={{ marginRight: '5px' }}>{t('filter_by_problem_label', 'Filter by Problem:')}</label>
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
          <label htmlFor="languageFilter" style={{ marginRight: '5px' }}>{t('filter_by_language_label', 'Filter by Language:')}</label>
          <input 
            type="text" 
            id="languageFilter" 
            value={languageFilter} 
            onChange={(e) => setLanguageFilter(e.target.value)} 
            placeholder={t('language_filter_placeholder', 'e.g., python3')} 
          />
        </div>
        <div>
          <label htmlFor="sortKey" style={{ marginRight: '5px' }}>{t('sort_by_label', 'Sort by:')}</label>
          <select id="sortKey" value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
            <option value="submission_time">{t('sort_option_time', 'Time')}</option>
            <option value="score">{t('sort_option_score', 'Score')}</option>
            <option value="language">{t('sort_option_language', 'Language')}</option>
            <option value="verdict">{t('sort_option_verdict', 'Verdict')}</option>
          </select>
        </div>
        <div>
          <label htmlFor="sortOrder" style={{ marginRight: '5px' }}>{t('sort_order_label', 'Order:')}</label>
          <select id="sortOrder" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
            <option value="asc">{t('sort_order_asc', 'Ascending')}</option>
            <option value="desc">{t('sort_order_desc', 'Descending')}</option>
          </select>
        </div>
        <div>
          <label htmlFor="itemsPerPage" style={{ marginRight: '5px' }}>{t('items_per_page_label', 'Items per page:')}</label>
          <select id="itemsPerPage" value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1);}}>
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
                  <td><Link to={`/submissions/${sub.id}`}>{sub.id}</Link></td>
                  <td><Link to={`/problems/${sub.problem.id}`}>{sub.problem.title_i18n[i18n.language] || sub.problem.title_i18n.en || `ID: ${sub.problem.id}`}</Link></td>
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
                {t('pagination_page_info', { currentPage, totalPages })}
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
};

export default MySubmissionsPage;
