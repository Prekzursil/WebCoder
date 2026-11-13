'use client';

// [ONB-1 / round-2 Wave A] Password-reset confirm step — the landing page
// for the link the reset email carries (/reset-password?uid=...&token=...).
// POST /auth/password/reset/confirm/ {uid, token, new_password1,
// new_password2} (dj-rest-auth default include). A bad or expired pair is
// the expected failure mode (tokens are single-use and PASSWORD_RESET_TIMEOUT
// bounds their life), so that state routes the user back to the request
// page instead of a raw API error.

import React, { useState, FormEvent, Suspense } from 'react';
import NextLink from 'next/link';
import { useSearchParams } from 'next/navigation';
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
} from '@mui/material';

function ResetPasswordForm(): React.ReactElement {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const uid = searchParams.get('uid') ?? '';
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [invalidLink, setInvalidLink] = useState(!uid || !token);
  const [done, setDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t('reset_password_mismatch', 'The two passwords do not match.'));
      return;
    }
    setIsSubmitting(true);
    try {
      await AuthService.confirmPasswordReset(uid, token, password, confirm);
      setDone(true);
    } catch (err: unknown) {
      // dj-rest-auth answers 400 with uid/token/new_password1 errors for a
      // bad pair or a validator rejection — either way the user needs a
      // fresh link or a different password, so route to the link-expired
      // copy with the API detail appended when present.
      const detail = err instanceof Error && err.message ? err.message : '';
      setInvalidLink(true);
      setError(
        detail ||
          t(
            'reset_password_invalid',
            'This reset link is invalid or has expired. Request a new one.',
          ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (done) {
    return (
      <Alert severity="success" sx={{ width: '100%', mt: 3 }} data-testid="reset-password-done">
        {t('reset_password_done', 'Password updated. You can log in with it now.')}{' '}
        <Link component={NextLink} href="/login" sx={{ cursor: 'pointer' }}>
          {t('forgot_password_back', 'Back to login')}
        </Link>
      </Alert>
    );
  }

  if (invalidLink) {
    return (
      <Alert severity="error" sx={{ width: '100%', mt: 3 }} data-testid="reset-password-invalid">
        {error ||
          t(
            'reset_password_invalid',
            'This reset link is invalid or has expired. Request a new one.',
          )}{' '}
        <Link component={NextLink} href="/forgot-password" sx={{ cursor: 'pointer' }}>
          {t('reset_password_request_new', 'Request a new link')}
        </Link>
      </Alert>
    );
  }

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1, width: '100%' }}>
      {error && (
        <Alert severity="error" sx={{ width: '100%', mb: 2 }} data-testid="reset-password-error">
          {error}
        </Alert>
      )}
      <TextField
        margin="normal"
        required
        fullWidth
        name="new-password"
        label={t('reset_password_new_label', 'New password')}
        type="password"
        id="reset-password-new"
        autoComplete="new-password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <TextField
        margin="normal"
        required
        fullWidth
        name="confirm-password"
        label={t('reset_password_confirm_label', 'Confirm new password')}
        type="password"
        id="reset-password-confirm"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      <Button
        type="submit"
        fullWidth
        variant="contained"
        sx={{ mt: 3, mb: 2 }}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <CircularProgress size={24} />
        ) : (
          t('reset_password_button', 'Set new password')
        )}
      </Button>
    </Box>
  );
}

const ResetPasswordPage: React.FC = () => {
  const { t } = useTranslation();
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
          {t('reset_password_title', 'Choose a new password')}
        </Typography>
        {/* useSearchParams needs a Suspense boundary in a client page or
            Next.js bails the prerender (missing-useSearchParams build error). */}
        <Suspense
          fallback={
            <Box sx={{ mt: 3 }}>
              <CircularProgress size={24} />
            </Box>
          }
        >
          <ResetPasswordForm />
        </Suspense>
      </Box>
    </Container>
  );
};

export default ResetPasswordPage;
