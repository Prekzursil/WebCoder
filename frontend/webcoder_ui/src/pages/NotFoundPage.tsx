import React from 'react';
import { useTranslation } from 'react-i18next';

interface NotFoundPageProps {
  message?: string;
}

const NotFoundPage: React.FC<NotFoundPageProps> = ({ message }) => {
  const { t } = useTranslation();

  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      <h2>{message || t('not_found_default_header', '404 - Page Not Found')}</h2>
      <p>{t('not_found_default_message', 'The page you are looking for does not exist or you may not have permission to view it.')}</p>
    </div>
  );
};

export default NotFoundPage;
