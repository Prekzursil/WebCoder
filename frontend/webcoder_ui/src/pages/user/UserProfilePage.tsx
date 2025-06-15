import React, { useState, FormEvent, useEffect } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthService } from '../../services/ApiService';
import { useAuth } from '../../context/AuthContext';
import { Container, Box, TextField, Button, Typography, Link, Alert, CircularProgress, Divider, Paper } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import GitHubIcon from '@mui/icons-material/GitHub';
import { User } from '../../types';

const UserProfilePage: React.FC = () => {
  const { t } = useTranslation();
  const { userId } = useParams<{ userId: string }>();
  const auth = useAuth();
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    const fetchUserProfile = async () => {
      setIsLoading(true);
      setError(null);
      try {
        let userData: User;
        if (userId) {
          // Fetch a specific user's profile
          userData = await AuthService.getUser(userId);
        } else if (auth.user) {
          // Fetch the logged-in user's profile if no ID is in the URL
          userData = await AuthService.getMe();
        } else {
          setIsLoading(false);
          return;
        }
        setProfileUser(userData);
      } catch (err: any) {
        setError(t('failed_to_load_profile', 'Failed to load user profile.'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserProfile();
  }, [userId, auth.user, t]);

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
      await AuthService.changePassword({ old_password: currentPassword, new_password1: newPassword, new_password2: confirmNewPassword });
      setMessage(t('password_change_successful', 'Password changed successfully.'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err: any) {
      if (err.response?.data && typeof err.response.data === 'object') {
        setError(Object.entries(err.response.data).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`).join('; ') || t('password_change_failed', 'Password change failed.'));
      } else {
        setError(err.message || t('password_change_failed', 'Password change failed.'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const isOwnProfile = !userId || (auth.user && auth.user.id.toString() === userId);

  if (isLoading) {
    return <CircularProgress />;
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!profileUser) {
    return (
      <Container maxWidth="sm">
        <Typography variant="h6" align="center" sx={{ mt: 4 }}>
          {t('user_not_found', 'User not found.')}
        </Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="md">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          {t('user_profile_header', 'User Profile')}
        </Typography>
        <Paper sx={{ p: 2, mb: 4 }}>
          <Typography><strong>{t('username_label', 'Username')}:</strong> {profileUser.username}</Typography>
          <Typography><strong>{t('email_label', 'Email')}:</strong> {profileUser.email}</Typography>
          <Typography><strong>{t('role_label', 'Role')}:</strong> {t(`user_role_${profileUser.role.toLowerCase()}`, profileUser.role)}</Typography>
        </Paper>

        {isOwnProfile && (
          <>
            <Divider sx={{ my: 4 }} />

            <Typography variant="h5" component="h2" gutterBottom>
              {t('connected_accounts_header', 'Connected Accounts')}
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, mb: 4 }}>
              <Button
                variant="outlined"
                startIcon={<GoogleIcon />}
                href="http://127.0.0.1:8000/api/v1/auth/google/login/?process=connect"
              >
                {t('connect_google', 'Connect Google')}
              </Button>
              <Button
                variant="outlined"
                startIcon={<GitHubIcon />}
                href="http://127.0.0.1:8000/api/v1/auth/github/login/?process=connect"
              >
                {t('connect_github', 'Connect GitHub')}
              </Button>
            </Box>

            <Divider sx={{ my: 4 }} />

            <Typography variant="h5" component="h2" gutterBottom>
              {t('change_password_header', 'Change Password')}
            </Typography>
            {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
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
              <Button
                type="submit"
                fullWidth
                variant="contained"
                sx={{ mt: 3, mb: 2 }}
                disabled={isSubmitting}
              >
                {isSubmitting ? <CircularProgress size={24} /> : t('change_password_button', 'Change Password')}
              </Button>
            </Box>
          </>
        )}
      </Box>
    </Container>
  );
};

export default UserProfilePage;
