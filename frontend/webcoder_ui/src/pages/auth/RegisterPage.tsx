import React, { useState, FormEvent } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthService } from '../../services/ApiService';
import { Container, Box, TextField, Button, Typography, Link, Alert, CircularProgress, Divider } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import GitHubIcon from '@mui/icons-material/GitHub';

const RegisterPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

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
      setSuccess(t('registration_successful_redirecting', 'Registration successful! Redirecting to login...'));
      setTimeout(() => navigate('/login'), 2000);
    } catch (err: any) {
      if (err.response?.data && typeof err.response.data === 'object') {
        setError(Object.values(err.response.data).flat().join(' ') || t('registration_failed', 'Registration failed. Please check your input.'));
      } else {
        setError(err.message || t('registration_failed', 'Registration failed. Please try again.'));
      }
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
          {t('register_header', 'Register')}
        </Typography>
        {error && <Alert severity="error" sx={{ width: '100%', mt: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ width: '100%', mt: 2 }}>{success}</Alert>}
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
              href="http://127.0.0.1:8000/api/v1/auth/google/login/"
            >
              {t('google_signup', 'Google')}
            </Button>
            <Button
              variant="outlined"
              startIcon={<GitHubIcon />}
              href="http://127.0.0.1:8000/api/v1/auth/github/login/"
            >
              {t('github_signup', 'GitHub')}
            </Button>
          </Box>
          <Typography variant="body2" align="center" sx={{ mt: 2 }}>
            {t('already_have_account_prompt', 'Already have an account?')}{' '}
            <Link component={RouterLink} to="/login" variant="body2">
              {t('login_link_text', 'Login here')}
            </Link>
          </Typography>
        </Box>
      </Box>
    </Container>
  );
};

export default RegisterPage;
