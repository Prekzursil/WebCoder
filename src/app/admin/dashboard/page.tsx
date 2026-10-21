'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { AdminService } from '@/services/ApiService';
import { AdminUserType } from '@/types';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ProtectedRoute from '@/components/common/ProtectedRoute';
import SiteStats from './SiteStats';

// Ported from frontend/webcoder_ui/src/pages/admin/AdminDashboardPage.tsx (CRA reference).
// Route: /admin/dashboard (CRA App.tsx:43) — ADMIN only.
//
// Port normalizations:
// - Response envelope: the scaffold ApiService types getUsers() as the direct
//   AdminUserType[] payload (src/types/api.ts:49), so the CRA `response.data`
//   unwrap is dropped (PORT-MAP §0.1).
// - Error contract: the scaffold apiFetch throws plain Error objects with no
//   `.response` property (PORT-MAP §0.2), so the dead err.response-style
//   reads are replaced by a safe `errorMessage` helper over unknown catches.

const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

export function AdminDashboardPage() {
  const { t } = useTranslation();
  const auth = useAuth();

  const [users, setUsers] = useState<AdminUserType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      if (auth.token) {
        try {
          setLoading(true);
          const response = await AdminService.getUsers();
          setUsers(response);
          setError(null);
        } catch (err) {
          setError(errorMessage(err, t('errors.failed_to_fetch_users', 'Failed to fetch users.')));
        } finally {
          setLoading(false);
        }
      }
    };

    fetchUsers();
  }, [auth.token, t]);

  const handleRoleChange = async (userId: number, newRole: string) => {
    if (auth.token) {
      try {
        await AdminService.updateUser(userId, { role: newRole });
        setUsers(users.map(user => (user.id === userId ? { ...user, role: newRole as AdminUserType['role'] } : user)));
        toast.success(t('admin_dashboard.update_role_success', 'Role updated successfully.'));
      } catch (err) {
        toast.error(t('errors.failed_to_update_role', 'Failed to update role: ') + errorMessage(err, ''));
      }
    }
  };

  const handleStatusChange = async (userId: number, isActive: boolean) => {
    if (auth.token) {
      try {
        await AdminService.updateUser(userId, { is_active: isActive });
        setUsers(users.map(user => (user.id === userId ? { ...user, is_active: isActive } : user)));
        toast.success(t('admin_dashboard.update_status_success', 'Status updated successfully.'));
      } catch (err) {
        toast.error(t('errors.failed_to_update_status', 'Failed to update status: ') + errorMessage(err, ''));
      }
    }
  };

  return (
    <div className="page-container">
      <h2>{t('admin_dashboard_header', 'Admin Dashboard')}</h2>

      <section>
        <h3>{t('site_statistics_title', 'Site Statistics')}</h3>
        <SiteStats />
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h3>{t('user_management_title', 'User Management')}</h3>
        {loading && <LoadingSpinner />}
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        {!loading && !error && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>{t('username', 'Username')}</th>
                  <th>{t('email', 'Email')}</th>
                  <th>{t('role', 'Role')}</th>
                  <th>{t('status', 'Status')}</th>
                  <th>{t('date_joined', 'Date Joined')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}>
                    <td>{user.id}</td>
                    <td>{user.username}</td>
                    <td>{user.email}</td>
                    <td>
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        disabled={user.id === auth.user?.id}
                      >
                        <option value="ADMIN">ADMIN</option>
                        <option value="PROBLEM_VERIFIER">PROBLEM_VERIFIER</option>
                        <option value="PROBLEM_CREATOR">PROBLEM_CREATOR</option>
                        <option value="BASIC_USER">BASIC_USER</option>
                      </select>
                    </td>
                    <td>
                      <select
                        value={user.is_active ? 'Active' : 'Inactive'}
                        onChange={(e) => handleStatusChange(user.id, e.target.value === 'Active')}
                        disabled={user.id === auth.user?.id}
                      >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </td>
                    <td>{new Date(user.date_joined).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// Route composition from CRA App.tsx:43 — ADMIN only.
export default function AdminDashboardPageRoute() {
  return (
    <ProtectedRoute roles={['ADMIN']}>
      <AdminDashboardPage />
    </ProtectedRoute>
  );
}
