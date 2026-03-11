import React, { useState, useEffect } from 'react';
import { StripeConfig } from '../../types';
import { stripeService } from '../../services/stripeService';
import { useAuth } from '../../contexts/AuthContext';
import { studioFeatureService } from '../../services/studioFeatureService';

const AdminPayments: React.FC = () => {
  const { user } = useAuth();
  const [stripeAvailable, setStripeAvailable] = useState(true);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'stripe' | null>('stripe');
  const [config, setConfig] = useState<StripeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [publishableKey, setPublishableKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [showSecretKey, setShowSecretKey] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    const loadFeatureSettings = async () => {
      const effectiveStudioId = studioFeatureService.getEffectiveStudioId(user);
      if (!effectiveStudioId) {
        setStripeAvailable(true);
        return;
      }

      const settings = await studioFeatureService.getStudioSettings(effectiveStudioId);
      setStripeAvailable((settings.paymentVendors || []).includes('stripe'));
    };

    loadFeatureSettings();
  }, [user?.id, user?.role, user?.studioId]);

  const loadConfig = async () => {
    try {
      const data = await stripeService.getConfig();
      setConfig(data);
      setPublishableKey(data.publishableKey);
      setSecretKey(data.secretKey || '');
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
      const updatedConfig = await stripeService.saveConfig({
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
    if (!secretKey || !secretKey.trim()) {
      alert('Please enter a secret key first');
      return;
    }

    setTesting(true);
    try {
      const result = await stripeService.testConnection(secretKey);
      
      if (result.success) {
        const liveStatus = result.isLive ? '🔴 LIVE MODE' : '🟢 TEST MODE';
        alert(
          `✅ ${result.message}\n\n` +
          `Mode: ${liveStatus}\n` +
          (result.accountEmail ? `Email: ${result.accountEmail}\n` : '') +
          `Account ID: ${result.accountId}`
        );
      } else {
        alert(`❌ Connection failed:\n\n${result.message}`);
      }
    } catch (error) {
      console.error('Test connection error:', error);
      alert('Failed to test connection. Please check your API key.');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading payment configuration...</div>;
  }

  if (!stripeAvailable) {
    return (
      <div className="admin-page">
        <div className="page-header">
          <h1>💳 Payment Methods</h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            Payment methods are managed by your super admin.
          </p>
        </div>
        <div className="info-box" style={{ border: '1px solid var(--border-color)' }}>
          Stripe is not enabled for your studio. Contact your super admin to request access.
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>💳 Payment Methods</h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Configure payment processing options for your store</p>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Available Payment Methods</h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div 
            onClick={() => setSelectedPaymentMethod('stripe')}
            style={{
              border: selectedPaymentMethod === 'stripe' ? '2px solid var(--primary-color)' : '2px solid var(--border-color)',
              borderRadius: '8px',
              padding: '1.5rem',
              cursor: 'pointer',
              minWidth: '200px',
              background: selectedPaymentMethod === 'stripe' ? 'rgba(124, 92, 255, 0.12)' : 'var(--bg-primary)',
              transition: 'all 0.2s'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '2rem' }}>💳</span>
              <h3 style={{ margin: 0 }}>Stripe</h3>
            </div>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Accept credit cards, Apple Pay, Google Pay, and more
            </p>
            <div style={{ marginTop: '0.75rem' }}>
              <span className={`status-badge ${config?.isActive ? 'active' : 'inactive'}`}>
                {config?.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
          
          <div 
            style={{
              border: '2px dashed var(--border-color)',
              borderRadius: '8px',
              padding: '1.5rem',
              minWidth: '200px',
              background: 'var(--bg-tertiary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)'
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>+</div>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>More payment methods coming soon</p>
            </div>
          </div>
        </div>
      </div>

      {selectedPaymentMethod === 'stripe' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Stripe Configuration</h2>
          </div>

          <div className="admin-form" style={{ maxWidth: '800px' }}>
            <div className="info-box" style={{
              padding: '1rem',
              backgroundColor: 'rgba(251, 191, 36, 0.12)',
              borderRadius: '8px',
              marginBottom: '2rem',
              border: '1px solid rgba(251, 191, 36, 0.5)'
            }}>
          <h3 style={{ marginTop: 0, color: '#fde68a' }}>⚠️ Security Notice</h3>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#fde68a' }}>
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
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
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
                color: 'var(--primary-color)',
                cursor: 'pointer',
                fontSize: '0.85rem',
                padding: '0.25rem 0.5rem'
              }}
            >
              {showSecretKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--error-color)', marginTop: '0.25rem' }}>
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
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
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
            disabled={testing || !isActive || !String(secretKey).trim()}
          >
            {testing ? '⏳ Testing...' : '🔗 Test Connection'}
          </button>
        </div>

        <div style={{
          marginTop: '2rem',
          padding: '1rem',
          backgroundColor: 'var(--bg-tertiary)',
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
            backgroundColor: 'rgba(124, 92, 255, 0.12)',
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
      )}
    </div>
  );
};

export default AdminPayments;
