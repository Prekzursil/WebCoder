'use client';

import React, { useEffect, useState } from 'react';
import { AdminService } from '@/services/ApiService';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import type { AdminStatsResponse } from '@/types/api';

// Ported from frontend/webcoder_ui/src/pages/admin/SiteStats.tsx (CRA reference).
// Not a route: embedded by the admin dashboard page (CRA AdminDashboardPage.tsx:67).
//
// Port normalizations:
// - Response envelope: the scaffold ApiService types getStats() as the direct
//   AdminStatsResponse payload (src/types/api.ts:51-55), so the CRA
//   `response.data` unwrap is dropped (PORT-MAP §0.1).
// - The CRA file used Tailwind utility classes with no Tailwind dependency
//   installed (PORT-MAP §0.8) — those classes were inert; replaced with
//   inline styles consistent with the other admin pages.
// - Loading is derived from `stats === null` after the error check instead of
//   a separate flag; the visible behavior (spinner -> stats | error) is
//   identical to the reference.

const cardStyle: React.CSSProperties = {
  background: '#fff',
  padding: '24px',
  borderRadius: '8px',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12)',
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: '1.125rem',
  fontWeight: 500,
  color: '#111827',
  margin: 0,
};

const cardValueStyle: React.CSSProperties = {
  marginTop: '8px',
  fontSize: '1.875rem',
  fontWeight: 700,
  color: '#111827',
};

export default function SiteStats() {
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await AdminService.getStats();
        setStats(response);
      } catch {
        setError('Failed to fetch site statistics.');
      }
    };

    fetchStats();
  }, []);

  if (error) {
    return <div style={{ color: 'red' }}>{error}</div>;
  }

  if (!stats) {
    return <LoadingSpinner />;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
      <div style={cardStyle}>
        <h3 style={cardTitleStyle}>Total Users</h3>
        <p style={cardValueStyle}>{stats.user_count}</p>
      </div>
      <div style={cardStyle}>
        <h3 style={cardTitleStyle}>Total Problems</h3>
        <p style={cardValueStyle}>{stats.problem_count}</p>
      </div>
      <div style={cardStyle}>
        <h3 style={cardTitleStyle}>Total Submissions</h3>
        <p style={cardValueStyle}>{stats.submission_count}</p>
      </div>
    </div>
  );
}
