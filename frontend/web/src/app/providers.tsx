'use client';

import { ReactNode } from 'react';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/context/AuthContext';
import Navbar from '@/components/layout/Navbar';

// Client-side providers for the root layout: i18n initialization (side-effect
// import), auth state, toast notifications, and the shared navbar.

import '@/i18n';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Navbar />
      {children}
      <Toaster />
    </AuthProvider>
  );
}
