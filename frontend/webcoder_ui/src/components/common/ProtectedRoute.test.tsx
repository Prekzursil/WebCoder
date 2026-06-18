import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import { AuthProvider } from '../../context/AuthContext';
import { seedAuthUser, makeUser } from '../../test-utils';

const renderAt = (
  initialPath: string,
  element: React.ReactElement,
): ReturnType<typeof render> =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<div>Login Screen</div>} />
          <Route path="/" element={<div>Home Screen</div>} />
          <Route path="/secret" element={element} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );

describe('ProtectedRoute', () => {
  afterEach(() => localStorage.clear());

  it('redirects to /login when there is no authenticated user', () => {
    renderAt('/secret', <ProtectedRoute>{<div>Secret</div>}</ProtectedRoute>);
    expect(screen.getByText('Login Screen')).toBeInTheDocument();
  });

  it('redirects to / when the user lacks the required role', () => {
    seedAuthUser(makeUser({ role: 'BASIC_USER' }));
    renderAt(
      '/secret',
      <ProtectedRoute roles={['ADMIN']}>{<div>Secret</div>}</ProtectedRoute>,
    );
    expect(screen.getByText('Home Screen')).toBeInTheDocument();
  });

  it('renders children when authenticated and no roles are required', () => {
    seedAuthUser(makeUser());
    renderAt('/secret', <ProtectedRoute>{<div>Secret</div>}</ProtectedRoute>);
    expect(screen.getByText('Secret')).toBeInTheDocument();
  });

  it('renders children when the user has one of the required roles', () => {
    seedAuthUser(makeUser({ role: 'ADMIN' }));
    renderAt(
      '/secret',
      <ProtectedRoute roles={['ADMIN', 'PROBLEM_VERIFIER']}>{<div>Secret</div>}</ProtectedRoute>,
    );
    expect(screen.getByText('Secret')).toBeInTheDocument();
  });
});
