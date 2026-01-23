import React, { useState, useEffect } from 'react';
import { ProfileConfig } from '../../types';
import { adminMockApi } from '../../services/adminMockApi';

const AdminProfile: React.FC = () => {
  const [config, setConfig] = useState<ProfileConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [receiveOrderNotifications, setReceiveOrderNotifications] = useState(true);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const data = await adminMockApi.profile.getConfig();
      setConfig(data);
      setOwnerName(data.ownerName);
      setBusinessName(data.businessName);
      setEmail(data.email);
      setReceiveOrderNotifications(data.receiveOrderNotifications);
    } catch (error) {
      console.error('Failed to load profile config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updatedConfig = await adminMockApi.profile.updateConfig({
        ownerName,
        businessName,
        email,
        receiveOrderNotifications,
      });
      setConfig(updatedConfig);
      alert('Profile saved successfully!');
    } catch (error) {
      console.error('Failed to save profile:', error);
      alert('Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading profile...</div>;
  }

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>👤 Profile Settings</h1>
        <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.5rem' }}>
          Manage your business profile and notification preferences
        </p>
      </div>

      <div className="admin-form" style={{ maxWidth: '600px' }}>
        <div className="form-group">
          <label htmlFor="ownerName">
            Owner Name <span style={{ color: '#d32f2f' }}>*</span>
          </label>
          <input
            type="text"
            id="ownerName"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            placeholder="John Smith"
            required
          />
          <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
            Your full name
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="businessName">
            Business Name <span style={{ color: '#d32f2f' }}>*</span>
          </label>
          <input
            type="text"
            id="businessName"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="PhotoLab Studio"
            required
          />
          <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
            Your business or studio name
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="email">
            Email Address <span style={{ color: '#d32f2f' }}>*</span>
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@photolab.com"
            required
          />
          <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
            Primary contact email for your business
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="receiveOrderNotifications">
            <input
              type="checkbox"
              id="receiveOrderNotifications"
              checked={receiveOrderNotifications}
              onChange={(e) => setReceiveOrderNotifications(e.target.checked)}
              style={{ marginRight: '0.5rem' }}
            />
            Receive Order Notifications
          </label>
          <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
            Get email notifications when new orders are placed
          </p>
        </div>

        <div style={{
          padding: '1rem',
          backgroundColor: '#e3f2fd',
          borderRadius: '8px',
          marginBottom: '2rem',
          fontSize: '0.9rem',
          border: '1px solid #90caf9'
        }}>
          <h4 style={{ marginTop: 0, color: '#1565c0' }}>ℹ️ Notification Settings</h4>
          <p style={{ margin: '0.5rem 0 0 0', color: '#1565c0' }}>
            When enabled, you'll receive an email at <strong>{email}</strong> whenever a customer places an order. 
            This helps you stay informed and respond quickly to new business.
          </p>
        </div>

        <div className="form-actions">
          <button 
            onClick={handleSave} 
            className="btn btn-primary"
            disabled={saving || !ownerName || !businessName || !email}
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>

        {config && (
          <div style={{
            marginTop: '2rem',
            padding: '1rem',
            backgroundColor: '#f5f5f5',
            borderRadius: '8px',
            fontSize: '0.9rem'
          }}>
            <h4 style={{ marginTop: 0 }}>Current Profile:</h4>
            <ul style={{ marginBottom: 0, paddingLeft: '1.5rem' }}>
              <li>Owner: <strong>{ownerName}</strong></li>
              <li>Business: <strong>{businessName}</strong></li>
              <li>Email: <strong>{email}</strong></li>
              <li>Order Notifications: <strong>{receiveOrderNotifications ? 'Enabled ✓' : 'Disabled'}</strong></li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminProfile;
