'use client';

// Client island of the home page (CRA HomePage.tsx:43-53): the Sign Up CTA is
// hidden for authenticated users. Auth state lives in localStorage, so this
// can only be decided on the client. The localized label is produced by the
// server so the island stays dumb.

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import styles from './home.module.css';

interface HomeSignUpButtonProps {
  label: string;
}

export default function HomeSignUpButton({ label }: HomeSignUpButtonProps) {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return null;
  }

  return (
    <Link href="/register" className={`${styles.button} ${styles.buttonOutlined}`}>
      {label}
    </Link>
  );
}
