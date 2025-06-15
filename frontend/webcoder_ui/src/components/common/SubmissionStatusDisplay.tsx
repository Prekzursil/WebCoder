import React from 'react';
import { useTranslation } from 'react-i18next';

interface SubmissionStatusDisplayProps {
  status: string | null;
  error: string | null;
}

const SubmissionStatusDisplay: React.FC<SubmissionStatusDisplayProps> = ({ status, error }) => {
  const { t } = useTranslation();

  if (!status && !error) {
    return null;
  }

  return (
    <div style={{ marginTop: '15px', padding: '10px', borderRadius: '5px', border: '1px solid transparent' }}>
      {status && (
        <p style={{ 
          color: '#155724', // Dark green
          backgroundColor: '#d4edda', // Light green
          borderColor: '#c3e6cb', 
          padding: '10px',
          borderRadius: '5px',
          margin: 0
        }}>
          {status}
        </p>
      )}
      {error && (
        <p style={{ 
          color: '#721c24', // Dark red
          backgroundColor: '#f8d7da', // Light red
          borderColor: '#f5c6cb',
          padding: '10px',
          borderRadius: '5px',
          margin: status ? '10px 0 0 0' : 0 // Add margin top if status is also shown
        }}>
          <strong>{t('error_label', 'Error')}:</strong> {error}
        </p>
      )}
    </div>
  );
};

export default SubmissionStatusDisplay;
