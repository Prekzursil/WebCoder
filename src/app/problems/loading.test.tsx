import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import ProblemsLoading from './loading';

afterEach(cleanup);

describe('problems loading boundary', () => {
  it('renders the shared spinner with its loading label', () => {
    render(<ProblemsLoading />);

    expect(screen?.getByText('Loading...'))?.toBeInTheDocument();
    expect(document.querySelector('.spinner'))?.not?.toBeNull();
  });
});
