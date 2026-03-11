import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { studioFeatureService, StudioFeatureSettings } from '../../services/studioFeatureService';
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
  const navigate = useNavigate();
  const { user } = useAuth();
  const [studios, setStudios] = useState<Studio[]>([]);
  const [selectedStudio, setSelectedStudio] = useState<Studio | null>(null);
  const [admins, setAdmins] = useState<StudioAdmin[]>([]);
  const [adminsByStudio, setAdminsByStudio] = useState<Record<number, StudioAdmin[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [featureSettings, setFeatureSettings] = useState<StudioFeatureSettings>(studioFeatureService.getDefaultSettings());
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

        const adminRows = await Promise.all(
          data.map(async (studio: Studio) => ({
            studioId: studio.id,
            admins: await fetchAdminsForStudio(studio.id),
          }))
        );
        const mapped: Record<number, StudioAdmin[]> = {};
        adminRows.forEach((row) => {
          mapped[row.studioId] = row.admins;
        });
        setAdminsByStudio(mapped);

        if (data.length > 0) {
          setSelectedStudio(data[0]);
          setFeatureSettings(studioFeatureService.getStudioSettings(data[0].id));
          setAdmins(mapped[data[0].id] || []);
        }
      }
    } catch (err: any) {
      setError('Failed to load studios');
    } finally {
      setLoading(false);
    }
  };

  const fetchAdminsForStudio = async (studioId: number): Promise<StudioAdmin[]> => {
    const token = localStorage.getItem('authToken');
    const response = await fetch(`/api/studios/${studioId}/admins`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!response.ok) return [];
    return response.json();
  };

  const fetchAdmins = async (studioId: number) => {
    try {
      setLoading(true);
      const data = await fetchAdminsForStudio(studioId);
      setAdmins(data);
      setAdminsByStudio((prev) => ({ ...prev, [studioId]: data }));
      setError('');
    } catch (err: any) {
      setError('Failed to load studio admins');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectStudio = (studio: Studio) => {
    setSelectedStudio(studio);
    setFeatureSettings(studioFeatureService.getStudioSettings(studio.id));
    setShowAddForm(false);
    setFormData({ email: '', name: '', role: 'studio_admin' });
    const cached = adminsByStudio[studio.id];
    if (cached) {
      setAdmins(cached);
    } else {
      fetchAdmins(studio.id);
    }
  };

  const handleViewStudio = (studio: Studio) => {
    localStorage.setItem('viewAsStudioId', String(studio.id));
    localStorage.setItem('viewAsStudioName', studio.name);
    localStorage.setItem('adminMenuMode', 'studio');
    navigate('/admin/dashboard');
  };

  const togglePaymentVendor = (vendor: 'stripe') => {
    setFeatureSettings((prev) => {
      const alreadyEnabled = prev.paymentVendors.includes(vendor);
      return {
        ...prev,
        paymentVendors: alreadyEnabled
          ? prev.paymentVendors.filter((v) => v !== vendor)
          : [...prev.paymentVendors, vendor],
      };
    });
  };

  const toggleLabVendor = (vendor: 'roes' | 'whcc' | 'mpix') => {
    setFeatureSettings((prev) => {
      const alreadyEnabled = prev.labVendors.includes(vendor);
      return {
        ...prev,
        labVendors: alreadyEnabled
          ? prev.labVendors.filter((v) => v !== vendor)
          : [...prev.labVendors, vendor],
      };
    });
  };

  const handleSaveFeatureSettings = () => {
    if (!selectedStudio) return;
    studioFeatureService.saveStudioSettings(selectedStudio.id, featureSettings);
    setSuccess(`Studio access settings saved for ${selectedStudio.name}`);
    setTimeout(() => setSuccess(''), 4000);
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
        <div style={{ padding: '20px', color: 'var(--error-color)' }}>
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
        <div className="info-box-error" style={{ marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {success && (
        <div className="info-box-success" style={{ marginBottom: '16px' }}>
          {success}
        </div>
      )}

      {/* Studio Selector */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ marginBottom: '12px' }}>All Studios & Admin Users</h3>
        <div style={{ display: 'grid', gap: '12px' }}>
          {studios.map((studio) => {
            const studioAdmins = adminsByStudio[studio.id] || [];
            return (
              <div
                key={studio.id}
                style={{
                  padding: '12px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-tertiary)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div>
                    <strong>{studio.name}</strong>
                    <div className="muted-text" style={{ fontSize: '0.85rem' }}>{studio.email}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleSelectStudio(studio)}>Manage</button>
                    <button className="btn btn-primary btn-sm" onClick={() => handleViewStudio(studio)}>View</button>
                  </div>
                </div>
                {studioAdmins.length === 0 ? (
                  <div className="muted-text" style={{ fontSize: '0.85rem' }}>No admin users</div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {studioAdmins.map((admin) => (
                      <span key={admin.id} className="status-badge status-active" style={{ fontSize: '0.75rem' }}>
                        {admin.name} • {admin.email}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{
        marginBottom: '24px',
        padding: '16px',
        backgroundColor: 'var(--bg-tertiary)',
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
                borderColor: selectedStudio?.id === studio.id ? 'var(--primary-color)' : 'var(--border-color)',
                backgroundColor: selectedStudio?.id === studio.id ? 'rgba(124, 92, 255, 0.12)' : 'var(--bg-primary)',
                color: selectedStudio?.id === studio.id ? 'var(--primary-color)' : 'var(--text-secondary)',
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
          <div style={{
            marginBottom: '24px',
            padding: '16px',
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px'
          }}>
            <h3 style={{ marginTop: 0 }}>Studio Access Settings</h3>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              Choose which payment vendors and lab configurations are available to this studio.
            </p>

            <div style={{ marginTop: '1rem' }}>
              <h4 style={{ marginBottom: '0.75rem' }}>Payment Vendors</h4>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <input
                  type="checkbox"
                  checked={featureSettings.paymentVendors.includes('stripe')}
                  onChange={() => togglePaymentVendor('stripe')}
                />
                Stripe
              </label>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <h4 style={{ marginBottom: '0.75rem' }}>Lab Configurations</h4>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={featureSettings.labVendors.includes('roes')}
                    onChange={() => toggleLabVendor('roes')}
                  />
                  ROES
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={featureSettings.labVendors.includes('whcc')}
                    onChange={() => toggleLabVendor('whcc')}
                  />
                  WHCC
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={featureSettings.labVendors.includes('mpix')}
                    onChange={() => toggleLabVendor('mpix')}
                  />
                  Mpix
                </label>
              </div>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <button
                onClick={handleSaveFeatureSettings}
                className="btn btn-success"
                style={{ fontSize: '14px', fontWeight: '600' }}
              >
                Save Studio Access Settings
              </button>
            </div>
          </div>

          {/* Add New Admin Button */}
          <div style={{ marginBottom: '24px' }}>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="btn btn-primary"
              style={{ fontSize: '14px', fontWeight: '600' }}
            >
              {showAddForm ? '✕ Cancel' : '+ Add New Admin'}
            </button>
          </div>

          {/* Add Admin Form */}
          {showAddForm && (
            <div style={{
              marginBottom: '24px',
              padding: '16px',
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
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
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)'
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
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)'
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
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)'
                    }}
                  >
                    <option value="studio_admin">🏢 Studio Admin</option>
                    <option value="super_admin">👑 Super Admin</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-success"
                  style={{ fontSize: '14px', fontWeight: '600', opacity: loading ? 0.6 : 1 }}
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
              <p style={{ color: 'var(--text-secondary)' }}>No admins found for this studio</p>
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
                            backgroundColor: admin.role === 'super_admin' ? 'rgba(236, 72, 153, 0.15)' : 'rgba(124, 92, 255, 0.15)',
                            color: admin.role === 'super_admin' ? '#f9a8d4' : '#c4b5fd'
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
                            backgroundColor: admin.isActive ? 'rgba(34, 197, 94, 0.18)' : 'rgba(239, 68, 68, 0.18)',
                            color: admin.isActive ? '#86efac' : '#fca5a5'
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
                            className="btn btn-danger btn-sm"
                            style={{
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
        backgroundColor: 'var(--bg-tertiary)',
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
