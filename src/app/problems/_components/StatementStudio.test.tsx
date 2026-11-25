// Problem-page wave (item A) — statement studio + test manager tests:
// structured/freeform round-trip, toolbar inserts, live preview, draft
// autosave/restore; archive preview flow, flags, points, live total,
// distribute, threshold-driven inline editing.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import React from 'react';

const draftApi = vi.hoisted(() => ({
  getDraft: vi.fn(),
  saveDraft: vi.fn(),
  deleteDraft: vi.fn(),
}));
const testOpsApi = vi.hoisted(() => ({
  importArchive: vi.fn(),
  distributePoints: vi.fn(),
}));
const testCaseApi = vi.hoisted(() => ({
  listTestCases: vi.fn(),
  createTestCase: vi.fn(),
  updateTestCase: vi.fn(),
  deleteTestCase: vi.fn(),
}));

vi.mock('@/services/ApiService', () => ({
  AuthoringService: draftApi,
  TestOpsService: testOpsApi,
  TestCaseService: testCaseApi,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, user: { id: 1, username: 'author' } }),
}));

import StatementStudio, {
  buildStructured,
  captureRemainder,
  parseStructured,
} from './StatementStudio';
import TestManager from './TestManager';
import type { TestCaseUIManaged } from '@/types';

afterEach(() => cleanup());

describe('StatementStudio markdown round-trip', () => {
  it('parses H2 sections and rebuilds them', () => {
    const md = '## Story\n\nOnce upon a time.\n\n## Constraints\n\n- $n \\le 10$';
    const fields = parseStructured(md);
    expect(fields.story).toContain('Once upon a time');
    expect(fields.constraints).toContain('$n');
    const rebuilt = buildStructured(fields);
    expect(rebuilt).toContain('## Story');
    expect(rebuilt).toContain('## Constraints');
    expect(parseStructured(rebuilt)).toEqual(fields);
  });

  it('keeps a heading-less statement as the story and preserves custom sections', () => {
    expect(parseStructured('Just a tale.').story).toBe('Just a tale.');
    const md = '## Story\n\nTale.\n\n## Notes\n\nAuthor aside.';
    expect(captureRemainder(md)).toContain('## Notes');
    expect(captureRemainder(md)).toContain('Author aside.');
    const rebuilt = [buildStructured(parseStructured(md)), captureRemainder(md)]
      .filter(Boolean)
      .join('\n\n');
    expect(rebuilt).toContain('Tale.');
    expect(rebuilt).toContain('Author aside.');
  });
});

describe('StatementStudio component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    draftApi.getDraft.mockRejectedValue(new Error('no draft'));
    draftApi.saveDraft.mockResolvedValue({ payload: {}, updated_at: 'now' });
  });

  it('renders the toolbar and live preview while typing', async () => {
    function Harness() {
      const [statement, setStatement] = React.useState('');
      return (
        <StatementStudio
          problemId={null}
          locale="en"
          statement={statement}
          onStatementChange={setStatement}
        />
      );
    }
    render(<Harness />);
    expect(screen.getByTestId('studio-toolbar')).toBeInTheDocument();
    expect(screen.getByText('Live preview')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('studio-markdown-en'), {
      target: { value: '## Story\n\nHello **world**' },
    });
    await waitFor(() =>
      expect(screen.getByTestId('studio-preview').textContent).toContain('world'),
    );
  });

  it('inserts a math block at the cursor from the toolbar', () => {
    const onChange = vi.fn();
    render(
      <StatementStudio problemId={null} locale="en" statement="abc" onStatementChange={onChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Math block' }));
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('$$'));
  });

  it('switches to structured mode and edits sections', () => {
    function Harness() {
      const [statement, setStatement] = React.useState('## Story\n\nA tale.');
      return (
        <StatementStudio
          problemId={null}
          locale="en"
          statement={statement}
          onStatementChange={setStatement}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('tab', { name: 'Structured' }));
    const story = screen.getByTestId('studio-field-story');
    expect((story as HTMLTextAreaElement).value).toContain('A tale.');
    fireEvent.change(story, { target: { value: 'A better tale.' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Markdown' }));
    expect((screen.getByTestId('studio-markdown-en') as HTMLTextAreaElement).value).toContain(
      'A better tale.',
    );
  });

  it('does not rewrite the statement when Markdown is already active', () => {
    const onChange = vi.fn();
    render(
      <StatementStudio
        problemId={null}
        locale="en"
        statement={'Freeform with a custom heading\n\n## Notes\n\nKeep me.'}
        onStatementChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Markdown' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('autosaves the draft (debounced) and restores one on mount', async () => {
    draftApi.getDraft.mockResolvedValue({
      payload: { statement: { en: 'restored text' } },
      updated_at: 't0',
    });
    function Harness() {
      const [statement, setStatement] = React.useState('');
      return (
        <StatementStudio
          problemId={7}
          locale="en"
          statement={statement}
          onStatementChange={setStatement}
        />
      );
    }
    render(<Harness />);
    await waitFor(() =>
      expect((screen.getByTestId('studio-markdown-en') as HTMLTextAreaElement).value).toBe(
        'restored text',
      ),
    );
    expect(await screen.findByText('Draft restored')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('studio-markdown-en'), {
      target: { value: 'typed text' },
    });
    await waitFor(
      () =>
        expect(draftApi.saveDraft).toHaveBeenCalledWith('7', {
          statement: { en: 'typed text' },
        }),
      { timeout: 3000 },
    );
  });
});

describe('TestManager component', () => {
  const baseTests: TestCaseUIManaged[] = [
    {
      id: 1,
      input_data: 'i1',
      expected_output_data: 'o1',
      is_sample: true,
      points: 60,
      order: 1,
      local_id: 'tc-1',
    },
    {
      id: 2,
      input_data: 'i2',
      expected_output_data: 'o2',
      is_sample: false,
      points: 30,
      order: 2,
      local_id: 'tc-2',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    testCaseApi.listTestCases.mockResolvedValue({
      results: [
        {
          id: 1,
          input_data: 'i1',
          expected_output_data: 'o1',
          is_sample: true,
          points: 60,
          order: 1,
        },
        {
          id: 2,
          input_data: 'i2',
          expected_output_data: 'o2',
          is_sample: false,
          points: 30,
          order: 2,
        },
      ],
    });
  });

  it('renders the live total with a mismatch warning against the target', () => {
    const setTests = vi.fn();
    render(<TestManager problemId={1} tests={baseTests} setTests={setTests} targetPoints={100} />);
    expect(screen.getByTestId('test-mgr-total').textContent).toContain('90 / 100');
    expect(screen.getByTestId('test-mgr-mismatch')).toBeInTheDocument();
  });

  it('marks the example flag and hidden state per test', () => {
    render(<TestManager problemId={1} tests={baseTests} setTests={vi.fn()} targetPoints={90} />);
    expect(
      (screen.getAllByLabelText('Example (public in statement)')[0] as HTMLInputElement).checked,
    ).toBe(true);
    expect(screen.getByText('Hidden (judge-only)')).toBeInTheDocument();
  });

  it('previews an archive then imports it', async () => {
    testOpsApi.importArchive.mockResolvedValueOnce({
      pairs: [{ name: 'a', input: '1', expected: '2', is_sample: false }],
      skipped: ['orphan.in'],
      other_files: [],
      total_members: 2,
    });
    testOpsApi.importArchive.mockResolvedValueOnce({
      pairs: [],
      skipped: [],
      other_files: [],
      total_members: 0,
      created: 1,
      points_each: 10,
    });
    testCaseApi.listTestCases.mockResolvedValue({ results: [] });
    const file = new File(['x'], 'tests.zip', { type: 'application/zip' });
    render(<TestManager problemId={1} tests={[]} setTests={vi.fn()} targetPoints={100} />);

    const input = screen.getByTestId('test-mgr-archive-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByTestId('test-mgr-preview')).toBeInTheDocument();
    expect(testOpsApi.importArchive).toHaveBeenCalledWith(1, file, { dryRun: true });
    expect(screen.getByTestId('test-mgr-preview-pair')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Import all' }));
    await waitFor(() => expect(testOpsApi.importArchive).toHaveBeenCalledTimes(2));
  });

  it('imports the dropped archive, not a previously picked file', async () => {
    const dropped = new File(['drop'], 'dropped.zip', { type: 'application/zip' });
    const picked = new File(['pick'], 'picked.zip', { type: 'application/zip' });
    testOpsApi.importArchive.mockResolvedValue({
      pairs: [{ name: 'a', input: '1', expected: '2', is_sample: false }],
      skipped: [],
      other_files: [],
      total_members: 1,
      created: 1,
    });
    testCaseApi.listTestCases.mockResolvedValue({ results: [] });
    render(<TestManager problemId={1} tests={[]} setTests={vi.fn()} targetPoints={100} />);

    fireEvent.change(screen.getByTestId('test-mgr-archive-input'), {
      target: { files: [picked] },
    });
    await screen.findByTestId('test-mgr-preview');

    fireEvent.drop(screen.getByTestId('test-mgr-dropzone'), {
      dataTransfer: { files: [dropped] },
    });
    await waitFor(() =>
      expect(testOpsApi.importArchive).toHaveBeenCalledWith(1, dropped, { dryRun: true }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Import all' }));
    await waitFor(() =>
      expect(testOpsApi.importArchive).toHaveBeenCalledWith(1, dropped, { points: 10 }),
    );
  });

  it('distributes points evenly on request', async () => {
    testOpsApi.distributePoints.mockResolvedValue({
      target: 100,
      tests: 2,
      total: 100,
      points: [50, 50],
    });
    render(<TestManager problemId={1} tests={baseTests} setTests={vi.fn()} targetPoints={100} />);
    fireEvent.click(screen.getByRole('button', { name: 'Distribute evenly' }));
    await waitFor(() => expect(testOpsApi.distributePoints).toHaveBeenCalledWith(1, 100));
  });

  it('renders over-threshold tests as preview + download, under-threshold as editors', () => {
    const big: TestCaseUIManaged[] = [
      {
        id: 9,
        input_data: 'x'.repeat(200),
        expected_output_data: 'y'.repeat(200),
        is_sample: false,
        points: 10,
        order: 1,
        local_id: 'tc-9',
      },
    ];
    render(
      <TestManager
        problemId={1}
        tests={big}
        setTests={vi.fn()}
        targetPoints={10}
        editableThreshold={100}
      />,
    );
    expect(screen.getByTestId('test-mgr-too-large')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'Download' });
    expect(links[0]).toHaveAttribute(
      'href',
      expect.stringContaining('/api/v1/problems/testcases/9/download/?kind=input'),
    );
    expect(links[1]).toHaveAttribute(
      'href',
      expect.stringContaining('/api/v1/problems/testcases/9/download/?kind=expected'),
    );
    expect(screen.queryByLabelText('Input 1')).not.toBeInTheDocument();
  });

  it('saves inline edits through the API', async () => {
    render(<TestManager problemId={1} tests={baseTests} setTests={vi.fn()} targetPoints={90} />);
    fireEvent.change(screen.getByLabelText('Input 1'), { target: { value: 'edited' } });
    fireEvent.click(await screen.findByTestId('test-mgr-save-1'));
    await waitFor(() =>
      expect(testCaseApi.updateTestCase).toHaveBeenCalledWith(1, {
        input_data: 'edited',
        expected_output_data: 'o1',
      }),
    );
  });
});
