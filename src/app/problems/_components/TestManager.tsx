'use client';

// Problem-page wave (item B) — the test-suite manager on the authoring
// form. BOTH ways of managing tests:
//   1. ARCHIVE UPLOAD — .zip/.tar/.tar.gz drag-drop or picker; the parsed
//      input/answer pairs preview before bulk-create (guards server-side:
//      zip-bomb, per-file cap, traversal).
//   2. INLINE EDITING — per-test side-by-side editable input/expected
//      textareas whenever the field is under the display threshold
//      (settings-configurable, default 10KB); larger tests render a
//      preview + download link with the archive-upload note.
//   3. TEST FLAGS — any test can be marked "example" (auto-surfaced in
//      the public statement) or hidden (judge-only).
//   4. PER-TEST POINTS — live total vs the problem's target with a
//      mismatch warning and a "distribute evenly" action.

import { useCallback, useMemo, useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  TestCaseService,
  TestOpsService,
  type ArchivePreviewPair,
} from '@/services/ApiService';
import type { TestCaseUIManaged } from '@/types';
import { useAuth } from '@/context/AuthContext';

function approxSize(text: string): string {
  const n = text.length;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TestManager({
  problemId,
  tests,
  setTests,
  targetPoints,
  editableThreshold = 10240,
  onChanged,
}: {
  problemId: number | null;
  tests: TestCaseUIManaged[];
  setTests: (updater: (prev: TestCaseUIManaged[]) => TestCaseUIManaged[]) => void;
  targetPoints: number;
  editableThreshold?: number;
  onChanged?: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const auth = useAuth();
  const [newInput, setNewInput] = useState('');
  const [newExpected, setNewExpected] = useState('');
  const [newSample, setNewSample] = useState(false);
  const [newPoints, setNewPoints] = useState(10);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{
    pairs: ArchivePreviewPair[];
    skipped: string[];
    otherFiles: string[];
    name: string;
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [edits, setEdits] = useState<Record<number, { input: string; expected: string }>>({});

  const total = useMemo(() => tests.reduce((sum, tc) => sum + (tc.points || 0), 0), [tests]);
  const mismatch = total !== targetPoints;

  const refresh = useCallback(async () => {
    if (!problemId) return;
    try {
      const data = await TestCaseService.listTestCases(problemId);
      const rows = data.results.map((tc) => ({ ...tc, local_id: `tc-${tc.id}` }));
      setTests(() => rows);
      onChanged?.();
    } catch {
      /* the optimistic rows stay */
    }
  }, [problemId, setTests, onChanged]);

  const patchTest = useCallback(
    async (id: number, patch: Record<string, unknown>) => {
      // Optimistic: the row flips immediately (controlled checkboxes need
      // it), the PATCH reconciles in the background and refresh() re-syncs.
      setTests((prev) =>
        prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
      );
      try {
        await TestCaseService.updateTestCase(id, patch);
      } catch (err) {
        const msg = (err as Error).message;
        toast.error(msg);
        setStatus(msg);
        return;
      }
      await refresh();
    },
    [refresh, setTests],
  );

  const addTest = useCallback(async () => {
    if (!auth.isAuthenticated) {
      const msg = t('error_auth_required', 'Authentication required.');
      toast.error(msg);
      setStatus(msg);
      return;
    }
    if (!newInput.trim() || !newExpected.trim()) {
      const msg = t('test_case_input_output_required', 'Input and output cannot be empty.');
      toast.error(msg);
      setStatus(msg);
      return;
    }
    const payload = {
      problem: problemId,
      input_data: newInput,
      expected_output_data: newExpected,
      is_sample: newSample,
      points: newPoints,
      order: tests.length + 1,
    };
    if (problemId) {
      try {
        await TestCaseService.createTestCase(payload as unknown as Record<string, unknown>);
        await refresh();
        const okMsg = t('test_case_added_successfully', 'Test case added successfully!');
        toast.success(okMsg);
        setStatus(okMsg);
      } catch (err) {
        const msg = (err as Error).message || t('error_adding_test_case', 'Failed to add test.');
        toast.error(msg);
        setStatus(msg);
        return;
      }
    } else {
      setTests((prev) => [
        ...prev,
        { ...payload, local_id: `new-tc-${Date.now()}-${Math.random()}` },
      ]);
    }
    setNewInput('');
    setNewExpected('');
    setNewSample(false);
    setNewPoints(10);
  }, [auth.isAuthenticated, newInput, newExpected, newSample, newPoints, problemId, tests.length, refresh, setTests, t]);

  const removeTest = useCallback(
    async (tc: TestCaseUIManaged) => {
      if (!auth.isAuthenticated) {
        const msg = t('error_auth_required', 'Authentication required.');
        toast.error(msg);
        setStatus(msg);
        return;
      }
      if (tc.id) {
        try {
          await TestCaseService.deleteTestCase(tc.id);
          // Optimistic row drop: refresh() re-syncs authoritatively, but
          // the row disappears immediately even against a stale cache.
          setTests((prev) => prev.filter((row) => row.id !== tc.id));
          await refresh();
          const okMsg = t('test_case_removed_successfully', 'Test case removed successfully!');
          toast.success(okMsg);
          setStatus(okMsg);
        } catch (err) {
          const msg =
            (err as Error).message ||
            t('error_removing_test_case', 'Failed to remove test case.');
          toast.error(msg);
          setStatus(msg);
        }
      } else {
        setTests((prev) => prev.filter((row) => row.local_id !== tc.local_id));
      }
    },
    [auth.isAuthenticated, refresh, setTests, t],
  );

  const handleFile = useCallback(
    async (file: File) => {
      if (!problemId) {
        toast.error(t('test_mgr_save_first', 'Save the problem before importing tests.'));
        return;
      }
      setUploading(true);
      setPreview(null);
      try {
        const result = await TestOpsService.importArchive(problemId, file, { dryRun: true });
        setPreview({
          pairs: result.pairs,
          skipped: result.skipped,
          otherFiles: result.other_files ?? [],
          name: file.name,
        });
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setUploading(false);
      }
    },
    [problemId, t],
  );

  const confirmImport = useCallback(async () => {
    if (!problemId || !fileInputRef.current?.files?.[0]) return;
    setUploading(true);
    try {
      const result = await TestOpsService.importArchive(problemId, fileInputRef.current.files[0], {
        points: 10,
      });
      toast.success(
        t('test_mgr_imported', {
          defaultValue: 'Imported {{n}} tests',
          n: result.created ?? result.pairs.length,
        }),
      );
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  }, [problemId, refresh, t]);

  const distribute = useCallback(async () => {
    if (!problemId) return;
    try {
      const result = await TestOpsService.distributePoints(problemId, targetPoints);
      toast.success(
        t('test_mgr_distributed', {
          defaultValue: 'Distributed {{total}} points over {{n}} tests',
          total: result.total,
          n: result.tests,
        }),
      );
      await refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, [problemId, targetPoints, refresh, t]);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragOver(false);
      const file = event.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const btnStyle: React.CSSProperties = {
    padding: '5px 12px',
    fontSize: '0.78rem',
    background: 'rgba(56,189,248,0.15)',
    color: 'var(--accent)',
    border: '1px solid rgba(56,189,248,0.3)',
    borderRadius: '6px',
    cursor: 'pointer',
  };
  const dangerBtnStyle: React.CSSProperties = {
    ...btnStyle,
    background: 'rgba(248,113,113,0.15)',
    color: 'var(--danger)',
    borderColor: 'rgba(248,113,113,0.3)',
  };
  const areaStyle: React.CSSProperties = {
    width: '100%',
    minHeight: '80px',
    padding: '8px',
    boxSizing: 'border-box',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--foreground)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8rem',
    resize: 'vertical',
  };

  return (
    <div data-testid="test-manager" style={{ display: 'grid', gap: '14px' }}>
      <span data-testid="test-mgr-status" aria-live="polite" style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
        {status ?? ''}
      </span>
      {/* Live total vs target + distribute evenly (item B4). */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          background: 'var(--surface-2, var(--surface))',
        }}
      >
        <span data-testid="test-mgr-total">
          {t('test_mgr_total', { defaultValue: 'Total: {{total}} / {{target}} points', total, target: targetPoints })}
        </span>
        {mismatch && (
          <span data-testid="test-mgr-mismatch" style={{ color: 'var(--warn)', fontSize: '0.8rem' }}>
            {t('test_mgr_mismatch', {
              defaultValue: 'Test points sum to {{total}} but the target is {{target}}',
              total,
              target: targetPoints,
            })}
          </span>
        )}
        <button type="button" style={btnStyle} onClick={() => void distribute()}>
          {t('test_mgr_distribute', 'Distribute evenly')}
        </button>
      </div>

      {/* Archive upload (item B1). */}
      <div>
        <div
          data-testid="test-mgr-dropzone"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          style={{
            border: dragOver ? '2px dashed var(--accent)' : '2px dashed var(--border)',
            borderRadius: '8px',
            padding: '18px',
            textAlign: 'center',
            color: 'var(--text-tertiary)',
            fontSize: '0.85rem',
            background: dragOver ? 'rgba(56,189,248,0.05)' : 'transparent',
          }}
        >
          <p style={{ margin: '0 0 8px' }}>
            {t('test_mgr_archive_hint', 'Drop a .zip / .tar / .tar.gz of tests here, or')}
          </p>
          <input
            ref={fileInputRef}
            id="test-mgr-archive-input"
            data-testid="test-mgr-archive-input"
            type="file"
            accept=".zip,.tar,.tar.gz,.tgz"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          {uploading && <p style={{ marginTop: 8 }}>{t('test_mgr_uploading', 'Parsing archive…')}</p>}
        </div>
        {preview && (
          <div
            data-testid="test-mgr-preview"
            style={{
              marginTop: '10px',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '12px',
            }}
          >
            <strong>
              {t('test_mgr_archive_preview', {
                defaultValue: '{{name}} — {{n}} pairs found',
                name: preview.name,
                n: preview.pairs.length,
              })}
            </strong>
            <ul style={{ fontSize: '0.78rem', color: 'var(--body)', maxHeight: '180px', overflowY: 'auto' }}>
              {preview.pairs.map((pair) => (
                <li key={pair.name} data-testid="test-mgr-preview-pair">
                  <code>{pair.name}</code>
                  {pair.is_sample ? ` — ${t('sample_label', 'Sample')}` : ''}
                </li>
              ))}
            </ul>
            {preview.otherFiles?.length > 0 && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                {t('test_mgr_other_files', {
                  defaultValue: 'Not paired (ignored): {{names}}',
                  names: preview.otherFiles.join(', '),
                })}
              </p>
            )}
            {preview.skipped.length > 0 && (
              <p style={{ fontSize: '0.75rem', color: 'var(--warn)' }}>
                {t('test_mgr_skipped', {
                  defaultValue: 'Skipped (no answer file): {{names}}',
                  names: preview.skipped.join(', '),
                })}
              </p>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" style={btnStyle} onClick={() => void confirmImport()}>
                {t('test_mgr_import', 'Import all')}
              </button>
              <button
                type="button"
                style={dangerBtnStyle}
                onClick={() => {
                  setPreview(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              >
                {t('cancel_button', 'Cancel')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Per-test cards: flags, points, inline editing (items B2/B3/B4). */}
      <div style={{ display: 'grid', gap: '10px' }}>
        {tests.map((tc, index) => {
          const inputTooBig = (tc.input_data || '').length > editableThreshold;
          const expectedTooBig = (tc.expected_output_data || '').length > editableThreshold;
          const edit = tc.id ? edits[tc.id] : undefined;
          return (
            <div
              key={tc.local_id ?? tc.id ?? index}
              className="card"
              data-testid={`test-mgr-row-${index + 1}`}
              style={{
                background: tc.is_sample ? 'rgba(56,188,248,0.06)' : 'var(--surface)',
                display: 'grid',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                <strong>
                  {t('test_case_label', 'Test Case')} {index + 1}
                </strong>
                <label style={{ fontSize: '0.8rem' }}>
                  <input
                    type="checkbox"
                    checked={tc.is_sample}
                    onChange={(e) => {
                      if (tc.id) void patchTest(tc.id, { is_sample: e.target.checked });
                      else
                        setTests((prev) =>
                          prev.map((row, i) =>
                            i === index ? { ...row, is_sample: e.target.checked } : row,
                          ),
                        );
                    }}
                  />{' '}
                  {t('test_mgr_example', 'Example (public in statement)')}
                </label>
                {!tc.is_sample && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    {t('test_mgr_hidden', 'Hidden (judge-only)')}
                  </span>
                )}
                <label style={{ fontSize: '0.8rem' }}>
                  {t('points_label', 'Points')}:{' '}
                  <input
                    type="number"
                    min={1}
                    value={tc.points}
                    data-testid={`test-mgr-points-${index + 1}`}
                    style={{ width: '70px' }}
                    onChange={(e) => {
                      const points = parseInt(e.target.value, 10) || 0;
                      if (tc.id) void patchTest(tc.id, { points });
                      else
                        setTests((prev) =>
                          prev.map((row, i) => (i === index ? { ...row, points } : row)),
                        );
                    }}
                  />
                </label>
                <button type="button" style={dangerBtnStyle} onClick={() => void removeTest(tc)}>
                  {t('remove_test_case_button', 'Remove')}
                </button>
              </div>

              {/* Side-by-side inline editing under the threshold; preview
                  + download above it (item B2). */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', display: 'block', marginBottom: '2px' }}>
                    {t('test_case_input_label', 'Input')}{' '}
                    <span style={{ color: 'var(--text-tertiary)' }}>({approxSize(tc.input_data || '')})</span>
                  </label>
                  {inputTooBig ? (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                      <pre style={{ whiteSpace: 'pre-wrap', maxHeight: '90px', overflow: 'hidden', margin: '0 0 4px' }}>
                        {(tc.input_data || '').slice(0, 400)}
                      </pre>
                      {tc.id && (
                        <a href={`/api/v1/problems/testcases/${tc.id}/download/?kind=input`}>
                          {t('test_mgr_download', 'Download')}
                        </a>
                      )}
                      <p data-testid="test-mgr-too-large">{t('test_mgr_too_large', 'Over the inline-edit size — use archive upload.')}</p>
                    </div>
                  ) : (
                    <textarea
                      aria-label={`${t('test_case_input_label', 'Input')} ${index + 1}`}
                      value={edit?.input ?? tc.input_data ?? ''}
                      onChange={(e) =>
                        setEdits((prev) => ({
                          ...prev,
                          [tc.id as number]: {
                            input: e.target.value,
                            expected: edit?.expected ?? tc.expected_output_data ?? '',
                          },
                        }))
                      }
                      style={areaStyle}
                    />
                  )}
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', display: 'block', marginBottom: '2px' }}>
                    {t('test_case_output_label', 'Expected output')}{' '}
                    <span style={{ color: 'var(--text-tertiary)' }}>({approxSize(tc.expected_output_data || '')})</span>
                  </label>
                  {expectedTooBig ? (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                      <pre style={{ whiteSpace: 'pre-wrap', maxHeight: '90px', overflow: 'hidden', margin: '0 0 4px' }}>
                        {(tc.expected_output_data || '').slice(0, 400)}
                      </pre>
                      {tc.id && (
                        <a href={`/api/v1/problems/testcases/${tc.id}/download/?kind=expected`}>
                          {t('test_mgr_download', 'Download')}
                        </a>
                      )}
                    </div>
                  ) : (
                    <textarea
                      aria-label={`${t('test_case_output_label', 'Expected output')} ${index + 1}`}
                      value={edit?.expected ?? tc.expected_output_data ?? ''}
                      onChange={(e) =>
                        setEdits((prev) => ({
                          ...prev,
                          [tc.id as number]: {
                            input: edit?.input ?? tc.input_data ?? '',
                            expected: e.target.value,
                          },
                        }))
                      }
                      style={areaStyle}
                    />
                  )}
                </div>
              </div>

              {tc.id && edit && (edit.input !== tc.input_data || edit.expected !== tc.expected_output_data) && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    style={btnStyle}
                    data-testid={`test-mgr-save-${index + 1}`}
                    onClick={() =>
                      void patchTest(tc.id as number, {
                        input_data: edit.input,
                        expected_output_data: edit.expected,
                      })
                    }
                  >
                    {t('test_mgr_save', 'Save test')}
                  </button>
                  <button
                    type="button"
                    style={dangerBtnStyle}
                    onClick={() =>
                      setEdits((prev) => {
                        const next = { ...prev };
                        delete next[tc.id as number];
                        return next;
                      })
                    }
                  >
                    {t('cancel_button', 'Cancel')}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add one test inline. */}
      <div
        style={{
          border: '1px dashed var(--border)',
          padding: '14px',
          borderRadius: '8px',
          display: 'grid',
          gap: '8px',
        }}
      >
        <h4 style={{ margin: 0 }}>{t('add_new_test_case_header', 'Add New Test Case')}</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '10px' }}>
          <textarea
            aria-label={t('input_data_label', 'Input Data')}
            value={newInput}
            onChange={(e) => setNewInput(e.target.value)}
            style={areaStyle}
          />
          <textarea
            aria-label={t('expected_output_label', 'Expected Output Data')}
            value={newExpected}
            onChange={(e) => setNewExpected(e.target.value)}
            style={areaStyle}
          />
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.8rem' }}>
            {t('points_label', 'Points')}:{' '}
            <input
              type="number"
              min={1}
              value={newPoints}
              onChange={(e) => setNewPoints(parseInt(e.target.value, 10) || 0)}
              style={{ width: '70px' }}
            />
          </label>
          <label style={{ fontSize: '0.8rem' }}>
            <input type="checkbox" checked={newSample} onChange={(e) => setNewSample(e.target.checked)} />{' '}
            {t('is_sample_label', 'Is Sample?')}
          </label>
          <button type="button" style={btnStyle} onClick={() => void addTest()}>
            {t('add_test_case_button', 'Add Test Case')}
          </button>
        </div>
      </div>
    </div>
  );
}
