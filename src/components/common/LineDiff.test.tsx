import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import LineDiff from './LineDiff';

afterEach(cleanup);

// [wave E item 13] The line diff powering "diff vs previous attempt".

describe('LineDiff', () => {
  it('marks changed lines and renders custom labels', () => {
    render(<LineDiff left={'a\nb\nc'} right={'a\nx\nc'} leftLabel="v1" rightLabel="v2" />);
    expect(screen.getByText('v1')).toBeTruthy();
    expect(screen.getByText('v2')).toBeTruthy();
    // Line 2 differs; lines 1 and 3 match.
    expect(screen.getByTestId('linediff-row-2').style.color).toBeTruthy();
  });

  it('handles different lengths without crashing', () => {
    render(<LineDiff left={'a'} right={'a\nb\nc'} />);
    expect(screen.getByTestId('linediff-row-3')).toBeTruthy();
  });
});
