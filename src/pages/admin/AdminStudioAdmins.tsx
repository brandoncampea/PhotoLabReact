import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import '../../AdminStyles.css';

interface StudioAdmin {
  id: number;
  email: string;
  name: string;
  role: 'studio_admin' | 'super_admin';
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string;
  studioId: number;
  studioName: string;
}

interface Studio {
  id: number;
  name: string;
  email: string;
}

const AdminStudioAdmins: React.FC = () => {
  const { user } = useAuth();
  const [studios, setStudios] = useState<Studio[]>([]);
  const [selectedStudio, setSelectedStudio] = useState<Studio | null>(null);
  const [admins, setAdmins] = useState<StudioAdmin[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    role: 'studio_admin' as 'studio_admin' | 'super_admin'
  });

  useEffect(() => {
    if (user?.role === 'super_admin') {
      fetchStudios();
    }
  }, [user]);

  const fetchStudios = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/studios', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setStudios(data);
        if (data.length > 0) {
          setSelectedStudio(data[0]);
          fetchAdmins(data[0].id);
        }
      }
    } catch (err: any) {
      setError('Failed to load studios');
    } finally {
      setLoading(false);
    }
  };

  const fetchAdmins = async (studioId: number) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(`/api/studios/${studioId}/admins`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setAdmins(data);
        setError('');
      } else {
        setError('Failed to load studio admins');
      }
    } catch (err: any) {
      setError('Failed to load studio admins');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectStudio = (studio: Studio) => {
    setSelectedStudio(studio);
    setShowAddForm(false);
    setFormData({ email: '', name: '', role: 'studio_admin' });
    fetchAdmins(studio.id);
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudio) return;

    if (!formData.email || !formData.name) {
      setError('Email and name are required');
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(`/api/studios/${selectedStudio.id}/admins`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        const data = await response.json();
        setSuccess(`${formData.role} created successfully. Temporary password: ${data.admin.temporaryPassword}`);
        setFormData({ email: '', name: '', role: 'studio_admin' });
        setShowAddForm(false);
        fetchAdmins(selectedStudio.id);
        setTimeout(() => setSuccess(''), 5000);
      } else {
        const errData = await response.json();
        setError(errData.error || 'Failed to create admin');
      }
    } catch (err: any) {
      setError('Failed to create admin');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAdmin = async (adminId: number, adminEmail: string) => {
    if (!selectedStudio) return;

    if (!confirm(`Are you sure you want to delete ${adminEmail}? This action cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(`/api/studios/${selectedStudio.id}/admins/${adminId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        setSuccess('Admin deleted successfully');
        fetchAdmins(selectedStudio.id);
        setTimeout(() => setSuccess(''), 5000);
      } else {
        const errData = await response.json();
        setError(errData.error || 'Failed to delete admin');
      }
    } catch (err: any) {
      setError('Failed to delete admin');
    } finally {
      setLoading(false);
    }
  };

  if (user?.role !== 'super_admin') {
    return (
      <div className="admin-page">
        <div style={{ padding: '20px', color: '#d32f2f' }}>
          Access denied. Super admin only.
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>Studio Admins Management</h1>
        <p>Manage studio administrators across all studios</p>
      </div>

      {error && (
        <div style={{
          padding: '12px',
          marginBottom: '16px',
          backgroundColor: '#ffebee',
          color: '#d32f2f',
          borderRadius: '4px',
          border: '1px solid #d32f2f'
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          padding: '12px',
          marginBottom: '16px',
          backgroundColor: '#e8f5e9',
          color: '#2e7d32',
          borderRadius: '4px',
          border: '1px solid #2e7d32'
        }}>
          {success}
        </div>
      )}

      {/* Studio Selector */}
      <div style={{
        marginBottom: '24px',
        padding: '16px',
        backgroundColor: '#f5f5f5',
        borderRadius: '8px'
      }}>
        <h3 style={{ marginTop: 0 }}>Select Studio</h3>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {studios.map(studio => (
            <button
              key={studio.id}
              onClick={() => handleSelectStudio(studio)}
              style={{
                padding: '10px 16px',
                border: '2px solid',
                borderColor: selectedStudio?.id === studio.id ? '#1976d2' : '#ddd',
                backgroundColor: selectedStudio?.id === studio.id ? '#e3f2fd' : '#fff',
                color: selectedStudio?.id === studio.id ? '#1976d2' : '#666',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: selectedStudio?.id === studio.id ? '600' : '400',
                transition: 'all 0.2s'
              }}
            >
              {studio.name}
            </button>
          ))}
        </div>
      </div>

      {selectedStudio && (
        <div>
          {/* Add New Admin Button */}
          <div style={{ marginBottom: '24px' }}>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              style={{
                padding: '10px 16px',
                backgroundColor: '#1976d2',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                transition: 'background-color 0.2s'
              }}
            >
              {showAddForm ? '✕ Cancel' : '+ Add New Admin'}
            </button>
          </div>

          {/* Add Admin Form */}
          {showAddForm && (
            <div style={{
              marginBottom: '24px',
              padding: '16px',
              backgroundColor: '#f9f9f9',
              border: '1px solid #ddd',
              borderRadius: '8px'
            }}>
              <h3 style={{ marginTop: 0 }}>Create New Studio Admin</h3>
              <form onSubmit={handleAddAdmin}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                    placeholder="admin@example.com"
                    required
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                    Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                    placeholder="Admin Name"
                    required
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                    Role
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as 'studio_admin' | 'super_admin' })}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="studio_admin">🏢 Studio Admin</option>
                    <option value="super_admin">👑 Super Admin</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '10px 16px',
                    backgroundColor: '#2e7d32',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: '600',
                    opacity: loading ? 0.6 : 1
                  }}
                >
                  {loading ? 'Creating...' : 'Create Admin'}
                </button>
              </form>
            </div>
          )}

          {/* Admins List */}
          <div>
            <h3>Studio Admins for {selectedStudio.name}</h3>
            {loading && <p>Loading...</p>}
            {admins.length === 0 ? (
              <p style={{ color: '#999' }}>No admins found for this studio</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Last Login</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {admins.map(admin => (
                      <tr key={admin.id}>
                        <td>{admin.name}</td>
                        <td>{admin.email}</td>
                        <td>
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: '600',
                            backgroundColor: admin.role === 'super_admin' ? '#fce4ec' : '#e3f2fd',
                            color: admin.role === 'super_admin' ? '#c2185b' : '#1976d2'
                          }}>
                            {admin.role === 'super_admin' ? '👑 Super Admin' : '🏢 Studio Admin'}
                          </span>
                        </td>
                        <td>
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: '600',
                            backgroundColor: admin.isActive ? '#e8f5e9' : '#ffebee',
                            color: admin.isActive ? '#2e7d32' : '#d32f2f'
                          }}>
                            {admin.isActive ? '✓ Active' : '✕ Inactive'}
                          </span>
                        </td>
                        <td>{new Date(admin.createdAt).toLocaleDateString()}</td>
                        <td>{admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleDateString() : 'Never'}</td>
                        <td>
                          <button
                            onClick={() => handleDeleteAdmin(admin.id, admin.email)}
                            disabled={loading || admins.length === 1}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#d32f2f',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: loading || admins.length === 1 ? 'not-allowed' : 'pointer',
                              fontSize: '12px',
                              fontWeight: '600',
                              opacity: loading || admins.length === 1 ? 0.5 : 1
                            }}
                            title={admins.length === 1 ? 'Cannot delete the last admin' : ''}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{
        marginTop: '32px',
        padding: '16px',
        backgroundColor: '#f5f5f5',
        borderRadius: '8px',
        fontSize: '0.9rem'
      }}>
        <h4 style={{ marginTop: 0 }}>About Studio Admins:</h4>
        <ul style={{ marginBottom: 0, paddingLeft: '1.5rem' }}>
          <li><strong>Super Admin:</strong> Can manage all studios and their admins (platform-wide access)</li>
          <li><strong>Studio Admin:</strong> Can manage their own studio and its team members</li>
          <li><strong>Can also be:</strong> A super admin can also have studio_admin role for specific studios</li>
          <li><strong>View & Edit:</strong> Super admins can view and edit all studio admins across all studios</li>
          <li><strong>Temporary Password:</strong> New admins receive a temporary password that should be changed on first login</li>
          <li><strong>Cannot Delete:</strong> Studio must always have at least one admin</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminStudioAdmins;
