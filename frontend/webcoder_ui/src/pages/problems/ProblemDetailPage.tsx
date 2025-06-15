import React, { useState, FormEvent, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ProblemService, SubmissionService } from '../../services/ApiService';
import { useAuth } from '../../context/AuthContext';
import { ProblemType } from '../../types';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import SubmissionStatusDisplay from '../../components/common/SubmissionStatusDisplay'; // Import SubmissionStatusDisplay

const ProblemDetailPage: React.FC = () => {
  const { problemId } = useParams<{ problemId: string }>();
  const { t, i18n } = useTranslation();
  const auth = useAuth(); 
  const [problem, setProblem] = useState<ProblemType | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>(''); 
  const [submissionStatus, setSubmissionStatus] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  useEffect(() => {
    setSubmissionStatus(null);
    setSubmissionError(null);
  }, [code, selectedLanguage]);

  useEffect(() => {
    if (!problemId) return;
    const fetchProblemDetail = async () => {
      try { 
        setLoading(true); 
        setError(null); 
        const response = await ProblemService.getProblemDetail(problemId);
        const data = response.data as any;
        setProblem(data); 
        if (data && data.allowed_languages && data.allowed_languages.length > 0) {
          setSelectedLanguage(data.allowed_languages[0]);
        } else if (data) {
          setSelectedLanguage('python3'); 
        }
      }
      catch (err: any) { 
        setError(err.message || t('error_loading_problem_detail', 'Failed to load problem details.')); 
      }
      finally { 
        setLoading(false); 
      }
    };
    fetchProblemDetail();
  }, [problemId, t]);

  const handleActualSubmit = async () => {
    if (!auth.token || !problemId) { 
      setSubmissionError(t('error_not_logged_in_or_no_problem', 'Authentication required to submit.')); 
      setIsModalOpen(false);
      return; 
    }
    if (!selectedLanguage) {
      setSubmissionError(t('error_select_language', 'Please select a language.'));
      setIsModalOpen(false);
      return;
    }
    setIsSubmitting(true);
    setIsModalOpen(false);
    setSubmissionStatus(t('submitting_status', 'Submitting...')); 
    setSubmissionError(null);
    try {
      const response: any = await SubmissionService.createSubmission({ problem: parseInt(problemId, 10), language: selectedLanguage, code });
      setSubmissionStatus(t('submission_successful_pending', { id: response.data.id })); 
      setCode(''); 
    } catch (err: any) { 
      setSubmissionError(err.message || t('submission_failed_error', 'Submission failed.')); 
      setSubmissionStatus(null); 
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitClick = (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setSubmissionError(t('error_code_empty', 'Code cannot be empty.'));
      return;
    }
    setIsModalOpen(true);
  };

  if (loading && !problem) return <LoadingSpinner />; 
  if (error && !problem) return <p style={{ color: 'red' }}>{error}</p>;
  if (!problem) return <p>{t('problem_not_found', 'Problem not found.')}</p>;

  const currentLang = i18n.language as keyof typeof problem.title_i18n;
  const problemTitle = problem.title_i18n[currentLang] || problem.title_i18n.en || `${t('problem_id_label', 'Problem ID')}: ${problem.id}`;
  const problemStatement = problem.statement_i18n?.[currentLang] || problem.statement_i18n?.en || "";
  const sampleTestCases = problem.test_cases?.filter(tc => tc.is_sample) || [];

  return (
    <div>
      <h2>{problemTitle}</h2>
      <p><strong>{t('difficulty_label', 'Difficulty')}:</strong> {t(`difficulty_${problem.difficulty?.toLowerCase()}`, problem.difficulty)}</p>
      {problem.default_time_limit_ms && <p><strong>{t('time_limit_label', 'Time Limit')}:</strong> {problem.default_time_limit_ms} ms</p>}
      {problem.default_memory_limit_kb && <p><strong>{t('memory_limit_label', 'Memory Limit')}:</strong> {problem.default_memory_limit_kb} KB</p>}
      <h3>{t('problem_statement_header', 'Problem Statement')}</h3>
      <div dangerouslySetInnerHTML={{ __html: problemStatement.replace(/\n/g, '<br />') }} />
      {sampleTestCases.length > 0 && (
        <>
          <h3>{t('sample_test_cases_header', 'Sample Test Cases')}</h3>
          {sampleTestCases.map((tc, index) => (
            <div key={index} style={{ marginBottom: '10px', padding: '10px', border: '1px solid #eee' }}>
              <p><strong>{t('sample_input_label', 'Sample Input')} {index + 1}:</strong></p>
              <pre>{tc.input_data}</pre>
              <p><strong>{t('sample_output_label', 'Sample Output')} {index + 1}:</strong></p>
              <pre>{tc.expected_output_data}</pre>
            </div>
          ))}
        </>
      )}
      <hr style={{ margin: '20px 0' }} />
      <h3>{t('submit_solution_header', 'Submit Solution')}</h3>
      {auth.isAuthenticated && problemId ? (
        <form onSubmit={handleSubmitClick}>
          <div>
            <label htmlFor="language-select">{t('language_label', 'Language')}:</label>
            <select 
              id="language-select" 
              value={selectedLanguage} 
              onChange={(e) => setSelectedLanguage(e.target.value)} 
              style={{ margin: '10px', padding: '5px' }}
              disabled={!problem.allowed_languages || problem.allowed_languages.length === 0}
            >
              <option value="" disabled>{t('select_language_placeholder', 'Select Language...')}</option>
              {(problem.allowed_languages || []).map(lang => (<option key={lang} value={lang}>{lang}</option>))}
            </select>
          </div>
          <div>
            <label htmlFor="code-editor">{t('code_editor_label', 'Code')}:</label>
            <textarea 
              id="code-editor" 
              value={code} 
              onChange={(e) => setCode(e.target.value)} 
              rows={15} 
              style={{ width: '90%', fontFamily: 'monospace', fontSize: '14px', padding: '10px', border: '1px solid #ccc' }} 
              placeholder={t('code_placeholder', 'Paste your code here...')} 
              required 
            />
          </div>
          <SubmissionStatusDisplay status={submissionStatus} error={submissionError} />
          <button 
            type="submit" 
            style={{ marginTop: '10px', padding: '10px 15px' }}
            disabled={isSubmitting || !selectedLanguage || !code.trim()}
          >
            {isSubmitting ? t('submitting_button_text', 'Submitting...') : t('submit_button', 'Submit')}
          </button>
        </form>
      ) : (
        <p>
          {t('please_login_to_submit_1', 'Please ')} 
          <Link to="/login">{t('please_login_to_submit_2', 'login')}</Link> 
          {t('please_login_to_submit_3', ' to submit a solution.')}
        </p>
      )}
      <ConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleActualSubmit}
        title={t('confirm_submission_title', 'Confirm Submission')}
        message={t('confirm_submission_message', { language: selectedLanguage, problem: problemTitle })}
      />
    </div>
  );
};

export default ProblemDetailPage;
