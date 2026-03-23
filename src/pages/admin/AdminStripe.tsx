

import React, { useState } from 'react';
import api from '../../services/api';
import Button from '../../components/Button/Button';

const AdminStripe: React.FC = () => {
  const [isActive, setIsActive] = useState(true);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // Test Stripe connection
  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post('/stripe/test-connection');
      setTestResult(res.data.message || 'Connection successful!');
    } catch (err: any) {
      setTestResult(err.response?.data?.error || 'Connection failed.');
    } finally {
      setTesting(false);
    }
  };

  // Save payment method status/mode
  const handleSave = async () => {
    setSaving(true);
    setTestResult(null);
    try {
      // Only update status/mode, not keys
      await api.post('/stripe/admin/payment-method/stripe', {
        isActive,
        isLiveMode,
      });
      setTestResult('Changes saved successfully.');
    } catch (err: any) {
      setTestResult(err.response?.data?.error || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-form">
      <h1>Stripe Configuration</h1>
      <div className="form-group">
        <label htmlFor="isActive">
          <input
            type="checkbox"
            id="isActive"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            style={{ marginRight: '0.5rem' }}
          />
          Enable Stripe Payments
        </label>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
          When disabled, customers cannot complete purchases
        </p>
      </div>

      <div className="form-group">
        <label htmlFor="isLiveMode">
          <input
            type="checkbox"
            id="isLiveMode"
            checked={isLiveMode}
            onChange={(e) => setIsLiveMode(e.target.checked)}
            style={{ marginRight: '0.5rem' }}
          />
          Use Live Mode (Production)
        </label>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
          {isLiveMode ? (
            <span style={{ color: 'var(--error-color)', fontWeight: 600 }}>
              ⚠️ Live mode - Real charges will be processed
            </span>
          ) : (
            <span style={{ color: '#86efac' }}>
              ✓ Test mode - No real charges
            </span>
          )}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
        <Button onClick={handleTestConnection} disabled={testing}>
          {testing ? 'Testing...' : 'Test Connection'}
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      {testResult && (
        <div style={{ marginTop: '1rem', color: testResult.includes('success') ? '#22c55e' : '#ef4444' }}>
          {testResult}
        </div>
      )}

      <div style={{ color: '#aaa', marginTop: '1rem' }}>
        <strong>Note:</strong> Stripe keys are managed via <code>.env.local</code> and cannot be changed from the UI.
      </div>
    </div>
  );
};

export default AdminStripe;
