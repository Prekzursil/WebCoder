import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Navbar from './Navbar';
import { renderWithProviders, seedAuthUser, makeUser } from '../../test-utils';
import i18n from '../../i18n';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('Navbar', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('shows Login/Register links and hides authed links for anonymous users', () => {
    renderWithProviders(<Navbar />);
    expect(screen.getByRole('link', { name: 'Login' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Register' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'My Submissions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
  });

  it('shows base authed links for a BASIC_USER but not creator/admin links', () => {
    seedAuthUser(makeUser({ role: 'BASIC_USER', username: 'basic' }));
    renderWithProviders(<Navbar />);
    expect(screen.getByText('Welcome, basic!')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My Submissions' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Create Problem' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Verification Queue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Admin Dashboard' })).not.toBeInTheDocument();
  });

  it('shows creator links for a PROBLEM_CREATOR but not verifier/admin links', () => {
    seedAuthUser(makeUser({ role: 'PROBLEM_CREATOR' }));
    renderWithProviders(<Navbar />);
    expect(screen.getByRole('link', { name: 'Create Problem' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My Problems' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Verification Queue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Admin Dashboard' })).not.toBeInTheDocument();
  });

  it('shows the verification queue link for a PROBLEM_VERIFIER', () => {
    seedAuthUser(makeUser({ role: 'PROBLEM_VERIFIER' }));
    renderWithProviders(<Navbar />);
    expect(screen.getByRole('link', { name: 'Verification Queue' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Admin Dashboard' })).not.toBeInTheDocument();
  });

  it('shows all admin links for an ADMIN', () => {
    seedAuthUser(makeUser({ role: 'ADMIN' }));
    renderWithProviders(<Navbar />);
    expect(screen.getByRole('link', { name: 'Create Problem' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Verification Queue' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Admin Dashboard' })).toBeInTheDocument();
  });

  it('falls back to "User" in the welcome text when username is empty', () => {
    seedAuthUser(makeUser({ username: '' }));
    renderWithProviders(<Navbar />);
    expect(screen.getByText('Welcome, User!')).toBeInTheDocument();
  });

  it('logs out and navigates to /login on logout click', async () => {
    seedAuthUser(makeUser());
    renderWithProviders(<Navbar />);
    await userEvent.click(screen.getByRole('button', { name: 'Logout' }));
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });

  it('changes language when the EN and RO buttons are clicked', async () => {
    const changeSpy = jest.spyOn(i18n, 'changeLanguage');
    renderWithProviders(<Navbar />);
    await userEvent.click(screen.getByRole('button', { name: 'RO' }));
    expect(changeSpy).toHaveBeenCalledWith('ro');
    await userEvent.click(screen.getByRole('button', { name: 'EN' }));
    expect(changeSpy).toHaveBeenCalledWith('en');
    changeSpy.mockRestore();
  });
});
