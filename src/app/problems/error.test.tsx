import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import ProblemsError from './error';

afterEach(cleanup);

describe('problems error boundary', () => {
  it('shows the API error message in red', () => {
    render(<ProblemsError error={new Error('Service unavailable')} reset={vi.fn()} />);

    const message = screen.getByText('Service unavailable');
    expect(message).toBeInTheDocument();
    expect(message).toHaveStyle({ color: 'rgb(255, 0, 0)' });
  });

  it('falls back to the translated default when the error message is empty', () => {
    render(<ProblemsError error={new Error('')} reset={vi.fn()} />);

    expect(screen.getByText('Failed to load problems.')).toBeInTheDocument();
  });

  it('retries the render when Try Again is clicked', () => {
    const reset = vi.fn();
    render(<ProblemsError error={new Error('Service unavailable')} reset={reset} />);

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
