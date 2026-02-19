import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SubmissionService } from '../../services/ApiService';
import { useAuth } from '../../context/AuthContext';
import { DetailedSubmissionType, SubmissionTestResultType } from '../../types'; // Import SubmissionTestResultType
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';

const SubmissionDetailPage: React.FC = () => {
  const { submissionId } = useParams<{ submissionId: string }>();
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const [submission, setSubmission] = useState<DetailedSubmissionType | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState<boolean>(false);

  const languageMap: { [key: string]: string } = { python3: 'python', cpp17: 'cpp', java11: 'java' };
  const getSyntaxHighlighterLanguage = (langIdentifier: string): string => languageMap[langIdentifier.toLowerCase()] || 'plaintext';

  const fetchDetails = async (currentSubmissionId: string) => {
    try {
      const response = await SubmissionService.getSubmissionDetail(currentSubmissionId);
      const data = response.data as DetailedSubmissionType;
      setSubmission(data);
      if (data && (data.verdict === 'PENDING' || data.verdict === 'COMPILING' || data.verdict === 'RUNNING')) {
        if (!isPolling) setIsPolling(true);
      } else {
        if (isPolling) setIsPolling(false);
      }
    } catch (err: any) { 
      setError(err.message || t('error_loading_submission_detail', 'Failed to load submission details.')); 
      if (isPolling) setIsPolling(false); 
    }
  };

  useEffect(() => {
    if (submissionId && auth.token) {
      setLoading(true); 
      setError(null);
      fetchDetails(submissionId).finally(() => setLoading(false));
    } else if (!auth.token) { 
      setError(t('error_auth_required_submission', 'Authentication required to view submission details.')); 
      setLoading(false); 
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId, auth.token, t]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout | undefined = undefined;
    if (isPolling && submissionId && auth.token) {
      intervalId = setInterval(() => { 
        if(submissionId && auth.token) fetchDetails(submissionId); 
      }, 3000);
    }
    return () => { if (intervalId) clearInterval(intervalId); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPolling, submissionId, auth.token, t]);

  if (loading && !submission) return <LoadingSpinner />; 
  if (error && !submission) return <p style={{ color: 'red' }}>{error}</p>; 
  if (!submission) return <p>{t('submission_not_found', 'Submission not found.')}</p>;

  const problemTitle = submission.problem.title_i18n[i18n.language] || submission.problem.title_i18n.en || `ID: ${submission.problem.id}`;

  const renderTestResult = (result: SubmissionTestResultType) => (
    <div key={result.id} style={{ border: '1px solid #ddd', padding: '10px', marginBottom: '10px', borderRadius: '4px' }}>
      <h4>
        {t('test_case_label', 'Test Case')} #{result.test_case_details?.order ?? result.test_case_details?.id} 
        {result.test_case_details?.is_sample && ` (${t('sample_label', 'Sample')})`}
        {' - '} {t(`verdict_${result.verdict}`, result.verdict)}
      </h4>
      <p><strong>{t('points_label', 'Points')}:</strong> {result.test_case_details?.points}</p>
      {result.execution_time_ms !== null && result.execution_time_ms !== undefined && <p><strong>{t('time_label', 'Time')}:</strong> {result.execution_time_ms} ms</p>}
      {result.memory_used_kb !== null && result.memory_used_kb !== undefined && <p><strong>{t('memory_label', 'Memory')}:</strong> {result.memory_used_kb} KB</p>}
      
      {result.actual_output && (result.verdict === 'WA' || result.verdict === 'RE') && (
        <>
          <p><strong>{t('actual_output_label', 'Actual Output (truncated)')}:</strong></p>
          <pre style={{ backgroundColor: '#f0f0f0', padding: '5px', maxHeight: '100px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
            {result.actual_output.substring(0, 200)}{result.actual_output.length > 200 ? '...' : ''}
          </pre>
        </>
      )}
      {result.error_output && (result.verdict === 'RE' || result.verdict === 'CE' || result.verdict === 'IE') && (
         <>
          <p><strong>{t('error_output_label', 'Error Output (truncated)')}:</strong></p>
          <pre style={{ backgroundColor: '#f0f0f0', padding: '5px', maxHeight: '100px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
            {result.error_output.substring(0, 200)}{result.error_output.length > 200 ? '...' : ''}
          </pre>
        </>
      )}
    </div>
  );

  return (
    <div>
      <h2>
        {t('submission_detail_header', 'Submission Detail')} #{submission.id} 
        {isPolling && submission && (submission.verdict === 'PENDING' || submission.verdict === 'COMPILING' || submission.verdict === 'RUNNING') && 
          <span style={{fontSize: '0.8em', marginLeft: '10px'}}>({t('polling_status', 'Polling for updates...')})</span>
        }
      </h2>
      {error && !loading && <p style={{color: 'orange', fontStyle: 'italic'}}>Note: {error}</p>}
      <p><strong>{t('problem_label', 'Problem')}:</strong> <Link to={`/problems/${submission.problem.id}`}>{problemTitle}</Link></p>
      {submission.user && <p><strong>{t('user_label', 'User')}:</strong> {submission.user.username}</p>}
      <p><strong>{t('language_label', 'Language')}:</strong> {submission.language}</p>
      <p><strong>{t('verdict_label', 'Verdict')}:</strong> {t(`verdict_${submission.verdict}`, submission.verdict)}</p>
      <p><strong>{t('score_label', 'Score')}:</strong> {submission.score ?? '-'}</p>
      <p><strong>{t('submission_time_label', 'Submission Time')}:</strong> {new Date(submission.submission_time).toLocaleString(i18n.language)}</p>
      {submission.execution_time_ms !== null && <p><strong>{t('execution_time_label', 'Execution Time (Overall)')}:</strong> {submission.execution_time_ms} ms</p>}
      {submission.memory_used_kb !== null && <p><strong>{t('memory_used_label', 'Memory Used (Overall)')}:</strong> {submission.memory_used_kb} KB</p>}
      
      <h3>{t('submitted_code_header', 'Submitted Code')}</h3>
      <div style={{ fontSize: '0.9em', maxWidth: '100%', overflowX: 'auto' }}>
        <SyntaxHighlighter language={getSyntaxHighlighterLanguage(submission.language)} style={vscDarkPlus} showLineNumbers>
          {submission.code}
        </SyntaxHighlighter>
      </div>

      {submission.test_results && submission.test_results.length > 0 && (
        <>
          <h3>{t('test_case_results_header', 'Test Case Results')}</h3>
          {submission.test_results.map(renderTestResult)}
        </>
      )}

      {submission.detailed_feedback && (
        <>
          <h3>{t('judge_feedback_header', "Judge's Summary")}</h3>
          <pre style={{ backgroundColor: '#eee', padding: '10px', border: '1px solid #ccc', whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
            {submission.detailed_feedback}
          </pre>
        </>
      )}
    </div>
  );
};

export default SubmissionDetailPage;
