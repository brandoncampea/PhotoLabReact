import React, { useState, useEffect } from 'react';
import { StripeConfig } from '../../types';
import { adminMockApi } from '../../services/adminMockApi';

const AdminStripe: React.FC = () => {
  const [config, setConfig] = useState<StripeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishableKey, setPublishableKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [showSecretKey, setShowSecretKey] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const data = await adminMockApi.stripe.getConfig();
      setConfig(data);
      setPublishableKey(data.publishableKey);
      setSecretKey(data.secretKey);
      setWebhookSecret(data.webhookSecret || '');
      setIsLiveMode(data.isLiveMode);
      setIsActive(data.isActive);
    } catch (error) {
      console.error('Failed to load Stripe config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updatedConfig = await adminMockApi.stripe.updateConfig({
        publishableKey,
        secretKey,
        webhookSecret: webhookSecret || undefined,
        isLiveMode,
        isActive,
      });
      setConfig(updatedConfig);
      alert('Stripe configuration saved successfully!');
    } catch (error) {
      console.error('Failed to save Stripe config:', error);
      alert('Failed to save Stripe configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    alert('Testing Stripe connection...\n\nIn a real implementation, this would verify the API keys with Stripe.');
  };

  if (loading) {
    return <div className="loading">Loading Stripe configuration...</div>;
  }

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>Stripe Payment Settings</h1>
      </div>

      <div className="admin-form" style={{ maxWidth: '800px' }}>
        <div className="info-box" style={{
          padding: '1rem',
          backgroundColor: '#fff3cd',
          borderRadius: '8px',
          marginBottom: '2rem',
          border: '1px solid #ffc107'
        }}>
          <h3 style={{ marginTop: 0, color: '#856404' }}>⚠️ Security Notice</h3>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#856404' }}>
            Never share your Stripe secret keys publicly. In production, store these securely on the backend.
            The keys shown here are for testing purposes only.
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
            Enable Stripe Payments
          </label>
          <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
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
          <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
            {isLiveMode ? (
              <span style={{ color: '#d32f2f', fontWeight: 600 }}>
                ⚠️ Live mode - Real charges will be processed
              </span>
            ) : (
              <span style={{ color: '#388e3c' }}>
                ✓ Test mode - No real charges
              </span>
            )}
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="publishableKey">
            Publishable Key {!isLiveMode && '(Test)'}
          </label>
          <input
            type="text"
            id="publishableKey"
            value={publishableKey}
            onChange={(e) => setPublishableKey(e.target.value)}
            placeholder={isLiveMode ? 'pk_live_...' : 'pk_test_...'}
            disabled={!isActive}
          />
          <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
            This key is safe to use in your frontend code
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="secretKey">
            Secret Key {!isLiveMode && '(Test)'}
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showSecretKey ? 'text' : 'password'}
              id="secretKey"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder={isLiveMode ? 'sk_live_...' : 'sk_test_...'}
              disabled={!isActive}
              style={{ paddingRight: '80px' }}
            />
            <button
              type="button"
              onClick={() => setShowSecretKey(!showSecretKey)}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#4169E1',
                cursor: 'pointer',
                fontSize: '0.85rem',
                padding: '0.25rem 0.5rem'
              }}
            >
              {showSecretKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#d32f2f', marginTop: '0.25rem' }}>
            ⚠️ Keep this secret! Never expose in frontend code
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="webhookSecret">
            Webhook Signing Secret (Optional)
          </label>
          <input
            type={showSecretKey ? 'text' : 'password'}
            id="webhookSecret"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            placeholder="whsec_..."
            disabled={!isActive}
          />
          <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
            Used to verify webhook events from Stripe
          </p>
        </div>

        <div className="form-actions" style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
          <button 
            onClick={handleSave} 
            className="btn btn-primary"
            disabled={saving || !isActive}
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
          <button 
            onClick={handleTestConnection}
            className="btn btn-secondary"
            disabled={!isActive}
          >
            Test Connection
          </button>
        </div>

        <div style={{
          marginTop: '2rem',
          padding: '1rem',
          backgroundColor: '#f5f5f5',
          borderRadius: '8px',
          fontSize: '0.9rem'
        }}>
          <h4 style={{ marginTop: 0 }}>Getting Started with Stripe:</h4>
          <ol style={{ marginBottom: 0, paddingLeft: '1.5rem' }}>
            <li>Sign up for a Stripe account at <a href="https://stripe.com" target="_blank" rel="noopener noreferrer">stripe.com</a></li>
            <li>Get your API keys from the Stripe Dashboard → Developers → API keys</li>
            <li>Start with Test keys (pk_test_... and sk_test_...) for development</li>
            <li>Use test card <code>4242 4242 4242 4242</code> with any future expiry date and CVC</li>
            <li>Switch to Live keys only when ready for production</li>
            <li>Set up webhooks in Stripe Dashboard to receive payment events</li>
          </ol>
        </div>

        {config && (
          <div style={{
            marginTop: '1.5rem',
            padding: '1rem',
            backgroundColor: '#e3f2fd',
            borderRadius: '8px',
            fontSize: '0.9rem'
          }}>
            <h4 style={{ marginTop: 0 }}>Current Status:</h4>
            <ul style={{ marginBottom: 0, paddingLeft: '1.5rem' }}>
              <li>Mode: <strong>{isLiveMode ? 'Live (Production)' : 'Test (Development)'}</strong></li>
              <li>Status: <strong>{isActive ? 'Active ✓' : 'Inactive'}</strong></li>
              <li>Publishable Key: <code>{publishableKey.substring(0, 20)}...</code></li>
              <li>Webhook: {webhookSecret ? 'Configured ✓' : 'Not configured'}</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminStripe;
