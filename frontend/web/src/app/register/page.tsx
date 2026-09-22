'use client';

// Ported from frontend/webcoder_ui/src/pages/auth/RegisterPage.tsx (CRA reference).
// Next.js adaptations:
// - react-router `useNavigate` -> next/navigation `useRouter().push`
// - react-router `Link` -> next/link for the /login link
// - social-signup host comes from NEXT_PUBLIC_API_BASE instead of the
//   hardcoded http://127.0.0.1:8000 (docs/PORT-MAP.md §0.3/§8.5). The
//   /api/v1/auth/... path prefix is preserved from the CRA original — UNVERIFIED
//   whether the backend serves /api/v1/auth/... or /accounts/... for social
//   signup (PORT-MAP §0.3 inconsistency note); settling experiment: inspect
//   backend urls.py.
// - error handling drops the dead `err.response?.data` flatten branch:
//   ApiService throws plain `Error` objects (PORT-MAP §0.2), so the catch
//   surfaces err.message directly with an i18n fallback.

import React, { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import NextLink from 'next/link';
import { useTranslation } from 'react-i18next';
import { AuthService } from '@/services/ApiService';
import {
  Container,
  Box,
  TextField,
  Button,
  Typography,
  Link,
  Alert,
  CircularProgress,
  Divider,
} from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import GitHubIcon from '@mui/icons-material/GitHub';

const RegisterPage: React.FC = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000';

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (password !== password2) {
      setError(t('passwords_do_not_match', 'Passwords do not match.'));
      return;
    }
    setIsSubmitting(true);
    try {
      await AuthService.register({ username, email, password, password2 });
      setSuccess(
        t('registration_successful_redirecting', 'Registration successful! Redirecting to login...')
      );
      setTimeout(() => router.push('/login'), 2000);
    } catch (err: unknown) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : t('registration_failed', 'Registration failed. Please try again.')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Container maxWidth="xs">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Typography component="h1" variant="h5">
          {t('register_header', 'Register')}
        </Typography>
        {error && (
          <Alert severity="error" sx={{ width: '100%', mt: 2 }}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ width: '100%', mt: 2 }}>
            {success}
          </Alert>
        )}
        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1 }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="username"
            label={t('username_label', 'Username')}
            name="username"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            id="email"
            label={t('email_label', 'Email Address')}
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="password"
            label={t('password_label', 'Password')}
            type="password"
            id="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="password2"
            label={t('confirm_password_label', 'Confirm Password')}
            type="password"
            id="password2"
            autoComplete="new-password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
            disabled={isSubmitting}
          >
            {isSubmitting ? <CircularProgress size={24} /> : t('register_button', 'Register')}
          </Button>
          <Divider sx={{ my: 2 }}>{t('or_signup_with', 'Or sign up with:')}</Divider>
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={<GoogleIcon />}
              href={`${apiBase}/api/v1/auth/google/login/`}
            >
              {t('google_signup', 'Google')}
            </Button>
            <Button
              variant="outlined"
              startIcon={<GitHubIcon />}
              href={`${apiBase}/api/v1/auth/github/login/`}
            >
              {t('github_signup', 'GitHub')}
            </Button>
          </Box>
          <Typography variant="body2" align="center" sx={{ mt: 2 }}>
            {t('already_have_account_prompt', 'Already have an account?')}{' '}
            <Link component={NextLink} href="/login" variant="body2">
              {t('login_link_text', 'Login here')}
            </Link>
          </Typography>
        </Box>
      </Box>
    </Container>
  );
};

export default RegisterPage;
