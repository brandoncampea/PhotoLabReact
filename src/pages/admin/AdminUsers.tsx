import React, { useState, useEffect } from 'react';
import { UserAccount } from '../../types';
import { adminMockApi } from '../../services/adminMockApi';
import { userAdminService } from '../../services/adminService';
import { isUseMockApi } from '../../utils/mockApiConfig';



const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'customer' | 'admin' | 'super_admin' | 'studio_admin'>('all');

  useEffect(() => {
    loadUsers();
    // Set up auto-refresh every 30 seconds
    const interval = setInterval(() => {
      loadUsers(true);
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const loadUsers = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setRefreshing(true);
      const data = isUseMockApi() ? await adminMockApi.users.getAll() : await userAdminService.getAll();
      setUsers(data);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleToggleActive = async (id: number) => {
    try {
      if (isUseMockApi()) {
        await adminMockApi.users.toggleActive(id);
      } else {
        const user = users.find(u => u.id === id);
        if (!user) return;
        await userAdminService.toggleActive(id, user.isActive);
      }
      loadUsers();
    } catch (error) {
      console.error('Failed to toggle user active status:', error);
    }
  };

  const handleChangeRole = async (id: number, newRole: 'customer' | 'admin' | 'super_admin' | 'studio_admin') => {
    const action = `change to ${newRole.replace('_', ' ')}`;
    if (confirm(`Are you sure you want to ${action}?`)) {
      try {
        if (isUseMockApi()) {
          await adminMockApi.users.changeRole(id, newRole);
        } else {
          await userAdminService.changeRole(id, newRole);
        }
        loadUsers();
      } catch (error) {
        console.error('Failed to change user role:', error);
      }
    }
  };

  const filteredUsers = users.filter(user => {
    if (filter === 'all') return true;
    return user.role === filter;
  });

  if (loading) {
    return <div className="loading">Loading user accounts...</div>;
  }

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>User Accounts</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setFilter('all')}
            className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
          >
            All ({users.length})
          </button>
          <button
            onClick={() => setFilter('customer')}
            className={`btn ${filter === 'customer' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
          >
            Customers ({users.filter(u => u.role === 'customer').length})
          </button>
          <button
            onClick={() => setFilter('admin')}
            className={`btn ${filter === 'admin' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
          >
            Admins ({users.filter(u => u.role === 'admin').length})
          </button>
          <button
            onClick={() => setFilter('studio_admin')}
            className={`btn ${filter === 'studio_admin' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
          >
            Studio Admins ({users.filter(u => u.role === 'studio_admin').length})
          </button>
          <button
            onClick={() => setFilter('super_admin')}
            className={`btn ${filter === 'super_admin' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
          >
            Super Admins ({users.filter(u => u.role === 'super_admin').length})
          </button>
          <button
            onClick={() => loadUsers()}
            className="btn btn-secondary"
            disabled={refreshing}
            style={{ fontSize: '0.9rem', padding: '0.5rem 1rem', marginLeft: 'auto' }}
            title="Refresh user list"
          >
            {refreshing ? '⟳ Refreshing...' : '⟳ Refresh'}
          </button>
        </div>
      </div>

      <div className="admin-table">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Registered</th>
              <th>Last Login</th>
              <th>Orders</th>
              <th>Total Spent</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id}>
                <td>{user.firstName} {user.lastName}</td>
                <td>{user.email}</td>
                <td>
                  <select
                    value={user.role}
                    onChange={(e) => handleChangeRole(user.id, e.target.value as 'customer' | 'admin' | 'super_admin' | 'studio_admin')}
                    style={{
                      padding: '0.5rem',
                      borderRadius: '4px',
                      border: '1px solid #ddd',
                      backgroundColor: '#fff',
                      cursor: 'pointer',
                      fontWeight: '500'
                    }}
                  >
                    <option value="customer">👤 Customer</option>
                    <option value="admin">👨‍💼 Admin</option>
                    <option value="studio_admin">🏢 Studio Admin</option>
                    <option value="super_admin">👑 Super Admin</option>
                  </select>
                </td>
                <td>{new Date(user.registeredDate).toLocaleDateString()}</td>
                <td>
                  {user.lastLoginDate
                    ? new Date(user.lastLoginDate).toLocaleDateString()
                    : 'Never'}
                </td>
                <td>{user.totalOrders}</td>
                <td>${user.totalSpent.toFixed(2)}</td>
                <td>
                  <span
                    className={`status-badge ${
                      user.isActive ? 'status-active' : 'status-inactive'
                    }`}
                  >
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <div className="action-buttons">
                    <button
                      onClick={() => handleToggleActive(user.id)}
                      className="btn-icon"
                      title={user.isActive ? 'Deactivate' : 'Activate'}
                    >
                      {user.isActive ? '🔒' : '🔓'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          marginTop: '2rem',
          padding: '1rem',
          backgroundColor: '#f5f5f5',
          borderRadius: '8px',
          fontSize: '0.9rem'
        }}
      >
        <h4 style={{ marginTop: 0 }}>Account Management:</h4>
        <ul style={{ marginBottom: 0, paddingLeft: '1.5rem' }}>
          <li><strong>Role Selector:</strong> Click the dropdown to change user role</li>
          <li><strong>Customer:</strong> Can browse albums and place orders</li>
          <li><strong>Admin:</strong> Can access admin portal and manage content</li>
          <li><strong>Studio Admin:</strong> Can manage their own studio and team</li>
          <li><strong>Super Admin:</strong> Can manage all studios, users, and platform settings</li>
          <li><strong>Deactivate (🔒):</strong> Prevents user from logging in</li>
          <li><strong>Activate (🔓):</strong> Allows user to log in again</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminUsers;
