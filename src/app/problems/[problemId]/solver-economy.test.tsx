// Problem-page wave (items C/D/E/F) — solver-facing component tests:
// the unlock board (status chips, boundary-test data, progress line),
// the tiered hints reveal flow, and the source-unlock forfeit modal
// (verbatim warning + buttons + permanent state).

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const solverApi = vi.hoisted(() => ({
  getTestsStatus: vi.fn(),
  revealHint: vi.fn(),
  unlockSource: vi.fn(),
}));
const editorialApi = vi.hoisted(() => ({
  getEditorial: vi.fn(),
}));

vi.mock('@/services/ApiService', () => ({
  SolverService: solverApi,
  ProblemService: { getEditorial: editorialApi.getEditorial },
}));

import TestUnlockBoard from './TestUnlockBoard';
import HintsPanel from './HintsPanel';
import SourceUnlockModal, { FORFEIT_WARNING } from './SourceUnlockModal';
import SolverEconomySection from './SolverEconomySection';

afterEach(() => cleanup());

describe('TestUnlockBoard [item C]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders per-test status with exactly the unlocked test data', async () => {
    solverApi.getTestsStatus.mockResolvedValue({
      unlock_state: { passed_count: 2, unlocked_index: 3, total: 4, solved_all: false },
      tests: [
        { id: 1, order: 1, position: 1, points: 25, is_sample: true, status: 'solved', input_data: 'in1', expected_output_data: 'out1' },
        { id: 2, order: 2, position: 2, points: 25, is_sample: false, status: 'solved', input_data: 'in2', expected_output_data: 'out2' },
        { id: 3, order: 3, position: 3, points: 25, is_sample: false, status: 'unlocked', input_data: 'in3', expected_output_data: 'out3' },
        { id: 4, order: 4, position: 4, points: 25, is_sample: false, status: 'locked', input_data: null, expected_output_data: null },
      ],
    });
    render(<TestUnlockBoard problemId="9" />);
    await screen.findByTestId('unlock-row-3');
    expect(screen.getByTestId('unlock-status-1').textContent).toBe('Solved');
    expect(screen.getByTestId('unlock-status-3').textContent).toBe('Unlocked');
    expect(screen.getByTestId('unlock-status-4').textContent).toBe('Locked');
    // The boundary test reveals its data; the locked one stays null.
    expect(screen.getByTestId('unlock-input-3').textContent).toBe('in3');
    expect(screen.getByTestId('unlock-expected-3').textContent).toBe('out3');
    expect(screen.queryByTestId('unlock-input-4')).not.toBeInTheDocument();
    expect(screen.getByTestId('unlock-board-progress').textContent).toContain('2 / 4');
  });

  it('renders nothing when the problem has no tests or the call fails', async () => {
    solverApi.getTestsStatus.mockResolvedValue({
      unlock_state: { passed_count: 0, unlocked_index: 0, total: 0, solved_all: false },
      tests: [],
    });
    const { container } = render(<TestUnlockBoard problemId="9" />);
    await waitFor(() => expect(solverApi.getTestsStatus).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();

    solverApi.getTestsStatus.mockRejectedValue(new Error('network'));
    const second = render(<TestUnlockBoard problemId="9" />);
    await waitFor(() => expect(solverApi.getTestsStatus).toHaveBeenCalledTimes(2));
    expect(second.container).toBeEmptyDOMElement();
  });
});

describe('HintsPanel [item D]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reveals tiers through the API and shows the free note', async () => {
    solverApi.revealHint.mockResolvedValue({
      total: 2,
      revealed_count: 1,
      tiers: [
        { tier: 1, kind: 'NUDGE', revealed: true, content: 'look at parity', image: null },
        { tier: 2, kind: 'STRONGER', revealed: false, content: null, image: null },
      ],
    });
    render(
      <HintsPanel
        problemId="9"
        hintState={{
          total: 2,
          revealed_count: 0,
          tiers: [
            { tier: 1, kind: 'NUDGE', revealed: false, content: 'look at parity', image: null },
            { tier: 2, kind: 'STRONGER', revealed: false, content: 'x', image: null },
          ],
        }}
      />,
    );
    expect(screen.getByTestId('hints-free-note').textContent).toContain('free');
    expect(screen.queryByText('look at parity')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('hint-reveal-1'));
    await waitFor(() => expect(solverApi.revealHint).toHaveBeenCalledWith('9', 1));
    expect(await screen.findByText('look at parity')).toBeInTheDocument();
    expect(screen.getByTestId('hint-revealed-1')).toBeInTheDocument();
  });
});

describe('SourceUnlockModal [item F]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('states the verbatim warning with the exact buttons', () => {
    render(
      <SourceUnlockModal problemId="9" open onClose={() => {}} onUnlocked={() => {}} />,
    );
    expect(screen.getByTestId('forfeit-warning-text').textContent).toContain(
      FORFEIT_WARNING,
    );
    expect(FORFEIT_WARNING).toBe(
      'unlocking the source code before the problem is solved means the problem will NOT award points to this account',
    );
    expect(screen.getByTestId('forfeit-confirm').textContent).toBe(
      'I understand — unlock source code',
    );
    expect(screen.getByTestId('forfeit-cancel').textContent).toBe(
      'Cancel — go back to solving',
    );
  });

  it('forfeits through the API and surfaces the revealed source', async () => {
    const onUnlocked = vi.fn();
    solverApi.unlockSource.mockResolvedValue({
      reference_solution_code: 'print(42)',
      reference_language: 'python3',
      forfeited: true,
      forfeited_at: 'now',
      editorial_unlocked: true,
    });
    render(
      <SourceUnlockModal problemId="9" open onClose={() => {}} onUnlocked={onUnlocked} />,
    );
    fireEvent.click(screen.getByTestId('forfeit-confirm'));
    await waitFor(() => expect(solverApi.unlockSource).toHaveBeenCalledWith('9'));
    expect(onUnlocked).toHaveBeenCalledWith('print(42)', 'python3');
  });

  it('cancel keeps the problem locked', async () => {
    const onClose = vi.fn();
    render(
      <SourceUnlockModal problemId="9" open onClose={onClose} onUnlocked={() => {}} />,
    );
    fireEvent.click(screen.getByTestId('forfeit-cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(solverApi.unlockSource).not.toHaveBeenCalled();
  });
});

describe('SolverEconomySection [items E/F]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the forfeited banner + reference source for a forfeited viewer', () => {
    render(
      <SolverEconomySection
        problemId="9"
        hasEditorial={false}
        forfeited
        referenceCode="print(42)"
        referenceLanguage="python3"
        locale="en"
      />,
    );
    expect(screen.getByTestId('forfeited-banner')).toBeInTheDocument();
    expect(screen.getByTestId('reference-source')).toBeInTheDocument();
    expect(screen.queryByTestId('unlock-source-button')).not.toBeInTheDocument();
  });

  it('offers the unlock button otherwise and forfeits through the modal', async () => {
    solverApi.unlockSource.mockResolvedValue({
      reference_solution_code: 'print(1)',
      reference_language: 'python3',
      forfeited: true,
      forfeited_at: null,
      editorial_unlocked: true,
    });
    render(
      <SolverEconomySection
        problemId="9"
        hasEditorial={false}
        forfeited={false}
        referenceCode={null}
        referenceLanguage={null}
        locale="en"
      />,
    );
    fireEvent.click(screen.getByTestId('unlock-source-button'));
    expect(await screen.findByTestId('source-unlock-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('forfeit-confirm'));
    await screen.findByTestId('forfeited-banner');
    expect(screen.getByTestId('reference-source')).toBeInTheDocument();
  });
});
