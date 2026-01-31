import React, { useState, useEffect } from 'react';
import { ShippingConfig } from '../../types';
import { adminMockApi } from '../../services/adminMockApi';
import { shippingService } from '../../services/shippingService';
import { isUseMockApi } from '../../utils/mockApiConfig';

const AdminShipping: React.FC = () => {
  const [config, setConfig] = useState<ShippingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [batchDeadline, setBatchDeadline] = useState('');
  const [directShippingCharge, setDirectShippingCharge] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const data = isUseMockApi()
        ? await adminMockApi.shipping.getConfig()
        : await shippingService.getConfig();
      setConfig(data);
      setBatchDeadline(data.batchDeadline.split('T')[0]);
      setDirectShippingCharge(data.directShippingCharge.toString());
      setIsActive(data.isActive);
    } catch (error) {
      console.error('Failed to load shipping config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updatedConfig = await adminMockApi.shipping.updateConfig({
        batchDeadline: new Date(batchDeadline).toISOString(),
        directShippingCharge: parseFloat(directShippingCharge),
        isActive,
      });
      setConfig(updatedConfig);
      alert('Shipping configuration saved successfully!');
    } catch (error) {
      console.error('Failed to save shipping config:', error);
      alert('Failed to save shipping configuration');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading shipping configuration...</div>;
  }

  const daysUntilDeadline = config ? Math.ceil((new Date(config.batchDeadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
  const deadlinePassed = daysUntilDeadline < 0;

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>Shipping Settings</h1>
      </div>

      <div className="admin-form" style={{ maxWidth: '800px' }}>
        <div className="info-box" style={{
          padding: '1rem',
          backgroundColor: '#e3f2fd',
          borderRadius: '8px',
          marginBottom: '2rem',
          border: '1px solid #90caf9'
        }}>
          <h3 style={{ marginTop: 0, color: '#1565c0' }}>📦 Batch Shipping</h3>
          <p style={{ marginBottom: '0.5rem' }}>
            Batch shipping allows you to collect multiple orders and ship them together, reducing costs.
            Customers can choose batch shipping (no extra charge) before the deadline, or pay for direct shipping anytime.
          </p>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#555' }}>
            <strong>Current Status:</strong> {deadlinePassed ? (
              <span style={{ color: '#d32f2f' }}>Deadline passed - Only direct shipping available</span>
            ) : (
              <span style={{ color: '#388e3c' }}>Active - {daysUntilDeadline} days until batch deadline</span>
            )}
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="isActive">
            <input
              type="checkbox"
              id="isActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              style={{ marginRight: '0.5rem' }}
            />
            Enable Batch Shipping
          </label>
          <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
            When disabled, only direct shipping will be available to customers
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="batchDeadline">Batch Shipping Deadline</label>
          <input
            type="date"
            id="batchDeadline"
            value={batchDeadline}
            onChange={(e) => setBatchDeadline(e.target.value)}
            disabled={!isActive}
            min={new Date().toISOString().split('T')[0]}
          />
          <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
            Customers can choose batch shipping until this date
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="directShippingCharge">Direct Shipping Additional Charge ($)</label>
          <input
            type="number"
            id="directShippingCharge"
            value={directShippingCharge}
            onChange={(e) => setDirectShippingCharge(e.target.value)}
            min="0"
            step="0.01"
          />
          <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
            Extra fee customers pay for direct (immediate) shipping
          </p>
        </div>

        <div className="form-actions" style={{ marginTop: '2rem' }}>
          <button 
            onClick={handleSave} 
            className="btn btn-primary"
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>

        <div style={{
          marginTop: '2rem',
          padding: '1rem',
          backgroundColor: '#f5f5f5',
          borderRadius: '8px',
          fontSize: '0.9rem'
        }}>
          <h4 style={{ marginTop: 0 }}>How it works:</h4>
          <ul style={{ marginBottom: 0, paddingLeft: '1.5rem' }}>
            <li>Before the deadline: Customers can choose batch shipping (free) or direct shipping (+${directShippingCharge})</li>
            <li>After the deadline: Only direct shipping is available</li>
            <li>Batch orders are held until the deadline, then shipped together</li>
            <li>Direct shipping orders are processed immediately</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AdminShipping;
