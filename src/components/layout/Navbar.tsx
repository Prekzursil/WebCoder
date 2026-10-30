'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { NotificationService } from '@/services/ApiService';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import styles from './navbar.module.css';

// Navbar IA rework [SPEC-GAPS A1/A8/F21]:
//  - desktop: brand · global search · Home/Problems/Leaderboard/Forum · bell ·
//    avatar menu (account + role links grouped under the handle, per A8) · lang
//  - below 900px: hamburger opens a drawer holding ALL links + search + lang
//  - every link/menu item is a 44px touch target (A1)
// Role literals intentionally unchanged — vocabulary normalization is F1
// (Wave 3), which will touch these gates together with the backend enum.

interface NavLinkItem {
  href: string;
  label: string;
}

const Navbar: React.FC = () => {
  const { i18n, t } = useTranslation();
  const auth = useAuth();
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // [F10] Real unread badge: GET /notifications/unread-count/ (auth-scoped)
  // on mount and every 60s while authenticated. Best-effort — any failure
  // (401, network, 5xx) simply leaves the badge at its last value.
  useEffect(() => {
    if (!auth.isAuthenticated) {
      setUnreadCount(0);
      return;
    }
    let cancelled = false;
    const poll = () =>
      NotificationService.getUnreadCount()
        .then(({ count }) => {
          if (!cancelled) setUnreadCount(count);
        })
        .catch(() => {
          /* badge stays at its last value */
        });
    poll();
    const interval = setInterval(poll, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [auth.isAuthenticated, auth.user]);

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lng; // [Q5] keep <html lang> in sync
    }
  };

  const handleLogout = () => {
    setMenuOpen(false);
    setDrawerOpen(false);
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

  const primaryLinks: NavLinkItem[] = [
    { href: '/', label: t('nav_home', 'Home') },
    { href: '/problems', label: t('nav_problems', 'Problems') },
    { href: '/contests', label: t('nav_contests', 'Contests') },
    { href: '/ratings', label: t('nav_ratings', 'Ratings') },
    { href: '/leaderboard', label: t('nav_leaderboard', 'Leaderboard') },
    { href: '/forum', label: t('nav_forum', 'Forum') },
    { href: '/blocks', label: t('nav_blocks', 'Blocks') },
  ];

  const accountLinks: NavLinkItem[] = [
    { href: '/classes', label: t('nav_classes', 'My classes') },
    { href: '/profile', label: t('nav_profile', 'Profile') },
    { href: '/my-submissions', label: t('nav_my_submissions', 'My Submissions') },
    { href: '/submission-history', label: t('nav_submission_history', 'History') },
  ];
  const roleLinks: NavLinkItem[] = [
    ...(canCreateProblems ? [
      { href: '/problems/create', label: t('nav_create_problem', 'Create Problem') },
      { href: '/my-created-problems', label: t('nav_my_created_problems', 'My Problems') },
    ] : []),
    ...(canVerifyProblems ? [
      { href: '/admin/problem-queue', label: t('nav_problem_queue', 'Verification Queue') },
    ] : []),
    ...(isAdmin ? [
      { href: '/admin/dashboard', label: t('nav_admin_dashboard', 'Admin Dashboard') },
    ] : []),
  ];

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const q = searchTerm.trim();
    setDrawerOpen(false);
    router.push(q ? `/problems?q=${encodeURIComponent(q)}` : '/problems');
  };

  // Global '/' shortcut focuses the search box [F21].
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return;
      if (!searchRef.current) return;
      event.preventDefault();
      searchRef.current.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Close the user dropdown on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Close the drawer on Escape.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const renderSearchForm = (idPrefix: string) => (
    <form className={styles.searchForm} onSubmit={submitSearch} role="search" key={idPrefix}>
      <span className={styles.searchIcon} aria-hidden="true"><SearchIcon fontSize="small" /></span>
      <input
        ref={idPrefix === 'nav' ? searchRef : undefined}
        type="search"
        className={styles.searchInput}
        placeholder={t('nav_search_placeholder', 'Search problems…')}
        aria-label={t('nav_search_label', 'Search problems')}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
      <span className={styles.searchKbd} aria-hidden="true">/</span>
    </form>
  );

  const renderLanguageSwitch = () => (
    <div className={styles.langSwitch} role="group" aria-label={t('nav_language_label', 'Language')}>
      {['en', 'ro'].map((lng) => (
        <button
          key={lng}
          onClick={() => changeLanguage(lng)}
          className={`${styles.langBtn} ${i18n.language === lng ? styles.langBtnActive : ''}`}
        >
          {lng}
        </button>
      ))}
    </div>
  );

  return (
    <nav className={styles.bar} aria-label="Main">
      <div className={styles.inner}>
        {/* Mobile hamburger [A1] */}
        <button
          className={styles.hamburger}
          onClick={() => setDrawerOpen(true)}
          aria-label={t('nav_open_menu', 'Open navigation menu')}
          aria-expanded={drawerOpen}
        >
          <MenuIcon />
        </button>

        {/* Brand */}
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark}>W</span>
          {t('app_title', 'WebCoder')}
        </Link>

        {/* Global search [F21] */}
        {renderSearchForm('nav')}

        {/* Desktop primary links */}
        <div className={styles.desktopNav}>
          {primaryLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`nav-link ${isActive(href) ? 'nav-link--active' : ''}`}
              aria-current={isActive(href) ? 'page' : undefined}
            >{label}</Link>
          ))}
        </div>

        {/* Right cluster: bell · avatar menu / login+register · language */}
        <div className={styles.rightCluster}>
          {auth.isAuthenticated ? (
            <>
              <Link
                href="/notifications"
                title={t('nav_notifications', 'Notifications')}
                aria-label={t('nav_notifications', 'Notifications')}
                className={`${styles.iconBtn} ${isActive('/notifications') ? styles.iconBtnActive : ''}`}
              >
                <NotificationsOutlinedIcon fontSize="small" />
                {unreadCount > 0 && (
                  <span className={styles.badge}>{unreadCount}</span>
                )}
              </Link>

              <div className={styles.userWrap} ref={menuRef}>
                <button
                  className={styles.userBtn}
                  onClick={() => setMenuOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label={t('nav_account_menu', 'Account menu')}
                >
                  <AccountCircleOutlinedIcon fontSize="small" />
                  <span className={styles.userBtnName}>
                    {auth.user?.username || t('nav_user_fallback', 'User')}
                  </span>
                </button>

                {menuOpen && (
                  <div className={styles.menu} role="menu">
                    <div className={styles.menuHeader}>
                      <div className={styles.menuHeaderName}>
                        {auth.user?.username || t('nav_user_fallback', 'User')}
                      </div>
                      {auth.user?.role && (
                        <div className={styles.menuHeaderRole}>{auth.user.role}</div>
                      )}
                    </div>
                    <div className={styles.menuLabel} aria-hidden="true">
                      {t('nav_menu_account', 'Account')}
                    </div>
                    {accountLinks.map(({ href, label }) => (
                      <Link key={href} href={href} className={styles.menuLink} role="menuitem" onClick={() => setMenuOpen(false)}>
                        {label}
                      </Link>
                    ))}
                    {roleLinks.length > 0 && (
                      <div className={styles.menuLabel} aria-hidden="true">
                        {t('nav_menu_contributor', 'Contributor')}
                      </div>
                    )}
                    {roleLinks.map(({ href, label }) => (
                      <Link key={href} href={href} className={styles.menuLink} role="menuitem" onClick={() => setMenuOpen(false)}>
                        {label}
                      </Link>
                    ))}
                    <hr className={styles.drawerDivider} />
                    <button className={`${styles.menuLink} ${styles.menuLinkDanger}`} role="menuitem" onClick={handleLogout}>
                      {t('nav_logout', 'Logout')}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link href="/login" className="btn">{t('nav_login', 'Login')}</Link>
              <Link href="/register" className="btn btn--primary">{t('nav_register', 'Register')}</Link>
            </>
          )}

          {renderLanguageSwitch()}
        </div>
      </div>

      {/* Mobile drawer [A1] */}
      {drawerOpen && (
        <>
          <div className={styles.backdrop} onClick={closeDrawer} aria-hidden="true" />
          <aside
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-label={t('nav_menu_label', 'Navigation')}
          >
            <div className={styles.drawerHead}>
              <span className={styles.drawerTitle}>{t('app_title', 'WebCoder')}</span>
              <button
                className={styles.iconBtn}
                onClick={closeDrawer}
                aria-label={t('nav_close_menu', 'Close navigation menu')}
              >
                <CloseIcon fontSize="small" />
              </button>
            </div>

            {renderSearchForm('drawer')}

            {primaryLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`${styles.drawerLink} ${isActive(href) ? styles.drawerLinkActive : ''}`}
                onClick={closeDrawer}
              >{label}</Link>
            ))}

            {auth.isAuthenticated && (
              <>
                <hr className={styles.drawerDivider} />
                {accountLinks.map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className={`${styles.drawerLink} ${isActive(href) ? styles.drawerLinkActive : ''}`}
                    onClick={closeDrawer}
                  >{label}</Link>
                ))}
                {roleLinks.length > 0 && (
                  <div className={styles.drawerSectionLabel} aria-hidden="true">
                    {t('nav_menu_contributor', 'Contributor')}
                  </div>
                )}
                {roleLinks.map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className={`${styles.drawerLink} ${isActive(href) ? styles.drawerLinkActive : ''}`}
                    onClick={closeDrawer}
                  >{label}</Link>
                ))}
                <hr className={styles.drawerDivider} />
                <button
                  className={`${styles.drawerLink} ${styles.menuLinkDanger}`}
                  onClick={handleLogout}
                >
                  {t('nav_logout', 'Logout')}
                </button>
              </>
            )}

            <hr className={styles.drawerDivider} />
            {renderLanguageSwitch()}
          </aside>
        </>
      )}
    </nav>
  );
};

export default Navbar;
