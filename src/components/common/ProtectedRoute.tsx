'use client';

import { useEffect, ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

// Ported from frontend/webcoder_ui/src/components/common/ProtectedRoute.tsx (CRA reference).
// Next.js adaptation: react-router's <Navigate> declarative redirect is
// replaced by an imperative router.replace() in an effect; the component
// renders nothing while the redirect is pending.

export interface ProtectedRouteProps {
  children: ReactElement;
  roles?: string[];
}

export default function ProtectedRoute({ children, roles = [] }: ProtectedRouteProps) {
  const { user, isHydrated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // While the session snapshot is still hydrating (isHydrated === false)
    // a missing user means "not loaded yet", not "signed out" — hold the
    // redirect so a slow hydration never bounces a signed-in user. Contexts
    // without the flag (older test mocks) hydrate instantly by convention.
    if (isHydrated === false) return;
    if (!user) {
      router.replace('/login');
    } else if (roles.length > 0 && !roles.includes(user.role)) {
      router.replace('/');
    }
  }, [user, roles, router, isHydrated]);

  if (!user) return null;

  if (roles.length > 0 && !roles.includes(user.role)) return null;

  return children;
}
