import React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom'; // Import NavLink
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';

const Navbar: React.FC = () => {
  const { i18n, t } = useTranslation();
  const auth = useAuth();
  const navigate = useNavigate();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  const handleLogout = () => {
    auth.logout();
    navigate('/login'); 
  };

  const canCreateProblems = auth.isAuthenticated && auth.user && 
                           ['ADMIN', 'PROBLEM_VERIFIER', 'PROBLEM_CREATOR'].includes(auth.user.role);
  const canVerifyProblems = auth.isAuthenticated && auth.user &&
                           ['ADMIN', 'PROBLEM_VERIFIER'].includes(auth.user.role);
  const isAdmin = auth.isAuthenticated && auth.user && auth.user.role === 'ADMIN';

  const navLinkStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
    marginRight: '15px',
    textDecoration: 'none',
    color: isActive ? '#007bff' : '#333', // Example active color
    fontWeight: isActive ? 'bold' : 'normal',
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
        <Link to="/" style={brandStyle}>{t('app_title', 'WebCoder')}</Link>
        <div className="main-nav-links"> {/* Group for main links */}
          <NavLink to="/" style={navLinkStyle} end>{t('nav_home', 'Home')}</NavLink>
          <NavLink to="/problems" style={navLinkStyle}>{t('nav_problems', 'Problems')}</NavLink>
          {auth.isAuthenticated && (
            <>
              <NavLink to="/my-submissions" style={navLinkStyle}>{t('nav_my_submissions', 'My Submissions')}</NavLink>
              <NavLink to="/profile" style={navLinkStyle}>{t('nav_profile', 'Profile')}</NavLink>
              {canCreateProblems && (
                <>
                  <NavLink to="/problems/create" style={navLinkStyle}>{t('nav_create_problem', 'Create Problem')}</NavLink>
                  <NavLink to="/my-created-problems" style={navLinkStyle}>{t('nav_my_created_problems', 'My Problems')}</NavLink>
                </>
              )}
              {canVerifyProblems && (
                <NavLink to="/admin/problem-queue" style={navLinkStyle}>{t('nav_problem_queue', 'Verification Queue')}</NavLink>
              )}
              {isAdmin && (
                <NavLink to="/admin/dashboard" style={navLinkStyle}>{t('nav_admin_dashboard', 'Admin Dashboard')}</NavLink>
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
            <NavLink to="/login" style={navLinkStyle}>{t('nav_login', 'Login')}</NavLink>
            <NavLink to="/register" style={navLinkStyle}>{t('nav_register', 'Register')}</NavLink>
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
