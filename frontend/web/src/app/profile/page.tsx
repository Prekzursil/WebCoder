'use client';

import React, { useState, FormEvent, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthService } from '@/services/ApiService';
import { useAuth } from '@/context/AuthContext';
import ProtectedRoute from '@/components/common/ProtectedRoute';
import {
  Container,
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Divider,
  Paper,
} from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import GitHubIcon from '@mui/icons-material/GitHub';
import { User } from '@/types';

// Ported from frontend/webcoder_ui/src/pages/user/UserProfilePage.tsx (CRA reference).
// Route: /profile (CRA App.tsx:45) — all four roles.
//
// Port normalizations:
// - The CRA :userId branch was unreachable (the route is /profile only and no
//  route supplies a param — PORT-MAP §6.12); useParams and the getUser()
//  branch are dropped. The page always shows the logged-in user's own
//  profile, so `isOwnProfile` is constant true and the Connected Accounts +
//  Change Password sections render unconditionally.
// - Error contract: dead err.response?.data reads replaced by a safe
//  `errorMessage` helper over unknown catches (PORT-MAP §0.2). As in the
//  reference, any error (fetch or password change) takes over the page via
//  the top-level early-return Alert.
// - The duplicated in-form `{error && ...}` alert was unreachable in the
//  reference (the top-level early return at CRA :87 fires first); only the
//  shared top-level alert is kept.
// - Social-connect hrefs are built from NEXT_PUBLIC_API_BASE instead of the
//  hardcoded 127.0.0.1 (PORT-MAP §0.3), matching the scaffold ApiService.

const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

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

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!profileUser) {
    return <CircularProgress />;
  }

  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000';

  return (
    <Container maxWidth="md">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          {t('user_profile_header', 'User Profile')}
        </Typography>
        <Paper sx={{ p: 2, mb: 4 }}>
          <Typography>
            <strong>{t('username_label', 'Username')}:</strong> {profileUser.username}
          </Typography>
          <Typography>
            <strong>{t('email_label', 'Email')}:</strong> {profileUser.email}
          </Typography>
          <Typography>
            <strong>{t('role_label', 'Role')}:</strong>{' '}
            {t(`user_role_${profileUser.role.toLowerCase()}`, profileUser.role)}
          </Typography>
        </Paper>

        <Divider sx={{ my: 4 }} />

        <Typography variant="h5" component="h2" gutterBottom>
          {t('connected_accounts_header', 'Connected Accounts')}
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 4 }}>
          <Button
            variant="outlined"
            startIcon={<GoogleIcon />}
            href={`${apiBase}/api/v1/auth/google/login/?process=connect`}
          >
            {t('connect_google', 'Connect Google')}
          </Button>
          <Button
            variant="outlined"
            startIcon={<GitHubIcon />}
            href={`${apiBase}/api/v1/auth/github/login/?process=connect`}
          >
            {t('connect_github', 'Connect GitHub')}
          </Button>
        </Box>

        <Divider sx={{ my: 4 }} />

        <Typography variant="h5" component="h2" gutterBottom>
          {t('change_password_header', 'Change Password')}
        </Typography>
        {message && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {message}
          </Alert>
        )}
        <Box component="form" onSubmit={handleChangePassword} noValidate>
          <TextField
            margin="normal"
            required
            fullWidth
            name="currentPassword"
            label={t('current_password_label', 'Current Password')}
            type="password"
            id="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="newPassword"
            label={t('new_password_label', 'New Password')}
            type="password"
            id="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="confirmNewPassword"
            label={t('confirm_new_password_label', 'Confirm New Password')}
            type="password"
            id="confirm-new-password"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
          />
          <Button type="submit" fullWidth variant="contained" sx={{ mt: 3, mb: 2 }} disabled={isSubmitting}>
            {isSubmitting ? <CircularProgress size={24} /> : t('change_password_button', 'Change Password')}
          </Button>
        </Box>
      </Box>
    </Container>
  );
}

// Route composition from CRA App.tsx:45 — any authenticated role.
export default function UserProfilePageRoute() {
  return (
    <ProtectedRoute roles={['ADMIN', 'PROBLEM_CREATOR', 'PROBLEM_VERIFIER', 'BASIC_USER']}>
      <UserProfilePage />
    </ProtectedRoute>
  );
}
