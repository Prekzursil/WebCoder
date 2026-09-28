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
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      router.replace('/login');
    } else if (roles.length > 0 && !roles.includes(user.role)) {
      router.replace('/');
    }
  }, [user, roles, router]);

  if (!user) return null;

  if (roles.length > 0 && !roles.includes(user.role)) return null;

  return children;
}
