import React, { useState, useEffect } from 'react';
import { UserAccount } from '../../types';
import { adminMockApi } from '../../services/adminMockApi';
import { userAdminService } from '../../services/adminService';
import { isUseMockApi } from '../../utils/mockApiConfig';



const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'customer' | 'admin'>('all');

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

  const handleChangeRole = async (id: number, role: 'customer' | 'admin') => {
    const action = role === 'admin' ? 'promote to admin' : 'demote to customer';
    if (confirm(`Are you sure you want to ${action}?`)) {
      try {
        if (isUseMockApi()) {
          await adminMockApi.users.changeRole(id, role);
        } else {
          await userAdminService.changeRole(id, role);
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
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
                  <span
                    className="status-badge"
                    style={{
                      backgroundColor: user.role === 'admin' ? '#4169E1' : '#10b981',
                      color: '#fff'
                    }}
                  >
                    {user.role === 'admin' ? '👑 Admin' : '👤 Customer'}
                  </span>
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
                    {user.role === 'customer' ? (
                      <button
                        onClick={() => handleChangeRole(user.id, 'admin')}
                        className="btn-icon"
                        title="Promote to Admin"
                        style={{ fontSize: '1.2rem' }}
                      >
                        ⬆️
                      </button>
                    ) : (
                      <button
                        onClick={() => handleChangeRole(user.id, 'customer')}
                        className="btn-icon"
                        title="Demote to Customer"
                        style={{ fontSize: '1.2rem' }}
                      >
                        ⬇️
                      </button>
                    )}
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
          <li><strong>Promote to Admin (⬆️):</strong> Gives user access to the admin portal</li>
          <li><strong>Demote to Customer (⬇️):</strong> Removes admin access</li>
          <li><strong>Deactivate (🔒):</strong> Prevents user from logging in</li>
          <li><strong>Activate (🔓):</strong> Allows user to log in again</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminUsers;
