'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';

const Navbar: React.FC = () => {
  const { i18n, t } = useTranslation();
  const auth = useAuth();
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  const handleLogout = () => {
    auth.logout();
    router.push('/login');
  };

  const canCreateProblems = auth.isAuthenticated && auth.user &&
    ['ADMIN', 'PROBLEM_VERIFIER', 'PROBLEM_CREATOR'].includes(auth.user.role);
  const canVerifyProblems = auth.isAuthenticated && auth.user &&
    ['ADMIN', 'PROBLEM_VERIFIER'].includes(auth.user.role);
  const isAdmin = auth.isAuthenticated && auth.user && auth.user.role === 'ADMIN';

  const isActive = (path: string): boolean =>
    path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`);

  return (
    <nav style={{
      position: 'sticky',
      top: 0,
      zIndex: 100,
      backgroundColor: '#0f172a',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      boxShadow: '0 1px 12px rgba(0,0,0,0.3)',
    }}>
      <div style={{
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '0 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        height: '60px',
      }}>
        {/* Brand */}
        <Link href="/" style={{
          fontSize: '1.25rem',
          fontWeight: 700,
          color: '#38bdf8',
          textDecoration: 'none',
          letterSpacing: '-0.02em',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)',
            fontSize: '0.85rem',
            fontWeight: 800,
            color: '#fff',
          }}>W</span>
          {t('app_title', 'WebCoder')}
        </Link>

        {/* Desktop nav links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {[
            { href: '/', label: t('nav_home', 'Home') },
            { href: '/problems', label: t('nav_problems', 'Problems') },
            { href: '/leaderboard', label: t('nav_leaderboard', 'Leaderboard') },
            { href: '/forum', label: t('nav_forum', 'Forum') },
          ].map(({ href, label }) => (
            <Link key={href} href={href} style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: isActive(href) ? 600 : 400,
              color: isActive(href) ? '#38bdf8' : 'rgba(255,255,255,0.7)',
              textDecoration: 'none',
              backgroundColor: isActive(href) ? 'rgba(56,189,248,0.1)' : 'transparent',
              transition: 'all 150ms ease',
            }}>{label}</Link>
          ))}

          {auth.isAuthenticated && (
            <>
              <Link href="/my-submissions" style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: isActive('/my-submissions') ? 600 : 400,
                color: isActive('/my-submissions') ? '#38bdf8' : 'rgba(255,255,255,0.7)',
                textDecoration: 'none',
                backgroundColor: isActive('/my-submissions') ? 'rgba(56,189,248,0.1)' : 'transparent',
                transition: 'all 150ms ease',
              }}>{t('nav_my_submissions', 'My Submissions')}</Link>

              <Link href="/submission-history" style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: isActive('/submission-history') ? 600 : 400,
                color: isActive('/submission-history') ? '#38bdf8' : 'rgba(255,255,255,0.7)',
                textDecoration: 'none',
                backgroundColor: isActive('/submission-history') ? 'rgba(56,189,248,0.1)' : 'transparent',
                transition: 'all 150ms ease',
              }}>{t('nav_submission_history', 'History')}</Link>

              <Link href="/profile" style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: isActive('/profile') ? 600 : 400,
                color: isActive('/profile') ? '#38bdf8' : 'rgba(255,255,255,0.7)',
                textDecoration: 'none',
                backgroundColor: isActive('/profile') ? 'rgba(56,189,248,0.1)' : 'transparent',
                transition: 'all 150ms ease',
              }}>{t('nav_profile', 'Profile')}</Link>

              {canCreateProblems && (
                <>
                  <Link href="/problems/create" style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontWeight: isActive('/problems/create') ? 600 : 400,
                    color: isActive('/problems/create') ? '#38bdf8' : 'rgba(255,255,255,0.7)',
                    textDecoration: 'none',
                    backgroundColor: isActive('/problems/create') ? 'rgba(56,189,248,0.1)' : 'transparent',
                    transition: 'all 150ms ease',
                  }}>{t('nav_create_problem', 'Create Problem')}</Link>
                  <Link href="/my-created-problems" style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontWeight: isActive('/my-created-problems') ? 600 : 400,
                    color: isActive('/my-created-problems') ? '#38bdf8' : 'rgba(255,255,255,0.7)',
                    textDecoration: 'none',
                    backgroundColor: isActive('/my-created-problems') ? 'rgba(56,189,248,0.1)' : 'transparent',
                    transition: 'all 150ms ease',
                  }}>{t('nav_my_created_problems', 'My Problems')}</Link>
                </>
              )}
              {canVerifyProblems && (
                <Link href="/admin/problem-queue" style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  fontWeight: isActive('/admin/problem-queue') ? 600 : 400,
                  color: isActive('/admin/problem-queue') ? '#38bdf8' : 'rgba(255,255,255,0.7)',
                  textDecoration: 'none',
                  backgroundColor: isActive('/admin/problem-queue') ? 'rgba(56,189,248,0.1)' : 'transparent',
                  transition: 'all 150ms ease',
                }}>{t('nav_problem_queue', 'Verification Queue')}</Link>
              )}
              {isAdmin && (
                <Link href="/admin/dashboard" style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  fontWeight: isActive('/admin/dashboard') ? 600 : 400,
                  color: isActive('/admin/dashboard') ? '#38bdf8' : 'rgba(255,255,255,0.7)',
                  textDecoration: 'none',
                  backgroundColor: isActive('/admin/dashboard') ? 'rgba(56,189,248,0.1)' : 'transparent',
                  transition: 'all 150ms ease',
                }}>{t('nav_admin_dashboard', 'Admin Dashboard')}</Link>
              )}
            </>
          )}
        </div>

        {/* Right side: user actions + language */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {auth.isAuthenticated ? (
            <>
              <span style={{
                fontSize: '0.8rem',
                color: 'rgba(255,255,255,0.5)',
                maxWidth: '140px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {auth.user?.username || 'User'}
              </span>
              <button
                onClick={handleLogout}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  color: 'rgba(255,255,255,0.8)',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
              >
                {t('nav_logout', 'Logout')}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" style={{
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 500,
                color: 'rgba(255,255,255,0.8)',
                textDecoration: 'none',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                transition: 'all 150ms ease',
              }}>{t('nav_login', 'Login')}</Link>
              <Link href="/register" style={{
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: '#0f172a',
                textDecoration: 'none',
                background: '#38bdf8',
                border: '1px solid #38bdf8',
                transition: 'all 150ms ease',
              }}>{t('nav_register', 'Register')}</Link>
            </>
          )}

          {/* Language switcher */}
          <div style={{
            display: 'flex',
            gap: '2px',
            marginLeft: '4px',
            padding: '3px',
            background: 'rgba(255,255,255,0.06)',
            borderRadius: '6px',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            {['en', 'ro'].map((lng) => (
              <button
                key={lng}
                onClick={() => changeLanguage(lng)}
                style={{
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: i18n.language === lng ? '#0f172a' : 'rgba(255,255,255,0.5)',
                  background: i18n.language === lng ? '#38bdf8' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  transition: 'all 150ms ease',
                }}
              >
                {lng}
              </button>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
