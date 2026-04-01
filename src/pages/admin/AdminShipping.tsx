import AdminLayout from '../../components/AdminLayout';

import React, { useState, useEffect } from 'react';
import { shippingService } from '../../services/shippingService';
import { useAuth } from '../../contexts/AuthContext';
import { ShippingAddress } from '../../types';


const AdminShipping: React.FC = () => {
  const { user } = useAuth();
  const isStudioAdmin = user?.role === 'studio_admin';

  // Removed unused config state
  const [batchDeadline, setBatchDeadline] = useState('');
  const [directShippingCharge, setDirectShippingCharge] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [batchShippingAddress, setBatchShippingAddress] = useState<ShippingAddress>({
    fullName: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'US',
    email: '',
    phone: '',
  });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const updateBatchAddressField = (field: keyof ShippingAddress, value: string) => {
    setBatchShippingAddress((current) => ({
      ...current,
      [field]: value,
    }));
  };

  useEffect(() => {
    const loadConfig = async () => {
      setLoading(true);
      try {
        const data = await shippingService.getConfig();
        // Removed unused setConfig
        setBatchDeadline(data.batchDeadline || '');
        setDirectShippingCharge(data.directShippingCharge?.toString() || '');
        setIsActive(!!data.isActive);
        setBatchShippingAddress({
          fullName: data.batchShippingAddress?.fullName || '',
          addressLine1: data.batchShippingAddress?.addressLine1 || '',
          addressLine2: data.batchShippingAddress?.addressLine2 || '',
          city: data.batchShippingAddress?.city || '',
          state: data.batchShippingAddress?.state || '',
          zipCode: data.batchShippingAddress?.zipCode || '',
          country: data.batchShippingAddress?.country || 'US',
          email: data.batchShippingAddress?.email || '',
          phone: data.batchShippingAddress?.phone || '',
        });
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
        batchShippingAddress,
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
        <h1>{isStudioAdmin ? 'Studio Shipping Settings' : 'Admin Shipping Settings'}</h1>
        <p className="text-secondary" style={{ marginTop: 0, marginBottom: '1rem' }}>
          {isStudioAdmin
            ? 'Manage your studio batch deadline and direct shipping charge.'
            : 'Manage shipping settings for the current studio context.'}
        </p>
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
            <h2 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Batch Shipping Address</h2>
            <div className="form-group">
              <label htmlFor="batchFullName">Recipient / Studio Name</label>
              <input
                id="batchFullName"
                type="text"
                className="input"
                value={batchShippingAddress.fullName}
                onChange={e => updateBatchAddressField('fullName', e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="batchAddressLine1">Address Line 1</label>
              <input
                id="batchAddressLine1"
                type="text"
                className="input"
                value={batchShippingAddress.addressLine1}
                onChange={e => updateBatchAddressField('addressLine1', e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="batchAddressLine2">Address Line 2</label>
              <input
                id="batchAddressLine2"
                type="text"
                className="input"
                value={batchShippingAddress.addressLine2 || ''}
                onChange={e => updateBatchAddressField('addressLine2', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="batchCity">City</label>
              <input
                id="batchCity"
                type="text"
                className="input"
                value={batchShippingAddress.city}
                onChange={e => updateBatchAddressField('city', e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="batchState">State</label>
              <input
                id="batchState"
                type="text"
                className="input"
                value={batchShippingAddress.state}
                onChange={e => updateBatchAddressField('state', e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="batchZipCode">Zip Code</label>
              <input
                id="batchZipCode"
                type="text"
                className="input"
                value={batchShippingAddress.zipCode}
                onChange={e => updateBatchAddressField('zipCode', e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="batchCountry">Country</label>
              <input
                id="batchCountry"
                type="text"
                className="input"
                value={batchShippingAddress.country}
                onChange={e => updateBatchAddressField('country', e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="batchEmail">Email</label>
              <input
                id="batchEmail"
                type="email"
                className="input"
                value={batchShippingAddress.email}
                onChange={e => updateBatchAddressField('email', e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="batchPhone">Phone</label>
              <input
                id="batchPhone"
                type="tel"
                className="input"
                value={batchShippingAddress.phone || ''}
                onChange={e => updateBatchAddressField('phone', e.target.value)}
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