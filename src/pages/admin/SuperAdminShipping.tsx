

import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import { shippingService } from '../../services/shippingService';
import { ShippingConfig } from '../../types';


const SuperAdminShipping = () => {
  const [config, setConfig] = useState<ShippingConfig | null>(null);
  const [batchDeadline, setBatchDeadline] = useState('');
  const [directShippingCharge, setDirectShippingCharge] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadConfig = async () => {
      setLoading(true);
      try {
        const data = await shippingService.getConfig();
        setConfig(data);
        setBatchDeadline(data.batchDeadline || '');
        setDirectShippingCharge(data.directShippingCharge?.toString() || '');
        setIsActive(!!data.isActive);
      } catch (e) {
        setMessage('Failed to load shipping config');
      } finally {
        setLoading(false);
      }
    };
    loadConfig();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    try {
      const updated = await shippingService.updateConfig({
        batchDeadline,
        directShippingCharge: parseFloat(directShippingCharge),
        isActive,
      });
      setConfig(updated);
      setMessage('Shipping config updated!');
    } catch (e) {
      setMessage('Failed to update shipping config');
    }
    setTimeout(() => setMessage(''), 2000);
  };

  return (
    <AdminLayout>
      <h1 data-testid="superadmin-shipping-heading">Super Admin Shipping Settings</h1>
      <div className="superadmin-shipping-content">
        {loading ? (
          <div>Loading...</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="batchDeadline">Batch Deadline</label>
              <input
                id="batchDeadline"
                type="datetime-local"
                className="superadmin-shipping-input"
                value={batchDeadline}
                onChange={e => setBatchDeadline(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="directShippingCharge">Direct Shipping Charge ($)</label>
              <input
                id="directShippingCharge"
                type="number"
                className="superadmin-shipping-input"
                value={directShippingCharge}
                onChange={e => setDirectShippingCharge(e.target.value)}
                min="0"
                step="0.01"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="isActive">Batch Shipping Active</label>
              <input
                id="isActive"
                type="checkbox"
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
              />
            </div>
            <button type="submit" className="superadmin-save">Save</button>
          </form>
        )}
        {message && <div className="success-message">{message}</div>}
      </div>
    </AdminLayout>
  );
};

export default SuperAdminShipping;
