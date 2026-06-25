import React from 'react';
import { screen } from '@testing-library/react';
import HomePage from './HomePage';
import { renderWithProviders, seedAuthUser, makeUser } from '../test-utils';

describe('HomePage', () => {
  afterEach(() => localStorage.clear());

  it('shows the welcome heading and a Sign Up button for anonymous users', () => {
    renderWithProviders(<HomePage />);
    expect(screen.getByRole('heading', { name: 'Welcome to WebCoder' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Problems' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign Up' })).toBeInTheDocument();
  });

  it('hides the Sign Up button when the user is authenticated', () => {
    seedAuthUser(makeUser());
    renderWithProviders(<HomePage />);
    expect(screen.queryByRole('link', { name: 'Sign Up' })).not.toBeInTheDocument();
  });
});
