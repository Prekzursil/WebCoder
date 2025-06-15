import React from 'react';
import { useTranslation } from 'react-i18next';
import { Container, Typography, Button, Box } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const HomePage: React.FC = () => {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  return (
    <Container maxWidth="md">
      <Box
        sx={{
          my: 4,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <Typography variant="h2" component="h1" gutterBottom>
          {t('welcome_message', 'Welcome to WebCoder')}
        </Typography>
        <Typography variant="h5" component="h2" color="text.secondary" paragraph>
          {t('homepage_subtitle', 'The ultimate platform for competitive programming.')}
        </Typography>
        <Typography variant="body1" paragraph>
          {t('homepage_description', 'Sharpen your skills, solve challenging problems, and compete with a community of developers from around the world. Whether you are a beginner or an expert, WebCoder has something for you.')}
        </Typography>
        <Box sx={{ mt: 4 }}>
          <Button
            variant="contained"
            color="primary"
            size="large"
            component={RouterLink}
            to="/problems"
            sx={{ mr: 2 }}
          >
            {t('view_problems_button', 'View Problems')}
          </Button>
          {!isAuthenticated && (
            <Button
              variant="outlined"
              color="primary"
              size="large"
              component={RouterLink}
              to="/register"
            >
              {t('register_button', 'Sign Up')}
            </Button>
          )}
        </Box>
      </Box>
    </Container>
  );
};

export default HomePage;
