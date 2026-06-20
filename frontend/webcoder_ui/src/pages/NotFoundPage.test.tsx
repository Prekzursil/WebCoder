import React from 'react';
import { render, screen } from '@testing-library/react';
import NotFoundPage from './NotFoundPage';

describe('NotFoundPage', () => {
  it('renders the default 404 header when no message prop is passed', () => {
    render(<NotFoundPage />);
    expect(screen.getByText('404 - Page Not Found')).toBeInTheDocument();
    expect(screen.getByText(/The page you are looking for does not exist/)).toBeInTheDocument();
  });

  it('renders a custom message when provided', () => {
    render(<NotFoundPage message="Access denied" />);
    expect(screen.getByText('Access denied')).toBeInTheDocument();
  });
});
