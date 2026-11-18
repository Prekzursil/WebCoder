import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import FeatureTour, { TOUR_STORAGE_KEY } from './FeatureTour';
import SplitViewToggle from '@/app/problems/[problemId]/SplitViewToggle';

// [Wave G items 94 + 75] The feature tour and the split-view toggle.

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  window.localStorage.clear();
});

afterEach(cleanup);

describe('FeatureTour [item 94]', () => {
  it('shows on first visit and can be skipped with persistence', async () => {
    render(<FeatureTour />);
    const tour = await screen.findByTestId('feature-tour');
    expect(tour).toHaveAttribute('role', 'dialog');
    expect(screen.getByText(/Step 1 of 5/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /skip tour/i }));
    expect(window.localStorage.getItem(TOUR_STORAGE_KEY)).toBe('1');
    expect(screen.queryByTestId('feature-tour')).toBeNull();
  });

  it('never shows once dismissed', async () => {
    window.localStorage.setItem(TOUR_STORAGE_KEY, '1');
    render(<FeatureTour />);
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(screen.queryByTestId('feature-tour')).toBeNull();
  });

  it('advances through steps and finishes on the last', async () => {
    render(<FeatureTour />);
    await screen.findByTestId('feature-tour');
    for (let step = 1; step <= 4; step += 1) {
      fireEvent.click(screen.getByRole('button', { name: /^next$/i }));
      await screen.findByText(new RegExp(`Step ${step + 1} of 5`, 'i'));
    }
    fireEvent.click(screen.getByRole('button', { name: /start solving/i }));
    expect(window.localStorage.getItem(TOUR_STORAGE_KEY)).toBe('1');
    expect(screen.queryByTestId('feature-tour')).toBeNull();
    // jsdom does not follow location.assign — the /start navigation is
    // covered by the e2e spec instead.
  });

  it('exits on Escape', async () => {
    render(<FeatureTour />);
    await screen.findByTestId('feature-tour');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('feature-tour')).toBeNull();
  });
});

describe('SplitViewToggle [item 75]', () => {
  function renderWithGrid(): HTMLElement {
    const { container } = render(
      <div className="detailGrid" data-detail-grid>
        <div>
          <span>statement</span>
        </div>
        <div className="submitColumn">
          <SplitViewToggle />
        </div>
      </div>,
    );
    return container.querySelector('[data-detail-grid]') as HTMLElement;
  }

  it('flips data-split on the detail grid and persists', async () => {
    const grid = renderWithGrid();
    await screen.findByTestId('split-view-toggle');
    expect(grid.getAttribute('data-split')).toBe('off');
    fireEvent.click(screen.getByTestId('split-view-toggle'));
    await waitForSplit(grid, 'on');
    expect(window.localStorage.getItem('wc-split-view')).toBe('1');
  });

  it('re-applies the stored choice on mount', async () => {
    window.localStorage.setItem('wc-split-view', '1');
    const grid = renderWithGrid();
    await waitForSplit(grid, 'on');
  });
});

function waitForSplit(grid: HTMLElement, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      if (grid.getAttribute('data-split') === value) resolve();
      else if (Date.now() - started > 2000) reject(new Error('split attr never flipped'));
      else setTimeout(check, 25);
    };
    check();
  });
}
