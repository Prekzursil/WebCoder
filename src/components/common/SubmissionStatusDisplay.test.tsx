import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SubmissionStatusDisplay from './SubmissionStatusDisplay';

// All four status/error combinations: early null return, status-only, the
// error-only margin branch (margin 0) and the stacked branch (top margin).

afterEach(cleanup);

describe('SubmissionStatusDisplay', () => {
  it('renders nothing when both status and error are null', () => {
    const { container } = render(<SubmissionStatusDisplay status={null} error={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders only the status message when there is no error', () => {
    render(<SubmissionStatusDisplay status="Grading in progress" error={null} />);
    expect(screen.getByText('Grading in progress')).toBeInTheDocument();
    expect(screen.queryByText(/Error:/)).not.toBeInTheDocument();
  });

  it('renders only the error (no top margin) when there is no status', () => {
    render(<SubmissionStatusDisplay status={null} error="Compile failed" />);
    const errorLine = screen.getByText('Compile failed').closest('p')!;
    expect(screen.getByText('Error:')).toBeInTheDocument();
    expect(errorLine.style.margin).toBe('0px');
    expect(screen.queryByText('Grading in progress')).not.toBeInTheDocument();
  });

  it('stacks error under status with a top margin when both are present', () => {
    render(<SubmissionStatusDisplay status="Grading in progress" error="Compile failed" />);
    const errorLine = screen.getByText('Compile failed').closest('p')!;
    expect(screen.getByText('Grading in progress')).toBeInTheDocument();
    // CSSOM expands bare zeros ("0" -> "0px") in shorthand margins.
    expect(errorLine.style.margin).toBe('10px 0px 0px');
  });
});
