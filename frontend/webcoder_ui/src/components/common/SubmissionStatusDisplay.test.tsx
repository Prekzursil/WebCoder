import React from 'react';
import { render, screen } from '@testing-library/react';
import SubmissionStatusDisplay from './SubmissionStatusDisplay';

describe('SubmissionStatusDisplay', () => {
  it('renders nothing when there is neither status nor error', () => {
    const { container } = render(<SubmissionStatusDisplay status={null} error={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders only the status message when error is null', () => {
    render(<SubmissionStatusDisplay status="Running..." error={null} />);
    expect(screen.getByText('Running...')).toBeInTheDocument();
    expect(screen.queryByText(/Error/)).not.toBeInTheDocument();
  });

  it('renders only the error message when status is null', () => {
    render(<SubmissionStatusDisplay status={null} error="Boom" />);
    expect(screen.getByText('Boom')).toBeInTheDocument();
    expect(screen.getByText('Error:')).toBeInTheDocument();
  });

  it('renders both status and error together', () => {
    render(<SubmissionStatusDisplay status="Done" error="Partial fail" />);
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Partial fail')).toBeInTheDocument();
  });
});
