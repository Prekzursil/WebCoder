import React, { useState, FormEvent } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthService } from '../../services/ApiService';
import { useAuth } from '../../context/AuthContext';
import { Container, Box, TextField, Button, Typography, Link, Alert, CircularProgress, Divider } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import GitHubIcon from '@mui/icons-material/GitHub';

const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const auth = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await AuthService.login({ username, password });
      if (response && response.access && response.refresh && response.user) {
        auth.login(response.access, response.refresh, response.user);
        navigate('/');
      } else {
        setError(t('login_failed_no_token', 'Login failed: No token received.'));
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || t('login_failed', 'Login failed. Please check your credentials.'));
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
          {t('login_header', 'Login')}
        </Typography>
        {error && <Alert severity="error" sx={{ width: '100%', mt: 2 }}>{error}</Alert>}
        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1 }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="login-username"
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
            name="password"
            label={t('password_label', 'Password')}
            type="password"
            id="login-password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
            disabled={isSubmitting}
          >
            {isSubmitting ? <CircularProgress size={24} /> : t('login_button', 'Login')}
          </Button>
          <Divider sx={{ my: 2 }}>{t('or_login_with', 'Or login with')}</Divider>
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={<GoogleIcon />}
              href="http://127.0.0.1:8000/accounts/google/login/"
            >
              {t('google_login', 'Google')}
            </Button>
            <Button
              variant="outlined"
              startIcon={<GitHubIcon />}
              href="http://127.0.0.1:8000/accounts/github/login/"
            >
              {t('github_login', 'GitHub')}
            </Button>
          </Box>
          <Typography variant="body2" align="center" sx={{ mt: 2 }}>
            {t('no_account_prompt', "Don't have an account?")}{' '}
            <Link component={RouterLink} to="/register" variant="body2">
              {t('register_link_text', 'Register here')}
            </Link>
          </Typography>
        </Box>
      </Box>
    </Container>
  );
};

export default LoginPage;
