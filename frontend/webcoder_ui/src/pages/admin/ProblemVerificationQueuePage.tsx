import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ProblemService } from '../../services/ApiService';
import { useAuth } from '../../context/AuthContext';
import { ProblemType } from '../../types';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const ProblemVerificationQueuePage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const [pendingProblems, setPendingProblems] = useState<ProblemType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [feedbackMap, setFeedbackMap] = useState<{ [problemId: number]: string }>({});

  const fetchPendingProblems = async () => {
    if (auth.isAuthenticated && auth.token) {
      setLoading(true);
      try {
        const response = await ProblemService.getProblems({ status: 'PENDING_APPROVAL' });
        setPendingProblems(response.data as ProblemType[]);
        setError(null);
      } catch (err: any) {
        setError(err.message || t('error_loading_pending_problems', 'Failed to load pending problems.'));
      } finally {
        setLoading(false);
      }
    } else if (!auth.isAuthenticated) {
      setError(t('error_auth_required', 'Authentication required.'));
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingProblems();
  }, [auth.isAuthenticated, auth.token, t, fetchPendingProblems]);

  const handleApproveProblem = async (problemId: number) => {
    if (!auth.token) {
      setActionError(t('error_auth_required_action', 'Authentication required for this action.'));
      return;
    }
    setActionError(null); 
    setActionMessage(null);
    try {
      await ProblemService.approveProblem(problemId, { feedback: feedbackMap[problemId] || undefined });
      setActionMessage(t('problem_approved_successfully', 'Problem approved successfully!'));
      fetchPendingProblems(); 
      setFeedbackMap(prev => ({...prev, [problemId]: ''}));
    } catch (err: any) {
      setActionError(err.message || t('error_approving_problem', 'Failed to approve problem.'));
    }
  };

  const handleRejectProblem = async (problemId: number) => {
    if (!auth.token) {
      setActionError(t('error_auth_required_action', 'Authentication required for this action.'));
      return;
    }
    if (!feedbackMap[problemId]?.trim()) {
      setActionError(t('feedback_required_for_rejection', 'Feedback is required for rejection.'));
      return;
    }
    setActionError(null); 
    setActionMessage(null);
    try {
      await ProblemService.rejectProblem(problemId, { feedback: feedbackMap[problemId] });
      setActionMessage(t('problem_rejected_successfully', 'Problem rejected successfully!'));
      fetchPendingProblems(); 
      setFeedbackMap(prev => ({...prev, [problemId]: ''}));
    } catch (err: any) {
      setActionError(err.message || t('error_rejecting_problem', 'Failed to reject problem.'));
    }
  };
  
  const handleFeedbackChange = (problemId: number, value: string) => {
    setFeedbackMap(prev => ({...prev, [problemId]: value}));
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;
  if (!auth.isAuthenticated) return <p>{t('please_login_to_view_content', 'Please login to view this content.')}</p>;
  if (!auth.user || !['ADMIN', 'PROBLEM_VERIFIER'].includes(auth.user.role)) {
    return <p>{t('unauthorized_access', 'You are not authorized to view this page.')}</p>;
  }

  return (
    <div>
      <h2>{t('problem_verification_queue_header', 'Problem Verification Queue')}</h2>
      {actionMessage && <p style={{color: 'green'}}>{actionMessage}</p>}
      {actionError && <p style={{color: 'red'}}>{actionError}</p>}
      {pendingProblems.length === 0 ? (
        <p>{t('no_problems_pending_approval', 'No problems are currently pending approval.')}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t('problem_id_th', 'ID')}</th>
              <th>{t('problem_title_th', 'Title')}</th>
              <th>{t('problem_author_th', 'Author')}</th>
              <th>{t('problem_difficulty_th', 'Difficulty')}</th>
              <th>{t('verifier_feedback_th', 'Feedback (for rejection)')}</th>
              <th>{t('actions_th', 'Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {pendingProblems.map(problem => (
              <tr key={problem.id}>
                <td>{problem.id}</td>
                <td><Link to={`/problems/${problem.id}/edit`}>{problem.title_i18n[i18n.language] || problem.title_i18n.en}</Link></td>
                <td>{problem.author?.username || t('unknown_author', 'Unknown')}</td>
                <td>{t(`difficulty_${problem.difficulty.toLowerCase()}`, problem.difficulty)}</td>
                <td>
                  <textarea 
                    value={feedbackMap[problem.id] || ''}
                    onChange={(e) => handleFeedbackChange(problem.id, e.target.value)}
                    rows={2}
                    style={{width: '90%'}}
                    placeholder={t('feedback_placeholder_rejection', 'Required for rejection')}
                  />
                </td>
                <td>
                  <button onClick={() => handleApproveProblem(problem.id)} style={{ marginRight: '5px', backgroundColor: 'lightgreen' }}>{t('approve_button', 'Approve')}</button>
                  <button onClick={() => handleRejectProblem(problem.id)} style={{backgroundColor: 'lightcoral'}}>{t('reject_button', 'Reject')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default ProblemVerificationQueuePage;
