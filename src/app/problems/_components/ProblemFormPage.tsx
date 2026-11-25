'use client';

import React, { useState, FormEvent, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  ProblemService,
  TestCaseService,
  collectAllPages,
  PublicService,
} from '@/services/ApiService';
import type { LanguageRow } from '@/types/api';
import { useAuth } from '@/context/AuthContext';
import { ProblemType, TagType, TestCaseType, TestCaseUIManaged } from '@/types';
import StressPanel from '../[problemId]/edit/StressPanel';
import StatementStudio, { type StudioLocale } from './StatementStudio';
import TestManager from './TestManager';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import SubmissionStatusDisplay from '@/components/common/SubmissionStatusDisplay';

/** Mirrors backend `economics.DEFAULT_RANGES`. Midpoint matches
 * `target_points_for_difficulty` so a fresh EASY problem is in band. */
const POINT_BANDS: Record<string, [number, number]> = {
  VERY_EASY: [1, 10],
  EASY: [10, 50],
  MEDIUM: [50, 200],
  HARD: [200, 500],
  VERY_HARD: [500, 1000],
};

function pointsForDifficulty(difficulty: string): number {
  const band = POINT_BANDS[difficulty];
  if (!band) return 100;
  return Math.floor((band[0] + band[1]) / 2);
}

// Ported from frontend/webcoder_ui/src/pages/problems/ProblemFormPage.tsx (CRA reference).
//
// Next.js adaptations:
// - react-router's useParams/useNavigate -> next/navigation's useParams/useRouter.
// - One component serves both authoring routes, as in CRA App.tsx:
//   /problems/create (no problemId -> create mode) and
//   /problems/[problemId]/edit (problemId -> edit mode).
// - ApiService responses are consumed directly: the scaffold's ApiService
//   returns the parsed payload (no {data: ...} envelope), so the CRA
//   `response.data` accesses are dropped (PORT-MAP §0.1 normalization).
// - alert() for empty test-case input is replaced with toast.error
//   (PORT-MAP §8.9 free win).
// - The dead `err.response?.data` branch (PORT-MAP §0.2: apiFetch throws a
//   plain Error with no .response) is removed; errors surface via err.message.
// - Structurally redundant `&&` operands are dropped where one condition
//   derives another (isEditMode === Boolean(problemId)); behavior unchanged.

export default function ProblemFormPage() {
  const { t, i18n } = useTranslation();
  const { problemId } = useParams<{ problemId: string }>();
  const isEditMode = Boolean(problemId);
  const router = useRouter();
  const auth = useAuth();

  // Form state
  const [titleEn, setTitleEn] = useState('');
  const [titleRo, setTitleRo] = useState('');
  const [statementEn, setStatementEn] = useState('');
  const [statementRo, setStatementRo] = useState('');
  const [difficulty, setDifficulty] = useState<string>('EASY');
  // Problem-page wave (item G): the declared finite point value, bounded
  // by the difficulty band (the backend validates; pointBounds is the
  // band hint from the serializer, kept in sync when difficulty changes).
  const [targetPoints, setTargetPoints] = useState<number>(pointsForDifficulty('EASY'));
  const [pointBounds, setPointBounds] = useState<[number, number] | null>(POINT_BANDS.EASY);
  const [studioLocale, setStudioLocale] = useState<StudioLocale>('en');
  const [defaultTimeLimitMs, setDefaultTimeLimitMs] = useState<number>(1000);
  const [defaultMemoryLimitKb, setDefaultMemoryLimitKb] = useState<number>(262144);
  // [wave E item 10] the constraint ceiling for the pre-submit overflow
  // warning (null = no warning).
  const [constraintMaxValue, setConstraintMaxValue] = useState<number | null>(null);
  const [status, setStatus] = useState<string>('DRAFT');
  const [allowedLanguages, setAllowedLanguages] = useState<string[]>(['python3', 'cpp17']);
  const [comparisonMode, setComparisonMode] = useState<string>('LINES_STRIP_EXACT');
  const [floatComparisonEpsilon, setFloatComparisonEpsilon] = useState<number | null>(1e-6);
  const [checkerCode, setCheckerCode] = useState<string | null>(null);
  const [checkerLanguage, setCheckerLanguage] = useState<string | null>(null);
  // Wave D (JDG-2): interactive problems — an interactor program judges
  // the submission over piped stdio instead of batch output comparison.
  const [problemType, setProblemType] = useState<string>('NORMAL');
  const [interactorCode, setInteractorCode] = useState<string | null>(null);
  const [interactorLanguage, setInteractorLanguage] = useState<string | null>(null);
  const [availableTags, setAvailableTags] = useState<TagType[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  // Registry-driven language list (language-fairness wave): the checkboxes
  // come from /public/languages/ — the same rows the judge uses — with a
  // static fallback so an API hiccup never blanks the authoring form.
  const [registryLanguages, setRegistryLanguages] = useState<LanguageRow[]>([]);
  // Console vs file I/O (RO-4): creators pick the olympiad convention at
  // authoring time; FILES mode names its own input/output files.
  const [ioMode, setIoMode] = useState<string>('STDIO');
  const [ioInputFilename, setIoInputFilename] = useState<string>('input.txt');
  const [ioOutputFilename, setIoOutputFilename] = useState<string>('output.txt');
  // Wave C: per-problem library & feature policy (creator-controlled bans).
  // CSV text fields per language + a feature-ban checkbox; assembled into
  // the library_policy JSON on submit.
  const [pyBannedStdlib, setPyBannedStdlib] = useState<string>('');
  const [pyBannedLibs, setPyBannedLibs] = useState<string>('');
  const [pyAllowedLibs, setPyAllowedLibs] = useState<string>('');
  const [cppBannedHeaders, setCppBannedHeaders] = useState<string>('');
  const [banStringOps, setBanStringOps] = useState<boolean>(false);
  // Wave D: block-programming problems (Blockly -> python/js).
  const [blockMode, setBlockMode] = useState<boolean>(false);
  // [wave D engine 2] 'blockly' | 'scratch' — the owner directive wants
  // BOTH engines selectable per problem.
  const [blockEngine, setBlockEngine] = useState<'blockly' | 'scratch'>('blockly');
  const [scratchProject, setScratchProject] = useState<string>('');
  const [scratchBlocks, setScratchBlocks] = useState<string>('');
  const [blockGenerator, setBlockGenerator] = useState<string>('python3');
  const [blockToolbox, setBlockToolbox] = useState<string>('');
  const [blockStarter, setBlockStarter] = useState<string>('');
  // Wave E: partial-code problems — skeleton with locked regions.
  const [codeTemplate, setCodeTemplate] = useState<string>('');
  const [codeTemplateLanguage, setCodeTemplateLanguage] = useState<string>('');

  const [testCases, setTestCases] = useState<TestCaseUIManaged[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    // Tags list is paginated now (SPEC-GAPS B4); collect pages (bounded).
    collectAllPages((page) => ProblemService.getTags({ page, pageSize: 100 }))
      .then((tags: TagType[]) => setAvailableTags(tags))
      .catch((err) => console.error('Failed to fetch tags', err));

    // Language registry (JDG-9 public endpoint): one source of truth for
    // the authoring checkboxes and the effective-limit preview.
    PublicService.getLanguages()
      .then((payload) => setRegistryLanguages(payload.results || []))
      .catch((err) => console.error('Failed to fetch languages', err));

    // isEditMode === Boolean(problemId), so `problemId && auth.isAuthenticated` is
    // equivalent to the CRA `isEditMode && problemId && auth.isAuthenticated` guard.
    if (problemId && auth.isAuthenticated) {
      setIsLoadingData(true);
      ProblemService.getProblemDetail(problemId)
        .then((data: ProblemType) => {
          setTitleEn(data.title_i18n?.en || '');
          setTitleRo(data.title_i18n?.ro || '');
          setStatementEn(data.statement_i18n?.en || '');
          setStatementRo(data.statement_i18n?.ro || '');
          setDifficulty(data.difficulty || 'EASY');
          setTargetPoints(typeof data.target_points === 'number' ? data.target_points : 100);
          if (Array.isArray(data.point_bounds) && data.point_bounds.length === 2) {
            setPointBounds([data.point_bounds[0], data.point_bounds[1]]);
          }
          setDefaultTimeLimitMs(data.default_time_limit_ms || 1000);
          setDefaultMemoryLimitKb(data.default_memory_limit_kb || 262144);
          setConstraintMaxValue(data.constraint_max_value ?? null);
          setStatus(data.status || 'DRAFT');
          setAllowedLanguages(data.allowed_languages || ['python3', 'cpp17']);
          setComparisonMode(data.comparison_mode || 'LINES_STRIP_EXACT');
          setFloatComparisonEpsilon(
            data.float_comparison_epsilon === null ? null : data.float_comparison_epsilon || 1e-6,
          );
          setCheckerCode(data.checker_code || null);
          setCheckerLanguage(data.checker_language || null);
          setProblemType(data.problem_type || 'NORMAL');
          setInteractorCode(data.interactor_code || null);
          setInteractorLanguage(data.interactor_language || null);
          setIoMode(data.io_mode === 'FILES' ? 'FILES' : 'STDIO');
          setIoInputFilename(data.io_input_filename || 'input.txt');
          setIoOutputFilename(data.io_output_filename || 'output.txt');
          const policy = data.library_policy || {};
          setPyBannedStdlib((policy.python3?.banned_stdlib || []).join(', '));
          setPyBannedLibs((policy.python3?.banned || []).join(', '));
          setPyAllowedLibs((policy.python3?.allowed || []).join(', '));
          setCppBannedHeaders(
            [...(policy.cpp17?.banned || []), ...(policy.c11?.banned || [])].join(', '),
          );
          setBanStringOps((policy.banned_features || []).includes('py-no-string-ops'));
          const blocks = data.block_config;
          setBlockMode(Boolean(blocks?.generator) || blocks?.engine === 'scratch');
          setBlockEngine(blocks?.engine === 'scratch' ? 'scratch' : 'blockly');
          setBlockGenerator(blocks?.generator || 'python3');
          setBlockToolbox(blocks?.toolbox || '');
          setBlockStarter(blocks?.starter || '');
          setScratchProject(blocks?.scratch_project || '');
          setScratchBlocks((blocks?.scratch_blocks || []).join(', '));
          setCodeTemplate(data.code_template || '');
          setCodeTemplateLanguage(data.code_template_language || '');
          setSelectedTagIds(data.tags?.map((tag: TagType) => tag.id) || []);
          setTestCases(
            data.test_cases?.map(
              (tc: TestCaseType): TestCaseUIManaged => ({
                ...tc,
                local_id: `tc-${Date.now()}-${Math.random()}`,
              }),
            ) || [],
          );
        })
        .catch(() => {
          setFormError(t('error_loading_problem_for_edit', 'Failed to load problem for editing.'));
        })
        .finally(() => setIsLoadingData(false));
    }
  }, [problemId, auth.isAuthenticated, t]);

  const handleTagChange = (tagId: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  };

  const csvToList = (value: string): string[] =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

  /** Wave C: assemble the per-problem library/feature policy from the
   * CSV editor fields (empty lists are omitted so the JSON stays clean). */
  const buildLibraryPolicy = (): ProblemType['library_policy'] => {
    const policy: NonNullable<ProblemType['library_policy']> = {};
    const py: Record<string, string[]> = {};
    if (pyBannedStdlib.trim()) py.banned_stdlib = csvToList(pyBannedStdlib);
    if (pyBannedLibs.trim()) py.banned = csvToList(pyBannedLibs);
    if (pyAllowedLibs.trim()) py.allowed = csvToList(pyAllowedLibs);
    if (Object.keys(py).length) policy.python3 = py;
    const cppBanned = cppBannedHeaders.trim() ? csvToList(cppBannedHeaders) : [];
    if (cppBanned.length) {
      policy.cpp17 = { banned: cppBanned };
      policy.c11 = { banned: cppBanned };
    }
    if (banStringOps) policy.banned_features = ['py-no-string-ops'];
    return policy;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setFormMessage(null);
    if (!auth.isAuthenticated) {
      setFormError(t('error_auth_required_problem_form', 'Authentication required.'));
      return;
    }

    const problemDataPayload: Partial<ProblemType> = {
      title_i18n: { en: titleEn, ro: titleRo },
      statement_i18n: { en: statementEn, ro: statementRo },
      difficulty: difficulty,
      target_points: targetPoints,
      default_time_limit_ms: defaultTimeLimitMs,
      default_memory_limit_kb: defaultMemoryLimitKb,
      constraint_max_value: constraintMaxValue,
      status: status,
      allowed_languages: allowedLanguages,
      comparison_mode: comparisonMode,
      float_comparison_epsilon: comparisonMode === 'FLOAT_PRECISE' ? floatComparisonEpsilon : null,
      checker_code: comparisonMode === 'CUSTOM_CHECKER' ? checkerCode : null,
      checker_language: comparisonMode === 'CUSTOM_CHECKER' ? checkerLanguage : null,
      problem_type: problemType,
      interactor_code: problemType === 'INTERACTIVE' ? interactorCode : null,
      interactor_language: problemType === 'INTERACTIVE' ? interactorLanguage : null,
      io_mode: ioMode,
      io_input_filename: ioMode === 'FILES' ? ioInputFilename : '',
      io_output_filename: ioMode === 'FILES' ? ioOutputFilename : '',
      library_policy: buildLibraryPolicy(),
      code_template: codeTemplate.trim(),
      code_template_language: codeTemplate.trim() ? codeTemplateLanguage : '',
      block_config: blockMode
        ? blockEngine === 'scratch'
          ? {
              engine: 'scratch' as const,
              ...(scratchProject.trim() ? { scratch_project: scratchProject } : {}),
              ...(scratchBlocks.trim()
                ? {
                    scratch_blocks: scratchBlocks
                      .split(',')
                      .map((op) => op.trim())
                      .filter(Boolean),
                  }
                : {}),
            }
          : {
              engine: 'blockly' as const,
              generator:
                blockGenerator === 'nodejs20' ? ('nodejs20' as const) : ('python3' as const),
              ...(blockToolbox.trim() ? { toolbox: blockToolbox } : {}),
              ...(blockStarter.trim() ? { starter: blockStarter } : {}),
            }
        : undefined,
      tag_ids: selectedTagIds,
    };

    // Mirror of the backend's authoring-time cross-field rule: an
    // INTERACTIVE problem must carry a compilable interactor.
    if (problemType === 'INTERACTIVE' && (!interactorCode || !interactorLanguage)) {
      setFormError(
        t(
          'problem_form_interactor_required',
          'Interactive problems require interactor code and language.',
        ),
      );
      return;
    }

    setIsSubmitting(true);
    try {
      if (problemId) {
        await ProblemService.updateProblem(
          problemId,
          problemDataPayload as unknown as Record<string, unknown>,
        );
        setFormMessage(t('problem_updated_successfully', 'Problem updated successfully!'));
      } else {
        const newProblem = await ProblemService.createProblem(
          problemDataPayload as unknown as Record<string, unknown>,
        );
        setFormMessage(t('problem_created_successfully', 'Problem created successfully!'));
        if (newProblem.id) {
          for (const tc of testCases.filter((tc) => !tc.id)) {
            try {
              await TestCaseService.createTestCase({
                ...tc,
                problem: newProblem.id,
              } as unknown as Record<string, unknown>);
            } catch (tcErr) {
              console.error('Failed to save a test case for new problem:', tcErr);
            }
          }
        }
        router.push(`/problems/${newProblem.id}/edit`);
      }
    } catch (err) {
      setFormError(
        (err as { message?: string }).message ||
          t('error_saving_problem', 'Failed to save problem.'),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // isLoadingData only ever becomes true on the edit path, so the CRA
  // `isLoadingData && isEditMode` guard reduces to `isLoadingData`.
  if (isLoadingData) return <LoadingSpinner />;

  const sectionStyle: React.CSSProperties = {
    marginBottom: '25px',
    paddingBottom: '15px',
    borderBottom: '1px solid var(--border)',
  };
  const fieldStyle: React.CSSProperties = { marginBottom: '10px' };
  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '3px',
    fontWeight: 'bold',
    color: 'var(--foreground)',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px',
    boxSizing: 'border-box',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--foreground)',
  };
  const textAreaStyle: React.CSSProperties = { ...inputStyle, minHeight: '100px' };
  const checkboxLabelStyle: React.CSSProperties = { marginLeft: '5px', fontWeight: 'normal' };
  const checkboxContainerStyle: React.CSSProperties = {
    marginRight: '15px',
    display: 'inline-block',
  };

  return (
    <div className="page-container" style={{ maxWidth: '800px' }}>
      <h2>
        {isEditMode
          ? t('edit_problem_header', 'Edit Problem')
          : t('create_problem_header', 'Create New Problem')}
      </h2>
      <SubmissionStatusDisplay status={formMessage} error={formError} />

      <form onSubmit={handleSubmit}>
        <div style={sectionStyle}>
          <h4>{t('problem_form_section_content', 'Problem Content & Identification')}</h4>
          <div style={fieldStyle}>
            <label htmlFor="title_en" style={labelStyle}>
              {t('problem_form_title_en', 'Title (English)')}:
            </label>
            <input
              type="text"
              id="title_en"
              value={titleEn}
              onChange={(e) => setTitleEn(e.target.value)}
              required
              style={inputStyle}
            />
          </div>
          <div style={fieldStyle}>
            <label htmlFor="title_ro" style={labelStyle}>
              {t('problem_form_title_ro', 'Title (Romanian)')}:
            </label>
            <input
              type="text"
              id="title_ro"
              value={titleRo}
              onChange={(e) => setTitleRo(e.target.value)}
              required
              style={inputStyle}
            />
          </div>
          {/* Problem-page wave (item A): the rich statement studio —
              locale tabs, live preview, toolbar, structured/markdown
              modes, autosaved drafts. */}
          <div style={fieldStyle}>
            <div
              role="tablist"
              aria-label={t('studio_locale_label', 'Statement language')}
              style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={studioLocale === 'en'}
                data-testid="studio-locale-en"
                style={{
                  padding: '4px 12px',
                  fontSize: '0.78rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  border: '1px solid var(--border)',
                  background: studioLocale === 'en' ? 'rgba(56,189,248,0.15)' : 'transparent',
                  color: 'var(--foreground)',
                }}
                onClick={() => setStudioLocale('en')}
              >
                {t('studio_locale_en', 'English')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={studioLocale === 'ro'}
                data-testid="studio-locale-ro"
                style={{
                  padding: '4px 12px',
                  fontSize: '0.78rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  border: '1px solid var(--border)',
                  background: studioLocale === 'ro' ? 'rgba(56,189,248,0.15)' : 'transparent',
                  color: 'var(--foreground)',
                }}
                onClick={() => setStudioLocale('ro')}
              >
                {t('studio_locale_ro', 'Romanian')}
              </button>
            </div>
            <StatementStudio
              key={studioLocale}
              problemId={problemId ? parseInt(problemId, 10) : null}
              locale={studioLocale}
              statement={studioLocale === 'en' ? statementEn : statementRo}
              onStatementChange={(next) => {
                if (studioLocale === 'en') setStatementEn(next);
                else setStatementRo(next);
              }}
            />
          </div>
        </div>

        <div style={sectionStyle}>
          <h4>{t('problem_form_section_config', 'Configuration')}</h4>
          <div style={fieldStyle}>
            <label htmlFor="difficulty" style={labelStyle}>
              {t('problem_form_difficulty', 'Difficulty')}:
            </label>
            <select
              id="difficulty"
              value={difficulty}
              onChange={(e) => {
                const next = e.target.value;
                setDifficulty(next);
                const band = POINT_BANDS[next] ?? null;
                setPointBounds(band);
                if (band) {
                  setTargetPoints((prev) =>
                    prev < band[0] || prev > band[1] ? pointsForDifficulty(next) : prev,
                  );
                }
              }}
              style={inputStyle}
            >
              <option value="VERY_EASY">{t('difficulty_very_easy')}</option>
              <option value="EASY">{t('difficulty_easy')}</option>
              <option value="MEDIUM">{t('difficulty_medium')}</option>
              <option value="HARD">{t('difficulty_hard')}</option>
              <option value="VERY_HARD">{t('difficulty_very_hard', 'Very hard')}</option>
            </select>
          </div>
          <div style={fieldStyle}>
            <label htmlFor="target_points" style={labelStyle}>
              {t('problem_form_target_points', 'Point value')}:
            </label>
            <input
              type="number"
              id="target_points"
              data-testid="problem-form-target-points"
              min={pointBounds ? pointBounds[0] : 1}
              max={pointBounds ? pointBounds[1] : 1000}
              value={targetPoints}
              onChange={(e) => setTargetPoints(parseInt(e.target.value, 10) || 0)}
              style={inputStyle}
              required
            />
            {pointBounds && (
              <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                {t('problem_form_points_band', {
                  defaultValue: 'This difficulty is worth {{min}}–{{max}} points',
                  min: pointBounds[0],
                  max: pointBounds[1],
                })}
              </p>
            )}
          </div>
          <div style={fieldStyle}>
            <label htmlFor="time_limit" style={labelStyle}>
              {t('problem_form_time_limit_ms', 'Time Limit (ms)')}:
            </label>
            <input
              type="number"
              id="time_limit"
              value={defaultTimeLimitMs}
              onChange={(e) => setDefaultTimeLimitMs(parseInt(e.target.value, 10))}
              required
              style={inputStyle}
            />
          </div>
          <div style={fieldStyle}>
            <label htmlFor="memory_limit" style={labelStyle}>
              {t('problem_form_memory_limit_kb', 'Memory Limit (KB)')}:
            </label>
            <input
              type="number"
              id="memory_limit"
              value={defaultMemoryLimitKb}
              onChange={(e) => setDefaultMemoryLimitKb(parseInt(e.target.value, 10))}
              required
              style={inputStyle}
            />
          </div>
          <div style={fieldStyle}>
            <label htmlFor="constraint_max_value" style={labelStyle}>
              {t('problem_form_constraint_max', 'Max value in constraints (optional)')}:
            </label>
            <input
              type="number"
              id="constraint_max_value"
              value={constraintMaxValue ?? ''}
              onChange={(e) =>
                setConstraintMaxValue(e.target.value === '' ? null : parseInt(e.target.value, 10))
              }
              style={inputStyle}
            />
          </div>
          <div style={fieldStyle}>
            <label htmlFor="status" style={labelStyle}>
              {t('problem_form_status', 'Status')}:
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={inputStyle}
            >
              <option value="DRAFT">{t('status_draft')}</option>
              <option value="PENDING_APPROVAL">{t('status_pending_approval')}</option>
              <option value="APPROVED">{t('status_approved')}</option>
              <option value="PRIVATE">{t('status_private')}</option>
            </select>
          </div>
          <div style={fieldStyle}>
            <label htmlFor="problem_type" style={labelStyle}>
              {t('problem_form_problem_type', 'Problem Type')}:
            </label>
            <select
              id="problem_type"
              value={problemType}
              onChange={(e) => setProblemType(e.target.value)}
              style={inputStyle}
            >
              <option value="NORMAL">{t('problem_type_normal', 'Normal (batch tests)')}</option>
              <option value="INTERACTIVE">
                {t('problem_type_interactive', 'Interactive (interactor protocol)')}
              </option>
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>
              {t('problem_form_allowed_languages', 'Allowed Languages')}:
            </label>
            {(registryLanguages.length > 0
              ? registryLanguages.map((row) => row.id)
              : [
                  'python3',
                  'cpp17',
                  'c11',
                  'java11',
                  'nodejs20',
                  'pascal',
                  'go',
                  'rust',
                  'csharp',
                  'ruby',
                  'kotlin',
                  'lua',
                  'php',
                  'haskell',
                ]
            ).map((lang) => {
              const row = registryLanguages.find((r) => r.id === lang);
              // Language-fair limits: show each checked language's judge
              // multiplier right on the checkbox (2× = twice the baseline).
              const effTime = Math.round(defaultTimeLimitMs * (row?.time_multiplier ?? 1));
              const effMem = Math.max(
                Math.round(defaultMemoryLimitKb * (row?.memory_multiplier ?? 1)),
                row?.memory_floor_kb ?? 0,
              );
              return (
                <span key={lang} style={checkboxContainerStyle}>
                  <input
                    type="checkbox"
                    id={`lang-${lang}`}
                    value={lang}
                    checked={allowedLanguages.includes(lang)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setAllowedLanguages((prev) => [...prev, lang]);
                      } else {
                        setAllowedLanguages((prev) => prev.filter((l) => l !== lang));
                      }
                    }}
                  />
                  <label htmlFor={`lang-${lang}`} style={checkboxLabelStyle}>
                    {row?.name || lang}
                    {allowedLanguages.includes(lang) && row ? (
                      <span
                        style={{ opacity: 0.7, marginLeft: '4px', fontFamily: 'var(--font-mono)' }}
                      >
                        ({effTime} ms / {Math.round(effMem / 1024)} MB)
                      </span>
                    ) : null}
                  </label>
                </span>
              );
            })}
            {(() => {
              // Wave D engine 2: the Scratch pseudo-language (project JSON
              // the judge transpiles to Python). Effective limits inherit
              // python3's multipliers — displayed the same way.
              const pyRow = registryLanguages.find((r) => r.id === 'python3');
              const effTime = Math.round(defaultTimeLimitMs * (pyRow?.time_multiplier ?? 3));
              const effMem = Math.max(
                Math.round(defaultMemoryLimitKb * (pyRow?.memory_multiplier ?? 1.5)),
                pyRow?.memory_floor_kb ?? 0,
              );
              const lang = 'scratch';
              return (
                <span key={lang} style={checkboxContainerStyle}>
                  <input
                    type="checkbox"
                    id={`lang-${lang}`}
                    value={lang}
                    checked={allowedLanguages.includes(lang)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setAllowedLanguages((prev) => [...prev, lang]);
                      } else {
                        setAllowedLanguages((prev) => prev.filter((l) => l !== lang));
                      }
                    }}
                  />
                  <label htmlFor={`lang-${lang}`} style={checkboxLabelStyle}>
                    {t('problem_form_language_scratch', 'Scratch (blocks)')}
                    {allowedLanguages.includes(lang) ? (
                      <span
                        style={{ opacity: 0.7, marginLeft: '4px', fontFamily: 'var(--font-mono)' }}
                      >
                        ({effTime} ms / {Math.round(effMem / 1024)} MB)
                      </span>
                    ) : null}
                  </label>
                </span>
              );
            })()}
          </div>
          <div style={fieldStyle}>
            <label htmlFor="io_mode" style={labelStyle}>
              {t('problem_form_io_mode', 'I/O mode')}:
            </label>
            <select
              id="io_mode"
              value={ioMode}
              onChange={(e) => setIoMode(e.target.value)}
              style={inputStyle}
            >
              <option value="STDIO">{t('problem_form_io_stdio', 'Console (stdin/stdout)')}</option>
              <option value="FILES">{t('problem_form_io_files', 'Files (.in/.out)')}</option>
            </select>
          </div>
          {ioMode === 'FILES' && (
            <div style={{ ...fieldStyle, display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px' }}>
                <label htmlFor="io_input_filename" style={labelStyle}>
                  {t('problem_form_io_input_file', 'Input filename')}:
                </label>
                <input
                  id="io_input_filename"
                  type="text"
                  value={ioInputFilename}
                  onChange={(e) => setIoInputFilename(e.target.value)}
                  style={inputStyle}
                  placeholder="date.in"
                />
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <label htmlFor="io_output_filename" style={labelStyle}>
                  {t('problem_form_io_output_file', 'Output filename')}:
                </label>
                <input
                  id="io_output_filename"
                  type="text"
                  value={ioOutputFilename}
                  onChange={(e) => setIoOutputFilename(e.target.value)}
                  style={inputStyle}
                  placeholder="date.out"
                />
              </div>
            </div>
          )}
          <div style={fieldStyle}>
            <label style={labelStyle}>
              {t('problem_form_policy_header', 'Library & feature policy')}:
            </label>
            <p style={{ margin: '0 0 8px', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
              {t(
                'problem_form_policy_hint',
                'Comma-separated. Import bans are enforced at submit (clear 400) and at judge time; Boost availability itself is deployment-dependent.',
              )}
            </p>
            <div style={{ display: 'grid', gap: '8px' }}>
              <div>
                <label htmlFor="py_banned_stdlib" style={labelStyle}>
                  {t('problem_form_policy_py_stdlib', 'Python: banned stdlib modules (e.g. re)')}:
                </label>
                <input
                  id="py_banned_stdlib"
                  type="text"
                  value={pyBannedStdlib}
                  onChange={(e) => setPyBannedStdlib(e.target.value)}
                  style={inputStyle}
                  placeholder="re, itertools"
                />
              </div>
              <div>
                <label htmlFor="py_banned_libs" style={labelStyle}>
                  {t('problem_form_policy_py_libs', 'Python: banned libraries (import names)')}:
                </label>
                <input
                  id="py_banned_libs"
                  type="text"
                  value={pyBannedLibs}
                  onChange={(e) => setPyBannedLibs(e.target.value)}
                  style={inputStyle}
                  placeholder="numpy"
                />
              </div>
              <div>
                <label htmlFor="py_allowed_libs" style={labelStyle}>
                  {t(
                    'problem_form_policy_py_allowed',
                    'Python: extra allowed pip packages (name or name==version)',
                  )}
                  :
                </label>
                <input
                  id="py_allowed_libs"
                  type="text"
                  value={pyAllowedLibs}
                  onChange={(e) => setPyAllowedLibs(e.target.value)}
                  style={inputStyle}
                  placeholder="sympy==1.12"
                />
              </div>
              <div>
                <label htmlFor="cpp_banned_headers" style={labelStyle}>
                  {t(
                    'problem_form_policy_cpp_headers',
                    'C/C++: banned headers or prefixes (e.g. boost)',
                  )}
                  :
                </label>
                <input
                  id="cpp_banned_headers"
                  type="text"
                  value={cppBannedHeaders}
                  onChange={(e) => setCppBannedHeaders(e.target.value)}
                  style={inputStyle}
                  placeholder="boost"
                />
              </div>
              <span style={checkboxContainerStyle}>
                <input
                  type="checkbox"
                  id="ban_string_ops"
                  checked={banStringOps}
                  onChange={(e) => setBanStringOps(e.target.checked)}
                />
                <label htmlFor="ban_string_ops" style={checkboxLabelStyle}>
                  {t(
                    'problem_form_policy_no_string_ops',
                    'Ban treating the input as a string (indexing s[i], str methods) — enforce the arithmetic solution',
                  )}
                </label>
              </span>
            </div>
          </div>
          <div style={fieldStyle}>
            <label htmlFor="code_template" style={labelStyle}>
              {t('problem_form_code_template', 'Partial-code template (locked regions)')}:
            </label>
            <p style={{ margin: '0 0 8px', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
              {t(
                'problem_form_code_template_hint',
                'Full source skeleton. Wrap the editable completion points in WC_EDIT_START / WC_EDIT_END sentinel comment lines — everything else is locked and server-verified byte-identical on submit.',
              )}
            </p>
            <textarea
              id="code_template"
              value={codeTemplate}
              onChange={(e) => setCodeTemplate(e.target.value)}
              style={{ ...inputStyle, minHeight: '140px', fontFamily: 'var(--font-mono)' }}
              placeholder={
                '#include <cstdio>\nint f(int n) {\n    // WC_EDIT_START\n    // WC_EDIT_END\n}\n'
              }
            />
            {codeTemplate.trim() ? (
              <div style={{ marginTop: '8px' }}>
                <label htmlFor="code_template_language" style={labelStyle}>
                  {t('problem_form_code_template_language', 'Template language')}:
                </label>
                <select
                  id="code_template_language"
                  value={codeTemplateLanguage}
                  onChange={(e) => setCodeTemplateLanguage(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">—</option>
                  {(registryLanguages.length > 0
                    ? registryLanguages.map((row) => row.id)
                    : ['python3', 'cpp17']
                  ).map((lang) => (
                    <option key={lang} value={lang}>
                      {lang}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
          <div style={fieldStyle}>
            <span style={checkboxContainerStyle}>
              <input
                type="checkbox"
                id="block_mode"
                checked={blockMode}
                onChange={(e) => setBlockMode(e.target.checked)}
              />
              <label htmlFor="block_mode" style={checkboxLabelStyle}>
                {t('problem_form_block_mode', 'Block programming (Blockly / Scratch)')}
              </label>
            </span>
            {blockMode && (
              <div style={{ display: 'grid', gap: '8px', marginTop: '8px' }}>
                <div>
                  <label htmlFor="block_engine" style={labelStyle}>
                    {t('problem_form_block_engine', 'Block engine')}:
                  </label>
                  <select
                    id="block_engine"
                    value={blockEngine}
                    onChange={(e) =>
                      setBlockEngine(e.target.value === 'scratch' ? 'scratch' : 'blockly')
                    }
                    style={inputStyle}
                  >
                    <option value="blockly">
                      {t(
                        'problem_form_block_engine_blockly',
                        'Blockly (generates Python/JavaScript)',
                      )}
                    </option>
                    <option value="scratch">
                      {t(
                        'problem_form_block_engine_scratch',
                        'Scratch (Scratch cat; judged via Python translation)',
                      )}
                    </option>
                  </select>
                </div>
                {blockEngine === 'scratch' ? (
                  <>
                    <div>
                      <label htmlFor="scratch_project" style={labelStyle}>
                        {t(
                          'problem_form_scratch_project',
                          'Starter Scratch project JSON (optional — default: the Scratch cat saying Hello!)',
                        )}
                        :
                      </label>
                      <textarea
                        id="scratch_project"
                        value={scratchProject}
                        onChange={(e) => setScratchProject(e.target.value)}
                        style={{ ...inputStyle, minHeight: '80px', fontFamily: 'var(--font-mono)' }}
                      />
                    </div>
                    <div>
                      <label htmlFor="scratch_blocks" style={labelStyle}>
                        {t(
                          'problem_form_scratch_blocks',
                          'Allowed Scratch blocks (comma-separated opcodes, optional — e.g. event_whenflagclicked, looks_say, sensing_askandwait, control_repeat, operator_add)',
                        )}
                        :
                      </label>
                      <textarea
                        id="scratch_blocks"
                        value={scratchBlocks}
                        onChange={(e) => setScratchBlocks(e.target.value)}
                        style={{ ...inputStyle, minHeight: '60px', fontFamily: 'var(--font-mono)' }}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label htmlFor="block_generator" style={labelStyle}>
                        {t('problem_form_block_generator', 'Block generator')}:
                      </label>
                      <select
                        id="block_generator"
                        value={blockGenerator}
                        onChange={(e) => setBlockGenerator(e.target.value)}
                        style={inputStyle}
                      >
                        <option value="python3">Python 3</option>
                        <option value="nodejs20">JavaScript (Node.js 20)</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="block_toolbox" style={labelStyle}>
                        {t(
                          'problem_form_block_toolbox',
                          'Toolbox XML (optional — default beginner set)',
                        )}
                        :
                      </label>
                      <textarea
                        id="block_toolbox"
                        value={blockToolbox}
                        onChange={(e) => setBlockToolbox(e.target.value)}
                        style={{ ...inputStyle, minHeight: '80px', fontFamily: 'var(--font-mono)' }}
                      />
                    </div>
                    <div>
                      <label htmlFor="block_starter" style={labelStyle}>
                        {t('problem_form_block_starter', 'Starter workspace XML (optional)')}:
                      </label>
                      <textarea
                        id="block_starter"
                        value={blockStarter}
                        onChange={(e) => setBlockStarter(e.target.value)}
                        style={{ ...inputStyle, minHeight: '80px', fontFamily: 'var(--font-mono)' }}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={sectionStyle}>
          <h4>{t('problem_form_section_advanced_config', 'Advanced Configuration')}</h4>
          <div style={fieldStyle}>
            <label htmlFor="comparison_mode" style={labelStyle}>
              {t('problem_form_comparison_mode', 'Comparison Mode')}:
            </label>
            <select
              id="comparison_mode"
              value={comparisonMode}
              onChange={(e) => setComparisonMode(e.target.value)}
              style={inputStyle}
            >
              <option value="EXACT">{t('comparison_mode_exact')}</option>
              <option value="STRIP_EXACT">{t('comparison_mode_strip_exact')}</option>
              <option value="LINES_STRIP_EXACT">{t('comparison_mode_lines_strip_exact')}</option>
              <option value="FLOAT_PRECISE">{t('comparison_mode_float_precise')}</option>
              <option value="CUSTOM_CHECKER">{t('comparison_mode_custom_checker')}</option>
            </select>
          </div>
          {comparisonMode === 'FLOAT_PRECISE' && (
            <div style={fieldStyle}>
              <label htmlFor="float_epsilon" style={labelStyle}>
                {t('problem_form_float_epsilon')}:
              </label>
              <input
                type="number"
                step="any"
                id="float_epsilon"
                value={floatComparisonEpsilon === null ? '' : floatComparisonEpsilon}
                onChange={(e) =>
                  setFloatComparisonEpsilon(
                    e.target.value === '' ? null : parseFloat(e.target.value),
                  )
                }
                style={inputStyle}
              />
            </div>
          )}
          {comparisonMode === 'CUSTOM_CHECKER' && (
            <>
              <div style={fieldStyle}>
                <label htmlFor="checker_language" style={labelStyle}>
                  {t('problem_form_checker_language')}:
                </label>
                <select
                  id="checker_language"
                  value={checkerLanguage || ''}
                  onChange={(e) => setCheckerLanguage(e.target.value || null)}
                  style={inputStyle}
                >
                  <option value="">{t('select_checker_language')}</option>
                  <option value="python3">Python 3</option>
                  <option value="cpp17">C++17</option>
                  <option value="c11">C (C11)</option>
                  <option value="nodejs20">JavaScript (Node.js 20)</option>
                </select>
              </div>
              <div style={fieldStyle}>
                <label htmlFor="checker_code" style={labelStyle}>
                  {t('problem_form_checker_code')}:
                </label>
                <textarea
                  id="checker_code"
                  value={checkerCode || ''}
                  onChange={(e) => setCheckerCode(e.target.value || null)}
                  rows={10}
                  style={textAreaStyle}
                />
              </div>
            </>
          )}
          {problemType === 'INTERACTIVE' && (
            <>
              <div style={fieldStyle}>
                <label htmlFor="interactor_language" style={labelStyle}>
                  {t('problem_form_interactor_language')}:
                </label>
                <select
                  id="interactor_language"
                  value={interactorLanguage || ''}
                  onChange={(e) => setInteractorLanguage(e.target.value || null)}
                  style={inputStyle}
                >
                  <option value="">{t('select_interactor_language')}</option>
                  <option value="python3">Python 3</option>
                  <option value="cpp17">C++17</option>
                  <option value="c11">C (C11)</option>
                  <option value="nodejs20">JavaScript (Node.js 20)</option>
                </select>
              </div>
              <div style={fieldStyle}>
                <label htmlFor="interactor_code" style={labelStyle}>
                  {t('problem_form_interactor_code')}:
                </label>
                <textarea
                  id="interactor_code"
                  value={interactorCode || ''}
                  onChange={(e) => setInteractorCode(e.target.value || null)}
                  rows={10}
                  style={textAreaStyle}
                />
              </div>
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', whiteSpace: 'pre-line' }}>
                {t('problem_form_interactor_protocol_help')}
              </p>
            </>
          )}
        </div>

        <div style={sectionStyle}>
          <h4>{t('problem_form_section_tags', 'Tags')}</h4>
          <div style={fieldStyle}>
            {availableTags.map((tag) => (
              <span key={tag.id} style={checkboxContainerStyle}>
                <input
                  type="checkbox"
                  id={`tag-${tag.id}`}
                  value={tag.id}
                  checked={selectedTagIds.includes(tag.id)}
                  onChange={() => handleTagChange(tag.id)}
                />
                <label htmlFor={`tag-${tag.id}`} style={checkboxLabelStyle}>
                  {tag.name_i18n[i18n.language] || tag.name_i18n.en || tag.slug}
                </label>
              </span>
            ))}
          </div>
        </div>

        <div style={sectionStyle}>
          <h3>{t('problem_form_test_cases_header', 'Test Cases')}</h3>
          {/* Problem-page wave (item B): archive upload, inline editing,
              example/hidden flags, per-test points with live total. */}
          <TestManager
            problemId={problemId ? parseInt(problemId, 10) : null}
            tests={testCases}
            setTests={(updater) => setTestCases(updater)}
            targetPoints={targetPoints}
          />
          {/* [wave E item 12] the stress helper beside the tests it feeds:
              cross-check a solution vs a brute force on generated inputs. */}
          <StressPanel language={allowedLanguages[0] ?? 'python3'} />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            marginTop: '20px',
            padding: '10px 20px',
            fontSize: '1.1em',
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 600,
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            opacity: isSubmitting ? 0.7 : 1,
          }}
        >
          {isEditMode
            ? t('save_changes_button', 'Save Changes')
            : t('create_problem_button', 'Create Problem')}
        </button>
      </form>
    </div>
  );
}
