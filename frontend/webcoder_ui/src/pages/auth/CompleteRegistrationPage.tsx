import React, { useState, FormEvent, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthService } from '../../services/ApiService';
import { useAuth } from '../../context/AuthContext';
import { Container, Box, TextField, Button, Typography, Alert, CircularProgress } from '@mui/material';

const CompleteRegistrationPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const queryParams = new URLSearchParams(location.search);
  const email = queryParams.get('email') || '';

  useEffect(() => {
    if (!email) {
      navigate('/login');
    }
  }, [email, navigate]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await AuthService.register({ email, username });
      if (response && response.access && response.refresh && response.user) {
        auth.login(response.access, response.refresh, response.user);
        navigate('/');
      } else {
        setError(t('registration_completion_failed', 'Failed to complete registration.'));
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || t('registration_completion_failed', 'Failed to complete registration.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Container component="main" maxWidth="xs">
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
        {error && <Alert severity="error" sx={{ width: '100%', mt: 2 }}>{error}</Alert>}
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
            {isSubmitting ? <CircularProgress size={24} /> : t('complete_registration_button', 'Complete Registration')}
          </Button>
        </Box>
      </Box>
    </Container>
  );
};

export default CompleteRegistrationPage;
