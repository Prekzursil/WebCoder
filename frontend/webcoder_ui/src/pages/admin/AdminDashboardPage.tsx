import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { AdminService } from '../../services/ApiService';
import { AdminUserType } from '../../types';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import SiteStats from './SiteStats';

const AdminDashboardPage: React.FC = () => {
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
          const response: any = await AdminService.getUsers();
          setUsers(response.data);
          setError(null);
        } catch (err: any) {
          setError(err.message || t('errors.failed_to_fetch_users', 'Failed to fetch users.'));
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
            setUsers(users.map(user => user.id === userId ? { ...user, role: newRole as AdminUserType['role'] } : user));
            toast.success(t('admin_dashboard.update_role_success', 'Role updated successfully.'));
        } catch (err: any) {
            toast.error(t('errors.failed_to_update_role', 'Failed to update role: ') + err.message);
        }
    }
  };

  const handleStatusChange = async (userId: number, isActive: boolean) => {
    if (auth.token) {
        try {
            await AdminService.updateUser(userId, { is_active: isActive });
            setUsers(users.map(user => user.id === userId ? { ...user, is_active: isActive } : user));
            toast.success(t('admin_dashboard.update_status_success', 'Status updated successfully.'));
        } catch (err: any) {
            toast.error(t('errors.failed_to_update_status', 'Failed to update status: ') + err.message);
        }
    }
  };

  return (
    <div>
      <h2>{t('admin_dashboard_header', 'Admin Dashboard')}</h2>
      
      <section>
        <h3>{t('site_statistics_title', 'Site Statistics')}</h3>
        <SiteStats />
      </section>

      <section>
        <h3>{t('user_management_title', 'User Management')}</h3>
        {loading && <LoadingSpinner />}
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {!loading && !error && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #333' }}>
                <th style={{ textAlign: 'left', padding: '8px' }}>ID</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>{t('username', 'Username')}</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>{t('email', 'Email')}</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>{t('role', 'Role')}</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>{t('status', 'Status')}</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>{t('date_joined', 'Date Joined')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: '8px' }}>{user.id}</td>
                  <td style={{ padding: '8px' }}>{user.username}</td>
                  <td style={{ padding: '8px' }}>{user.email}</td>
                  <td style={{ padding: '8px' }}>
                    <select 
                      value={user.role} 
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      disabled={user.id === auth.user?.id} // Prevent admin from changing their own role
                    >
                      <option value="ADMIN">ADMIN</option>
                      <option value="PROBLEM_VERIFIER">PROBLEM_VERIFIER</option>
                      <option value="PROBLEM_CREATOR">PROBLEM_CREATOR</option>
                      <option value="BASIC_USER">BASIC_USER</option>
                    </select>
                  </td>
                  <td style={{ padding: '8px' }}>
                    <select 
                      value={user.is_active ? 'Active' : 'Inactive'}
                      onChange={(e) => handleStatusChange(user.id, e.target.value === 'Active')}
                      disabled={user.id === auth.user?.id} // Prevent admin from deactivating themselves
                      style={{ backgroundColor: user.is_active ? '#d4edda' : '#f8d7da' }}
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </td>
                  <td style={{ padding: '8px' }}>{new Date(user.date_joined).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
};

export default AdminDashboardPage;
