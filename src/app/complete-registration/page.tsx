'use client';

// Ported from frontend/webcoder_ui/src/pages/auth/CompleteRegistrationPage.tsx
// (CRA reference). Next.js adaptations:
// - react-router `useNavigate` -> next/navigation `useRouter().push`
// - react-router `useLocation().search` -> next/navigation `useSearchParams()`.
//   Next 15 requires components that read `useSearchParams` during static
//   prerender to sit inside a Suspense boundary, so the default export wraps
//   the form in <Suspense> (fallback renders nothing, matching the CRA
//   behavior where the page rendered synchronously from location.search).
// - error handling drops the dead `err.response?.data?.detail` branch:
//   ApiService throws plain `Error` objects (PORT-MAP §0.2), so the catch
//   surfaces err.message directly with an i18n fallback.
// - this page expects `register()` to return {access, refresh, user} while
//   RegisterPage expects {user, message} from the same endpoint — carried over
//   verbatim from the CRA original. UNVERIFIED which shape the DRF backend
//   actually returns (PORT-MAP §6.5 contract note); settling experiment:
//   inspect the DRF users/register/ view or curl it with an OAuth-state email.

import React, { useState, FormEvent, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { AuthService } from '@/services/ApiService';
import type { LoginResponse } from '@/types/api';
import { useAuth } from '@/context/AuthContext';
import {
  Container,
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
} from '@mui/material';





function CompleteRegistrationForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useAuth();
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const email = searchParams.get('email') || '';

  useEffect(() => {
    if (!email) {
      router.push('/login');
    }
  }, [email, router]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = (await AuthService.register({ email, username })) as unknown as
        | LoginResponse
        | undefined;
      if (response && response.access && response.refresh && response.user) {
        auth.login(response.access, response.refresh, response.user);
        router.push('/');
      } else {
        setError(t('registration_completion_failed', 'Failed to complete registration.'));
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : t('registration_completion_failed', 'Failed to complete registration.')
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
          {t('complete_registration_header', 'Complete Your Registration')}
        </Typography>
        {error && (
          <Alert severity="error" sx={{ width: '100%', mt: 2 }}>
            {error}
          </Alert>
        )}
        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1 }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="email"
            label={t('email_label', 'Email Address')}
            name="email"
            autoComplete="email"
            value={email}
            disabled
          />
          <TextField
            margin="normal"
            required
            fullWidth
            id="username"
            label={t('username_label', 'Choose a Username')}
            name="username"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
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
              t('complete_registration_button', 'Complete Registration')
            )}
          </Button>
        </Box>
      </Box>
    </Container>
  );
}

export default function CompleteRegistrationPage() {
  return (
    <Suspense fallback={null}>
      <CompleteRegistrationForm />
    </Suspense>
  );
}
