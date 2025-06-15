import React, { useState, FormEvent, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ProblemService, TestCaseService } from '../../services/ApiService';
import { useAuth } from '../../context/AuthContext';
import { ProblemType, TagType, TestCaseType, TestCaseUIManaged } from '../../types';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import SubmissionStatusDisplay from '../../components/common/SubmissionStatusDisplay'; // For form messages

const ProblemFormPage: React.FC = () => {
  const { t, i18n } = useTranslation(); 
  const { problemId } = useParams<{ problemId?: string }>();
  const isEditMode = Boolean(problemId);
  const navigate = useNavigate();
  const auth = useAuth();

  // Form state
  const [titleEn, setTitleEn] = useState('');
  const [titleRo, setTitleRo] = useState('');
  const [statementEn, setStatementEn] = useState('');
  const [statementRo, setStatementRo] = useState('');
  const [difficulty, setDifficulty] = useState<string>('EASY'); 
  const [defaultTimeLimitMs, setDefaultTimeLimitMs] = useState<number>(1000);
  const [defaultMemoryLimitKb, setDefaultMemoryLimitKb] = useState<number>(262144); 
  const [status, setStatus] = useState<string>('DRAFT'); 
  const [allowedLanguages, setAllowedLanguages] = useState<string[]>(['python3', 'cpp17']); 
  const [comparisonMode, setComparisonMode] = useState<string>('LINES_STRIP_EXACT');
  const [floatComparisonEpsilon, setFloatComparisonEpsilon] = useState<number | null>(1e-6);
  const [checkerCode, setCheckerCode] = useState<string | null>(null);
  const [checkerLanguage, setCheckerLanguage] = useState<string | null>(null);
  const [availableTags, setAvailableTags] = useState<TagType[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  
  const [testCases, setTestCases] = useState<TestCaseUIManaged[]>([]);
  const [newTestCaseInput, setNewTestCaseInput] = useState('');
  const [newTestCaseOutput, setNewTestCaseOutput] = useState('');
  const [newTestCaseIsSample, setNewTestCaseIsSample] = useState(false);
  const [newTestCasePoints, setNewTestCasePoints] = useState(10);

  const [formError, setFormError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false); 
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false); 

  useEffect(() => {
    ProblemService.getTags()
      .then((response: any) => setAvailableTags(response.data))
      .catch(err => console.error("Failed to fetch tags", err));

    if (isEditMode && problemId && auth.token) {
      setIsLoadingData(true);
      ProblemService.getProblemDetail(problemId)
        .then((response: any) => {
          const data = response.data;
          setTitleEn(data.title_i18n?.en || '');
          setTitleRo(data.title_i18n?.ro || '');
          setStatementEn(data.statement_i18n?.en || '');
          setStatementRo(data.statement_i18n?.ro || '');
          setDifficulty(data.difficulty || 'EASY');
          setDefaultTimeLimitMs(data.default_time_limit_ms || 1000);
          setDefaultMemoryLimitKb(data.default_memory_limit_kb || 262144);
          setStatus(data.status || 'DRAFT');
          setAllowedLanguages(data.allowed_languages || ['python3', 'cpp17']);
          setComparisonMode(data.comparison_mode || 'LINES_STRIP_EXACT');
          setFloatComparisonEpsilon(data.float_comparison_epsilon === null ? null : (data.float_comparison_epsilon || 1e-6));
          setCheckerCode(data.checker_code || null);
          setCheckerLanguage(data.checker_language || null);
          setSelectedTagIds(data.tags?.map((tag: TagType) => tag.id) || []);
          setTestCases(data.test_cases?.map((tc: TestCaseType): TestCaseUIManaged => ({...tc, local_id: `tc-${Date.now()}-${Math.random()}`})) || []);
        })
        .catch(err => {
          setFormError(t('error_loading_problem_for_edit', 'Failed to load problem for editing.'));
          setIsLoadingData(false);
        });
    }
  }, [problemId, isEditMode, auth.token, t]);

  const handleTagChange = (tagId: number) => {
    setSelectedTagIds(prev => 
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    );
  };

  const handleAddTestCase = async () => {
    if (!newTestCaseInput.trim() || !newTestCaseOutput.trim()) {
      alert(t('test_case_input_output_required', 'Test case input and output cannot be empty.'));
      return;
    }
    if (!auth.token) {
      setFormError(t('error_auth_required_action', 'Authentication required.'));
      return;
    }

    const tcData: Omit<TestCaseType, 'id'> & { problem: number | null } = {
      problem: problemId ? parseInt(problemId, 10) : null, 
      input_data: newTestCaseInput,
      expected_output_data: newTestCaseOutput,
      is_sample: newTestCaseIsSample,
      points: newTestCasePoints,
      order: testCases.length + 1
    };

    if (isEditMode && problemId && tcData.problem !== null) { 
      try {
        const response: any = await TestCaseService.createTestCase(tcData as TestCaseType);
        const createdTC = response.data;
        setTestCases(prev => [...prev, {...createdTC, local_id: createdTC.id.toString()}]); 
        setFormMessage(t('test_case_added_successfully', 'Test case added successfully!'));
      } catch (err: any) {
        setFormError(err.message || t('error_adding_test_case', 'Failed to add test case.'));
        return; 
      }
    } else {
      const newTCLocal: TestCaseUIManaged = {
        ...(tcData as Omit<TestCaseType, 'id'>), 
        local_id: `new-tc-${Date.now()}-${Math.random()}`, 
      };
      setTestCases(prev => [...prev, newTCLocal]);
    }
    
    setNewTestCaseInput('');
    setNewTestCaseOutput('');
    setNewTestCaseIsSample(false);
    setNewTestCasePoints(10);
  };

  const handleRemoveTestCase = async (tcToRemove: TestCaseUIManaged) => {
    if (!auth.token) {
      setFormError(t('error_auth_required_action', 'Authentication required.'));
      return;
    }
    if (tcToRemove.id) { 
      try {
        await TestCaseService.deleteTestCase(tcToRemove.id);
        setTestCases(prev => prev.filter(tc => tc.id !== tcToRemove.id));
        setFormMessage(t('test_case_removed_successfully', 'Test case removed successfully!'));
      } catch (err: any) {
        setFormError(err.message || t('error_removing_test_case', 'Failed to remove test case.'));
      }
    } else if (tcToRemove.local_id) { 
      setTestCases(prev => prev.filter(tc => tc.local_id !== tcToRemove.local_id));
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setFormMessage(null);
    if (!auth.token) {
      setFormError(t('error_auth_required_problem_form', 'Authentication required.'));
      return;
    }
    
    const problemDataPayload: Partial<ProblemType> = { 
      title_i18n: { en: titleEn, ro: titleRo },
      statement_i18n: { en: statementEn, ro: statementRo },
      difficulty: difficulty,
      default_time_limit_ms: defaultTimeLimitMs,
      default_memory_limit_kb: defaultMemoryLimitKb,
      status: status, 
      allowed_languages: allowedLanguages,
      comparison_mode: comparisonMode,
      float_comparison_epsilon: comparisonMode === 'FLOAT_PRECISE' ? floatComparisonEpsilon : null,
      checker_code: comparisonMode === 'CUSTOM_CHECKER' ? checkerCode : null,
      checker_language: comparisonMode === 'CUSTOM_CHECKER' ? checkerLanguage : null,
      tag_ids: selectedTagIds,
    };

    setIsSubmitting(true);
    try {
      if (isEditMode && problemId) {
        await ProblemService.updateProblem(problemId, problemDataPayload);
        setFormMessage(t('problem_updated_successfully', 'Problem updated successfully!'));
      } else {
        const response: any = await ProblemService.createProblem(problemDataPayload as ProblemType); 
        const newProblem = response.data;
        setFormMessage(t('problem_created_successfully', 'Problem created successfully!'));
        if (newProblem.id) {
          for (const tc of testCases.filter(tc => !tc.id)) { 
            try {
              await TestCaseService.createTestCase({ ...tc, problem: newProblem.id } as TestCaseType); 
            } catch (tcErr: any) {
              console.error("Failed to save a test case for new problem:", tcErr);
            }
          }
        }
        navigate(`/problems/${newProblem.id}/edit`); 
      }
    } catch (err: any) {
      if (err.response?.data && typeof err.response.data === 'object') {
        setFormError(Object.entries(err.response.data).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`).join('; ') || t('error_saving_problem', 'Failed to save problem.'));
      } else {
        setFormError(err.message || t('error_saving_problem', 'Failed to save problem.'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingData && isEditMode) return <LoadingSpinner />;

  const sectionStyle: React.CSSProperties = {
    marginBottom: '25px',
    paddingBottom: '15px',
    borderBottom: '1px solid #eee'
  };
  const fieldStyle: React.CSSProperties = { marginBottom: '10px' };
  const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '3px', fontWeight: 'bold'};
  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc' };
  const textAreaStyle: React.CSSProperties = { ...inputStyle, minHeight: '100px' };
  const checkboxLabelStyle: React.CSSProperties = { marginLeft: '5px', fontWeight: 'normal'};
  const checkboxContainerStyle: React.CSSProperties = { marginRight: '15px', display: 'inline-block' };


  return (
    <div style={{maxWidth: '800px', margin: '0 auto', padding: '20px'}}>
      <h2>{isEditMode ? t('edit_problem_header', 'Edit Problem') : t('create_problem_header', 'Create New Problem')}</h2>
      <SubmissionStatusDisplay status={formMessage} error={formError} />
      
      <form onSubmit={handleSubmit}>
        <div style={sectionStyle}>
          <h4>{t('problem_form_section_content', 'Problem Content & Identification')}</h4>
          <div style={fieldStyle}><label htmlFor="title_en" style={labelStyle}>{t('problem_form_title_en', 'Title (English)')}:</label><input type="text" id="title_en" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} required style={inputStyle} /></div>
          <div style={fieldStyle}><label htmlFor="title_ro" style={labelStyle}>{t('problem_form_title_ro', 'Title (Romanian)')}:</label><input type="text" id="title_ro" value={titleRo} onChange={(e) => setTitleRo(e.target.value)} required style={inputStyle} /></div>
          <div style={fieldStyle}><label htmlFor="statement_en" style={labelStyle}>{t('problem_form_statement_en', 'Statement (English)')}:</label><textarea id="statement_en" value={statementEn} onChange={(e) => setStatementEn(e.target.value)} rows={10} required style={textAreaStyle}/></div>
          <div style={fieldStyle}><label htmlFor="statement_ro" style={labelStyle}>{t('problem_form_statement_ro', 'Statement (Romanian)')}:</label><textarea id="statement_ro" value={statementRo} onChange={(e) => setStatementRo(e.target.value)} rows={10} required style={textAreaStyle}/></div>
        </div>

        <div style={sectionStyle}>
          <h4>{t('problem_form_section_config', 'Configuration')}</h4>
          <div style={fieldStyle}><label htmlFor="difficulty" style={labelStyle}>{t('problem_form_difficulty', 'Difficulty')}:</label><select id="difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} style={inputStyle}><option value="EASY">{t('difficulty_easy')}</option><option value="MEDIUM">{t('difficulty_medium')}</option><option value="HARD">{t('difficulty_hard')}</option></select></div>
          <div style={fieldStyle}><label htmlFor="time_limit" style={labelStyle}>{t('problem_form_time_limit_ms', 'Time Limit (ms)')}:</label><input type="number" id="time_limit" value={defaultTimeLimitMs} onChange={(e) => setDefaultTimeLimitMs(parseInt(e.target.value, 10))} required style={inputStyle} /></div>
          <div style={fieldStyle}><label htmlFor="memory_limit" style={labelStyle}>{t('problem_form_memory_limit_kb', 'Memory Limit (KB)')}:</label><input type="number" id="memory_limit" value={defaultMemoryLimitKb} onChange={(e) => setDefaultMemoryLimitKb(parseInt(e.target.value, 10))} required style={inputStyle} /></div>
          <div style={fieldStyle}><label htmlFor="status" style={labelStyle}>{t('problem_form_status', 'Status')}:</label><select id="status" value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}><option value="DRAFT">{t('status_draft')}</option><option value="PENDING_APPROVAL">{t('status_pending_approval')}</option><option value="APPROVED">{t('status_approved')}</option><option value="PRIVATE">{t('status_private')}</option></select></div>
          <div style={fieldStyle}><label style={labelStyle}>{t('problem_form_allowed_languages', 'Allowed Languages')}:</label>{['python3', 'cpp17', 'java11'].map(lang => (<span key={lang} style={checkboxContainerStyle}><input type="checkbox" id={`lang-${lang}`} value={lang} checked={allowedLanguages.includes(lang)} onChange={(e) => {if (e.target.checked) {setAllowedLanguages(prev => [...prev, lang]);} else {setAllowedLanguages(prev => prev.filter(l => l !== lang));}}} /><label htmlFor={`lang-${lang}`} style={checkboxLabelStyle}>{lang}</label></span>))}</div>
        </div>

        <div style={sectionStyle}>
          <h4>{t('problem_form_section_advanced_config', 'Advanced Configuration')}</h4>
          <div style={fieldStyle}><label htmlFor="comparison_mode" style={labelStyle}>{t('problem_form_comparison_mode', 'Comparison Mode')}:</label><select id="comparison_mode" value={comparisonMode} onChange={(e) => setComparisonMode(e.target.value)} style={inputStyle}><option value="EXACT">{t('comparison_mode_exact')}</option><option value="STRIP_EXACT">{t('comparison_mode_strip_exact')}</option><option value="LINES_STRIP_EXACT">{t('comparison_mode_lines_strip_exact')}</option><option value="FLOAT_PRECISE">{t('comparison_mode_float_precise')}</option><option value="CUSTOM_CHECKER">{t('comparison_mode_custom_checker')}</option></select></div>
          {comparisonMode === 'FLOAT_PRECISE' && (<div style={fieldStyle}><label htmlFor="float_epsilon" style={labelStyle}>{t('problem_form_float_epsilon')}:</label><input type="number" step="any" id="float_epsilon" value={floatComparisonEpsilon === null ? '' : floatComparisonEpsilon} onChange={(e) => setFloatComparisonEpsilon(e.target.value === '' ? null : parseFloat(e.target.value))} style={inputStyle} /></div>)}
          {comparisonMode === 'CUSTOM_CHECKER' && (<>
            <div style={fieldStyle}><label htmlFor="checker_language" style={labelStyle}>{t('problem_form_checker_language')}:</label><select id="checker_language" value={checkerLanguage || ''} onChange={(e) => setCheckerLanguage(e.target.value || null)} style={inputStyle}><option value="">{t('select_checker_language')}</option><option value="python3">Python 3</option><option value="cpp17">C++17</option></select></div>
            <div style={fieldStyle}><label htmlFor="checker_code" style={labelStyle}>{t('problem_form_checker_code')}:</label><textarea id="checker_code" value={checkerCode || ''} onChange={(e) => setCheckerCode(e.target.value || null)} rows={10} style={textAreaStyle}/></div>
          </>)}
        </div>
        
        <div style={sectionStyle}>
          <h4>{t('problem_form_section_tags', 'Tags')}</h4>
          <div style={fieldStyle}>{availableTags.map(tag => (<span key={tag.id} style={checkboxContainerStyle}><input type="checkbox" id={`tag-${tag.id}`} value={tag.id} checked={selectedTagIds.includes(tag.id)} onChange={() => handleTagChange(tag.id)} /><label htmlFor={`tag-${tag.id}`} style={checkboxLabelStyle}>{tag.name_i18n[i18n.language] || tag.name_i18n.en || tag.slug}</label></span>))}</div>
        </div>
        
        <div style={sectionStyle}>
          <h3>{t('problem_form_test_cases_header', 'Test Cases')}</h3>
          {testCases.map((tc: TestCaseUIManaged, index: number) => (
            <div key={tc.local_id || tc.id || `tc-${index}`} style={{border: '1px solid #eee', padding: '10px', marginBottom: '10px', backgroundColor: tc.is_sample ? '#f0f8ff' : 'transparent'}}>
              <h4>{t('test_case_label', 'Test Case')} {index + 1} {tc.is_sample && `(${t('sample_label', 'Sample')})`}</h4>
              <p><strong>{t('points_label', 'Points')}:</strong> {tc.points}</p>
              <div><label style={labelStyle}>{t('input_data_label', 'Input')}:</label><pre style={{backgroundColor:'#f9f9f9', padding:'5px', whiteSpace:'pre-wrap', border: '1px solid #ddd'}}>{tc.input_data}</pre></div>
              <div><label style={labelStyle}>{t('expected_output_label', 'Output')}:</label><pre style={{backgroundColor:'#f9f9f9', padding:'5px', whiteSpace:'pre-wrap', border: '1px solid #ddd'}}>{tc.expected_output_data}</pre></div>
              <button type="button" onClick={() => handleRemoveTestCase(tc)} style={{marginTop: '5px', padding: '5px 10px'}}>{t('remove_test_case_button', 'Remove')}</button>
            </div>
          ))}
          <div style={{marginTop: '15px', border: '1px dashed #ccc', padding: '15px'}}>
              <h4>{t('add_new_test_case_header', 'Add New Test Case')}</h4>
              <div style={fieldStyle}><label htmlFor="new_tc_input" style={labelStyle}>{t('input_data_label', 'Input Data')}:</label><textarea id="new_tc_input" value={newTestCaseInput} onChange={e => setNewTestCaseInput(e.target.value)} rows={3} style={textAreaStyle} /></div>
              <div style={fieldStyle}><label htmlFor="new_tc_output" style={labelStyle}>{t('expected_output_label', 'Expected Output Data')}:</label><textarea id="new_tc_output" value={newTestCaseOutput} onChange={e => setNewTestCaseOutput(e.target.value)} rows={3} style={textAreaStyle} /></div>
              <div style={fieldStyle}><label htmlFor="new_tc_points" style={labelStyle}>{t('points_label', 'Points')}:</label><input type="number" id="new_tc_points" value={newTestCasePoints} onChange={e => setNewTestCasePoints(parseInt(e.target.value,10) || 0)} style={inputStyle} /></div>
              <div style={fieldStyle}><label htmlFor="new_tc_is_sample" style={labelStyle}>{t('is_sample_label', 'Is Sample?')}:</label><input type="checkbox" id="new_tc_is_sample" checked={newTestCaseIsSample} onChange={e => setNewTestCaseIsSample(e.target.checked)} style={{marginLeft: '5px'}} /></div>
              <button type="button" onClick={handleAddTestCase} style={{marginTop: '10px', padding: '8px 15px'}}>{t('add_test_case_button', 'Add Test Case')}</button>
          </div>
        </div>
        
        <button type="submit" disabled={isSubmitting} style={{marginTop: '20px', padding: '10px 20px', fontSize: '1.1em'}}>{isEditMode ? t('save_changes_button', 'Save Changes') : t('create_problem_button', 'Create Problem')}</button>
      </form>
    </div>
  );
};

export default ProblemFormPage;
