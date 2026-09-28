'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';

// Ported from frontend/webcoder_ui/src/components/layout/Navbar.tsx (CRA reference).
// Next.js adaptation: react-router-dom Link/NavLink/useNavigate are replaced
// by next/link + usePathname/useRouter. NavLink's isActive styling is derived
// from the current pathname (exact match for "/", prefix match otherwise).

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

  const navLinkStyle = (active: boolean): React.CSSProperties => ({
    marginRight: '15px',
    textDecoration: 'none',
    color: active ? '#0062cc' : '#333', // AA-compliant active color (>=4.5:1 on navbar bg); was #007bff (3.77:1)
    fontWeight: active ? 'bold' : 'normal',
  });

  const brandStyle: React.CSSProperties = {
    marginRight: '25px',
    fontSize: '1.5em',
    fontWeight: 'bold',
    textDecoration: 'none',
    color: '#333'
  };

  return (
    <nav style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '20px',
      padding: '10px 20px', // Added some padding
      borderBottom: '1px solid #eee', // Lighter border
      backgroundColor: '#f8f9fa' // Light background for navbar
    }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <Link href="/" style={brandStyle}>{t('app_title', 'WebCoder')}</Link>
        <div className="main-nav-links"> {/* Group for main links */}
          <Link href="/" style={navLinkStyle(isActive('/'))}>{t('nav_home', 'Home')}</Link>
          <Link href="/problems" style={navLinkStyle(isActive('/problems'))}>{t('nav_problems', 'Problems')}</Link>
          {auth.isAuthenticated && (
            <>
              <Link href="/my-submissions" style={navLinkStyle(isActive('/my-submissions'))}>{t('nav_my_submissions', 'My Submissions')}</Link>
              <Link href="/profile" style={navLinkStyle(isActive('/profile'))}>{t('nav_profile', 'Profile')}</Link>
              {canCreateProblems && (
                <>
                  <Link href="/problems/create" style={navLinkStyle(isActive('/problems/create'))}>{t('nav_create_problem', 'Create Problem')}</Link>
                  <Link href="/my-created-problems" style={navLinkStyle(isActive('/my-created-problems'))}>{t('nav_my_created_problems', 'My Problems')}</Link>
                </>
              )}
              {canVerifyProblems && (
                <Link href="/admin/problem-queue" style={navLinkStyle(isActive('/admin/problem-queue'))}>{t('nav_problem_queue', 'Verification Queue')}</Link>
              )}
              {isAdmin && (
                <Link href="/admin/dashboard" style={navLinkStyle(isActive('/admin/dashboard'))}>{t('nav_admin_dashboard', 'Admin Dashboard')}</Link>
              )}
            </>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }} className="user-actions"> {/* Group for user actions/lang */}
        {auth.isAuthenticated ? (
          <>
            <span style={{ marginRight: '15px', color: '#555' }}>
              {t('nav_welcome_user', 'Welcome, {{username}}!', { username: auth.user?.username || 'User' })}
            </span>
            <button onClick={handleLogout} style={{ marginRight: '15px', padding: '8px 12px' }}>{t('nav_logout', 'Logout')}</button>
          </>
        ) : (
          <>
            <Link href="/login" style={navLinkStyle(isActive('/login'))}>{t('nav_login', 'Login')}</Link>
            <Link href="/register" style={navLinkStyle(isActive('/register'))}>{t('nav_register', 'Register')}</Link>
          </>
        )}
        <div className="language-switcher" style={{ marginLeft: '10px', borderLeft: '1px solid #ddd', paddingLeft: '10px' }}>
          <button onClick={() => changeLanguage('en')} style={{ marginRight: '5px', padding: '5px 8px' }}>EN</button>
          <button onClick={() => changeLanguage('ro')} style={{ padding: '5px 8px' }}>RO</button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
