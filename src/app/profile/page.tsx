'use client';

import React, { useState, FormEvent, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthService } from '@/services/ApiService';
import { useAuth } from '@/context/AuthContext';
import ProtectedRoute from '@/components/common/ProtectedRoute';
import { Box, TextField, Button, Alert, CircularProgress,  } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import GitHubIcon from '@mui/icons-material/GitHub';
import { User } from '@/types';
import { API_BASE_URL } from '@/lib/api-config';
import Link from 'next/link';

const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

// Mock stats for profile display
const MOCK_STATS = {
  solved: 47,
  attempted: 63,
  submissions: 128,
  acceptanceRate: 73,
  streak: 12,
  rank: 24,
  score: 3480,
  easyCount: 22,
  mediumCount: 19,
  hardCount: 6,
};

const MOCK_RECENT = [
  { id: 1042, problemTitle: 'Binary Tree Traversal', verdict: 'AC', language: 'python3', time: '2026-09-28T14:32:00Z' },
  { id: 1041, problemTitle: 'Graph Shortest Path', verdict: 'WA', language: 'cpp17', time: '2026-09-28T11:15:00Z' },
  { id: 1040, problemTitle: 'Two Sum', verdict: 'AC', language: 'python3', time: '2026-09-27T20:05:00Z' },
  { id: 1039, problemTitle: 'Merge Sort', verdict: 'TLE', language: 'java11', time: '2026-09-27T16:44:00Z' },
  { id: 1038, problemTitle: 'Palindrome Check', verdict: 'AC', language: 'python3', time: '2026-09-26T09:30:00Z' },
];

const verdictConfig: Record<string, { color: string; bg: string }> = {
  AC:  { color: '#4ade80', bg: 'rgba(74,222,128,0.12)' },
  WA:  { color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
  TLE: { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
  MLE: { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  CE:  { color: '#fb923c', bg: 'rgba(251,146,60,0.12)' },
};

function StatCard({ label, value, accent, sub }: { label: string; value: string | number; accent?: string; sub?: string }) {
  return (
    <div style={{
      background: '#1e293b',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: '10px',
      padding: '1rem 1.25rem',
      flex: '1 1 120px',
    }}>
      <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: accent ?? '#f1f5f9', letterSpacing: '-0.03em' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '2px' }}>{sub}</div>}
    </div>
  );
}

function ProfileOverview({ user }: { user: User }) {
  const initials = user.username.slice(0, 2).toUpperCase();
  const hue = (user.username.charCodeAt(0) * 37) % 360;

  return (
    <div style={{ marginBottom: '2rem' }}>
      {/* Hero banner */}
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '16px',
        padding: '2rem',
        marginBottom: '1.5rem',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: 0, right: 0, width: '300px', height: '300px',
          background: `radial-gradient(circle at center, hsl(${hue},60%,40%) 0%, transparent 70%)`,
          opacity: 0.08, pointerEvents: 'none',
        }} />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem', flexWrap: 'wrap', position: 'relative' }}>
          {/* Avatar */}
          <div style={{
            width: '72px', height: '72px', borderRadius: '50%',
            background: `hsl(${hue}, 55%, 35%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.5rem', fontWeight: 800, color: '#fff',
            border: '3px solid rgba(255,255,255,0.1)',
            flexShrink: 0,
          }}>{initials}</div>

          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.02em' }}>
                {user.username}
              </h1>
              <span style={{
                padding: '2px 10px', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700,
                color: user.role === 'ADMIN' ? '#f87171' : user.role === 'PROBLEM_CREATOR' ? '#fbbf24' : user.role === 'PROBLEM_VERIFIER' ? '#a78bfa' : '#38bdf8',
                background: user.role === 'ADMIN' ? 'rgba(248,113,113,0.1)' : user.role === 'PROBLEM_CREATOR' ? 'rgba(251,191,36,0.1)' : user.role === 'PROBLEM_VERIFIER' ? 'rgba(167,139,250,0.1)' : 'rgba(56,189,248,0.1)',
                border: `1px solid ${user.role === 'ADMIN' ? 'rgba(248,113,113,0.25)' : user.role === 'PROBLEM_CREATOR' ? 'rgba(251,191,36,0.25)' : user.role === 'PROBLEM_VERIFIER' ? 'rgba(167,139,250,0.25)' : 'rgba(56,189,248,0.25)'}`,
              }}>{user.role.replace('_', ' ')}</span>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1rem' }}>{user.email}</div>

            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fbbf24' }}>#{MOCK_STATS.rank}</div>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Global Rank</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#38bdf8' }}>{MOCK_STATS.score.toLocaleString()}</div>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Score</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#4ade80' }}>{MOCK_STATS.streak}</div>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Day Streak 🔥</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <StatCard label="Problems Solved" value={MOCK_STATS.solved} accent="#4ade80" sub={`of ${MOCK_STATS.attempted} attempted`} />
        <StatCard label="Acceptance Rate" value={`${MOCK_STATS.acceptanceRate}%`} accent="#38bdf8" />
        <StatCard label="Total Submissions" value={MOCK_STATS.submissions} />
      </div>

      {/* Difficulty breakdown */}
      <div style={{
        background: '#1e293b',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '12px',
        padding: '1.25rem 1.5rem',
        marginBottom: '1.5rem',
      }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1rem' }}>
          Solved by Difficulty
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          {[
            { label: 'Easy', count: MOCK_STATS.easyCount, total: 30, color: '#4ade80' },
            { label: 'Medium', count: MOCK_STATS.mediumCount, total: 40, color: '#fbbf24' },
            { label: 'Hard', count: MOCK_STATS.hardCount, total: 20, color: '#f87171' },
          ].map(d => (
            <div key={d.label} style={{ flex: '1 1 120px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.78rem', color: d.color, fontWeight: 600 }}>{d.label}</span>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 700 }}>{d.count}<span style={{ color: '#475569', fontWeight: 400 }}>/{d.total}</span></span>
              </div>
              <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(d.count / d.total) * 100}%`, background: d.color, borderRadius: '999px', transition: 'width 600ms ease' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent submissions */}
      <div style={{
        background: '#1e293b',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '12px',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Recent Submissions
          </span>
          <Link href="/submission-history" style={{ fontSize: '0.75rem', color: '#38bdf8', textDecoration: 'none' }}>View all →</Link>
        </div>
        <div>
          {MOCK_RECENT.map(s => {
            const vcfg = verdictConfig[s.verdict] ?? { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' };
            return (
              <div key={s.id} style={{
                padding: '0.875rem 1.5rem',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
              }}>
                <span style={{
                  padding: '2px 8px', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700,
                  color: vcfg.color, background: vcfg.bg, minWidth: '36px', textAlign: 'center',
                }}>{s.verdict}</span>
                <Link href={`/submissions/${s.id}`} style={{ color: '#f1f5f9', fontSize: '0.875rem', fontWeight: 500, flex: 1, minWidth: '120px' }}>
                  {s.problemTitle}
                </Link>
                <span style={{ fontSize: '0.72rem', color: '#475569', fontFamily: 'monospace' }}>{s.language}</span>
                <span style={{ fontSize: '0.72rem', color: '#334155', marginLeft: 'auto' }}>
                  {new Date(s.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function UserProfilePage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'settings'>('overview');

  useEffect(() => {
    const fetchUserProfile = async () => {
      setError(null);
      try {
        const userData = await AuthService.getMe();
        setProfileUser(userData);
      } catch {
        setError(t('failed_to_load_profile', 'Failed to load user profile.'));
      }
    };
    fetchUserProfile();
  }, [t]);

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (newPassword !== confirmNewPassword) {
      setError(t('passwords_do_not_match', 'Passwords do not match.'));
      return;
    }
    if (!auth.token) {
      setError(t('must_be_logged_in', 'You must be logged in to change your password.'));
      return;
    }
    setIsSubmitting(true);
    try {
      await AuthService.changePassword({
        old_password: currentPassword,
        new_password1: newPassword,
        new_password2: confirmNewPassword,
      });
      setMessage(t('password_change_successful', 'Password changed successfully.'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      setError(errorMessage(err, t('password_change_failed', 'Password change failed.')));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (error && !profileUser) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!profileUser) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <CircularProgress />
      </div>
    );
  }

  const apiBase = API_BASE_URL;

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.04)',
        borderRadius: '10px', padding: '4px', marginBottom: '2rem',
        width: 'fit-content',
      }}>
        {(['overview', 'settings'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '8px 20px', borderRadius: '7px', fontSize: '0.85rem', fontWeight: 600,
            border: 'none', cursor: 'pointer', transition: 'all 150ms ease',
            background: activeTab === tab ? '#38bdf8' : 'transparent',
            color: activeTab === tab ? '#0f172a' : '#64748b',
            textTransform: 'capitalize',
          }}>{tab}</button>
        ))}
      </div>

      {activeTab === 'overview' && <ProfileOverview user={profileUser} />}

      {activeTab === 'settings' && (
        <div style={{ maxWidth: '600px' }}>
          {/* User info card */}
          <div style={{
            background: '#1e293b',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
          }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1rem' }}>
              Account Info
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[
                { label: 'Username', value: profileUser.username },
                { label: 'Email', value: profileUser.email },
                { label: 'Role', value: profileUser.role.replace('_', ' ') },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{item.label}</span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f1f5f9' }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Connected accounts */}
          <div style={{
            background: '#1e293b',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
          }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1rem' }}>
              {t('connected_accounts_header', 'Connected Accounts')}
            </div>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button variant="outlined" startIcon={<GoogleIcon />} href={`${apiBase}/api/v1/auth/google/login/?process=connect`} size="small">
                {t('connect_google', 'Connect Google')}
              </Button>
              <Button variant="outlined" startIcon={<GitHubIcon />} href={`${apiBase}/api/v1/auth/github/login/?process=connect`} size="small">
                {t('connect_github', 'Connect GitHub')}
              </Button>
            </Box>
          </div>

          {/* Change password */}
          <div style={{
            background: '#1e293b',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '12px',
            padding: '1.5rem',
          }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1rem' }}>
              {t('change_password_header', 'Change Password')}
            </div>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
            <Box component="form" onSubmit={handleChangePassword} noValidate>
              <TextField margin="normal" required fullWidth name="currentPassword" label={t('current_password_label', 'Current Password')} type="password" id="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
              <TextField margin="normal" required fullWidth name="newPassword" label={t('new_password_label', 'New Password')} type="password" id="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              <TextField margin="normal" required fullWidth name="confirmNewPassword" label={t('confirm_new_password_label', 'Confirm New Password')} type="password" id="confirm-new-password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} />
              <Button type="submit" fullWidth variant="contained" sx={{ mt: 3, mb: 2 }} disabled={isSubmitting}>
                {isSubmitting ? <CircularProgress size={24} /> : t('change_password_button', 'Change Password')}
              </Button>
            </Box>
          </div>
        </div>
      )}
    </div>
  );
}

export default function UserProfilePageRoute() {
  return (
    <ProtectedRoute roles={['ADMIN', 'PROBLEM_CREATOR', 'PROBLEM_VERIFIER', 'BASIC_USER']}>
      <UserProfilePage />
    </ProtectedRoute>
  );
}
