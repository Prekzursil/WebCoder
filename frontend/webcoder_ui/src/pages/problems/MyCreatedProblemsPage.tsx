import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ProblemService } from '../../services/ApiService';
import { useAuth } from '../../context/AuthContext';
import { ProblemType } from '../../types';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const MyCreatedProblemsPage: React.FC = () => {
  const { t, i18n } = useTranslation(); 
  const auth = useAuth();
  const [myProblems, setMyProblems] = useState<ProblemType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (auth.isAuthenticated && auth.user?.id && auth.token) {
      setLoading(true);
      ProblemService.getProblems({ authorId: auth.user.id }) 
        .then((response: any) => {
          setMyProblems(response.data);
          setError(null);
          setLoading(false);
        })
        .catch((err: any) => {
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
      setMyProblems(prev => prev.map(p => p.id === problemId ? {...p, status: 'PENDING_APPROVAL'} : p));
      toast.success(t('problem_submitted_for_approval_success', 'Problem submitted for approval!'));
    } catch (err: any) {
      toast.error(t('error_submitting_for_approval', 'Failed to submit for approval: ') + (err.message || 'Unknown error'));
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;
  if (!auth.isAuthenticated) return <p>{t('please_login_to_view_content', 'Please login to view this content.')}</p>;

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
            {myProblems.map(problem => (
              <tr key={problem.id}>
                <td><Link to={`/problems/${problem.id}`}>{problem.title_i18n[i18n.language] || problem.title_i18n.en}</Link></td>
                <td>{t(`status_${problem.status.toLowerCase()}`, problem.status)}</td>
                <td>{t(`difficulty_${problem.difficulty.toLowerCase()}`, problem.difficulty)}</td>
                <td>
                  {(problem.status === 'DRAFT' || problem.status === 'PRIVATE') && (
                    <Link to={`/problems/${problem.id}/edit`} style={{ marginRight: '10px' }}>{t('edit_button', 'Edit')}</Link>
                  )}
                  {problem.status === 'DRAFT' && (
                    <button onClick={() => handleSubmitForApproval(problem.id)}>{t('submit_for_approval_button', 'Submit for Approval')}</button>
                  )}
                   {problem.status === 'PRIVATE' && problem.verifier_feedback && (
                    <p style={{color: 'orange', fontSize: '0.9em', marginTop: '5px'}}>
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
};

export default MyCreatedProblemsPage;
