import AdminLayout from '../../components/AdminLayout';

import React, { useState, useEffect } from 'react';
import { shippingService } from '../../services/shippingService';
// Removed unused ShippingConfig import


const AdminShipping: React.FC = () => {

  // Removed unused config state
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
        // Removed unused setConfig
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
      await shippingService.updateConfig({
        batchDeadline,
        directShippingCharge: parseFloat(directShippingCharge),
        isActive,
      });
      // Removed unused setConfig
      setMessage('Shipping config updated!');
    } catch (e) {
      setMessage('Failed to update shipping config');
    }
    setTimeout(() => setMessage(''), 2000);
  };

  return (
    <AdminLayout>
      <div className="admin-form">
        <h1>Admin Shipping Settings</h1>
        {loading ? (
          <div>Loading...</div>
        ) : (
          <form className="form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="batchDeadline">Batch Deadline</label>
              <input
                id="batchDeadline"
                type="datetime-local"
                className="input"
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
                className="input"
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
            <button type="submit" className="btn btn-primary">Save Settings</button>
          </form>
        )}
        {message && <div className="success-message">{message}</div>}
      </div>
    </AdminLayout>
  );
};

export default AdminShipping;