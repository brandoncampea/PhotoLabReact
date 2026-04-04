import AdminLayout from '../../components/AdminLayout';

import React, { useState, useEffect } from 'react';
import { shippingService } from '../../services/shippingService';
import { useAuth } from '../../contexts/AuthContext';
import { ShippingAddress } from '../../types';
import './AdminShipping.css';

const toDateTimeLocalValue = (value?: string | null) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value).slice(0, 16);
  }
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const toApiDateTimeValue = (value: string) => {
  if (!value) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString();
};


const AdminShipping: React.FC = () => {
  const { user } = useAuth();
  const isStudioAdmin = user?.role === 'studio_admin';

  // Removed unused config state
  const [batchDeadline, setBatchDeadline] = useState('');
  const [directShippingCharge, setDirectShippingCharge] = useState('');
  const [directPricingMode, setDirectPricingMode] = useState<'pass_through' | 'flat_fee'>('pass_through');
  const [directFlatFee, setDirectFlatFee] = useState('');
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

  const pageTitle = isStudioAdmin ? 'Studio Shipping Settings' : 'Admin Shipping Settings';
  const pageSubtitle = isStudioAdmin
    ? 'Control your studio batch shipment timing and how direct WHCC shipping is priced for customers.'
    : 'Manage shipping settings for the current studio context, including batch destination details and direct pricing rules.';

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
        setBatchDeadline(toDateTimeLocalValue(data.batchDeadline));
        setDirectShippingCharge(data.directShippingCharge?.toString() || '');
        setDirectPricingMode(data.directPricingMode === 'flat_fee' ? 'flat_fee' : 'pass_through');
        setDirectFlatFee(data.directFlatFee == null ? '' : String(data.directFlatFee));
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
        batchDeadline: toApiDateTimeValue(batchDeadline),
        directShippingCharge: parseFloat(directShippingCharge),
        directPricingMode,
        directFlatFee: directFlatFee === '' ? null : parseFloat(directFlatFee),
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
      <div className="admin-shipping-page">
        <section className="admin-shipping-hero">
          <div>
            <div className="admin-shipping-kicker">Shipping Configuration</div>
            <h1>{pageTitle}</h1>
            <p>{pageSubtitle}</p>
          </div>

          <div className="admin-shipping-hero-cards">
            <div className="admin-shipping-stat-card">
              <span className="admin-shipping-stat-label">Batch Status</span>
              <strong>{isActive ? 'Active' : 'Paused'}</strong>
              <small>Controls whether the studio can use batch shipping.</small>
            </div>
            <div className="admin-shipping-stat-card">
              <span className="admin-shipping-stat-label">Direct Pricing</span>
              <strong>{directPricingMode === 'flat_fee' ? 'Flat Fee' : 'Pass Through'}</strong>
              <small>
                {directPricingMode === 'flat_fee'
                  ? `Customer pays ${directFlatFee ? `$${directFlatFee}` : 'your configured fee'}.`
                  : 'Customer pays the WHCC-calculated shipping amount.'}
              </small>
            </div>
            <div className="admin-shipping-stat-card">
              <span className="admin-shipping-stat-label">Batch Deadline</span>
              <strong>{batchDeadline ? new Date(batchDeadline).toLocaleString() : 'Not set'}</strong>
              <small>Orders after this date remain queued until the next release.</small>
            </div>
          </div>
        </section>

        {message && <div className={`admin-shipping-banner ${message.includes('Failed') ? 'is-error' : 'is-success'}`}>{message}</div>}

        {loading ? (
          <div className="admin-shipping-loading">Loading shipping settings…</div>
        ) : (
          <form className="admin-shipping-form" onSubmit={handleSubmit}>
            <section className="admin-shipping-section">
              <div className="admin-shipping-section-heading">
                <h2>Pricing & Availability</h2>
                <p>Define when batch shipments are released and how direct WHCC shipping is charged.</p>
              </div>

              <div className="admin-shipping-grid admin-shipping-grid--top">
                <div className="form-group admin-shipping-field admin-shipping-field--wide">
                  <label htmlFor="batchDeadline">Batch Deadline</label>
                  <input
                    id="batchDeadline"
                    type="datetime-local"
                    className="input"
                    value={batchDeadline}
                    onChange={e => setBatchDeadline(e.target.value)}
                    required
                  />
                  <small>Orders with batch shipping wait until this release date.</small>
                </div>

                <div className="form-group admin-shipping-field">
                  <label htmlFor="directShippingCharge">Fallback Direct Charge ($)</label>
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
                  <small>Used as a fallback/default amount when flat-fee pricing is enabled.</small>
                </div>

                <div className="form-group admin-shipping-field">
                  <label htmlFor="directPricingMode">Direct Shipping Pricing Mode</label>
                  <select
                    id="directPricingMode"
                    className="input"
                    value={directPricingMode}
                    onChange={(e) => setDirectPricingMode((e.target.value === 'flat_fee' ? 'flat_fee' : 'pass_through'))}
                  >
                    <option value="pass_through">Pass WHCC shipping through to customer</option>
                    <option value="flat_fee">Charge a flat fee to customer</option>
                  </select>
                  <small>Choose whether customers pay the rubric amount or your studio fee.</small>
                </div>

                {directPricingMode === 'flat_fee' && (
                  <div className="form-group admin-shipping-field">
                    <label htmlFor="directFlatFee">Direct Shipping Flat Fee ($)</label>
                    <input
                      id="directFlatFee"
                      type="number"
                      className="input"
                      value={directFlatFee}
                      onChange={e => setDirectFlatFee(e.target.value)}
                      min="0"
                      step="0.01"
                      required
                    />
                    <small>Customers are charged this amount regardless of the WHCC rubric cost.</small>
                  </div>
                )}
              </div>

              <label className="admin-shipping-toggle" htmlFor="isActive">
                <div>
                  <span className="admin-shipping-toggle-title">Batch Shipping Active</span>
                  <span className="admin-shipping-toggle-copy">Turn batch shipping on or off for the current studio.</span>
                </div>
                <span className="admin-shipping-toggle-control">
                  <input
                    id="isActive"
                    type="checkbox"
                    checked={isActive}
                    onChange={e => setIsActive(e.target.checked)}
                  />
                  <span className="admin-shipping-toggle-slider" aria-hidden="true" />
                </span>
              </label>
            </section>

            <section className="admin-shipping-section">
              <div className="admin-shipping-section-heading">
                <h2>Batch Shipping Address</h2>
                <p>Set the destination used when orders are grouped into a studio-paid batch shipment.</p>
              </div>

              <div className="admin-shipping-grid">
                <div className="form-group admin-shipping-field admin-shipping-field--wide">
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
                <div className="form-group admin-shipping-field admin-shipping-field--wide">
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
                <div className="form-group admin-shipping-field admin-shipping-field--wide">
                  <label htmlFor="batchAddressLine2">Address Line 2</label>
                  <input
                    id="batchAddressLine2"
                    type="text"
                    className="input"
                    value={batchShippingAddress.addressLine2 || ''}
                    onChange={e => updateBatchAddressField('addressLine2', e.target.value)}
                  />
                </div>
                <div className="form-group admin-shipping-field">
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
                <div className="form-group admin-shipping-field">
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
                <div className="form-group admin-shipping-field">
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
                <div className="form-group admin-shipping-field">
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
                <div className="form-group admin-shipping-field">
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
                <div className="form-group admin-shipping-field">
                  <label htmlFor="batchPhone">Phone</label>
                  <input
                    id="batchPhone"
                    type="tel"
                    className="input"
                    value={batchShippingAddress.phone || ''}
                    onChange={e => updateBatchAddressField('phone', e.target.value)}
                  />
                </div>
              </div>
            </section>

            <div className="admin-shipping-actions">
              <div className="admin-shipping-actions-copy">
                Saving updates the active studio context used for batch releases and direct-shipping pricing.
              </div>
              <button type="submit" className="btn btn-primary admin-shipping-save-button">Save Settings</button>
            </div>
          </form>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminShipping;