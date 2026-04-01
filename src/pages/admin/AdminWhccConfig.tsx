import { useState, useEffect } from 'react';
import { whccService, WhccWebhookStatus } from '../../services/whccService';

const formatWebhookSummary = (webhookStatus: WhccWebhookStatus | null) => {
  const payload = webhookStatus?.lastPayload;
  const shippingInfo = Array.isArray(payload?.ShippingInfo) ? payload.ShippingInfo[0] : null;

  return {
    event: payload?.Event || null,
    status: payload?.Status || null,
    orderNumber: payload?.OrderNumber || null,
    confirmationId: payload?.ConfirmationId || payload?.ConfirmationID || null,
    carrier: shippingInfo?.Carrier || null,
    trackingNumber: shippingInfo?.TrackingNumber || null,
    trackingUrl: shippingInfo?.TrackingUrl || null,
    shipDate: shippingInfo?.ShipDate || null,
  };
};

const AdminWhccConfig = () => {
  const [enabled, setEnabled] = useState(false);
  const [consumerKey, setConsumerKey] = useState('');
  const [consumerSecret, setConsumerSecret] = useState('');
  const [isSandbox, setIsSandbox] = useState(true);
  const [shipFromName, setShipFromName] = useState('');
  const [shipFromAddr1, setShipFromAddr1] = useState('');
  const [shipFromAddr2, setShipFromAddr2] = useState('');
  const [shipFromCity, setShipFromCity] = useState('');
  const [shipFromState, setShipFromState] = useState('');
  const [shipFromZip, setShipFromZip] = useState('');
  const [shipFromPhone, setShipFromPhone] = useState('');
  const [webhookCallbackUri, setWebhookCallbackUri] = useState('');
  const [webhookStatus, setWebhookStatus] = useState<WhccWebhookStatus | null>(null);
  const [webhookMessage, setWebhookMessage] = useState<string | null>(null);
  const [isWebhookLoading, setIsWebhookLoading] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTestLoading, setIsTestLoading] = useState(false);

  // Load config from localStorage
  useEffect(() => {
    try {
      const config = localStorage.getItem('whccConfig');
      if (config) {
        const parsed = JSON.parse(config);
        setEnabled(parsed.enabled || false);
        setConsumerKey(parsed.consumerKey || '');
        setConsumerSecret(parsed.consumerSecret || '');
        setIsSandbox(parsed.isSandbox ?? true);
        setWebhookCallbackUri(parsed.webhookCallbackUri || whccService.getDefaultWebhookCallbackUri());
        
        if (parsed.shipFromAddress) {
          const addr = parsed.shipFromAddress;
          setShipFromName(addr.name || '');
          setShipFromAddr1(addr.addr1 || '');
          setShipFromAddr2(addr.addr2 || '');
          setShipFromCity(addr.city || '');
          setShipFromState(addr.state || '');
          setShipFromZip(addr.zip || '');
          setShipFromPhone(addr.phone || '');
        }
      } else {
        setWebhookCallbackUri(whccService.getDefaultWebhookCallbackUri());
      }
    } catch (err) {
      console.error('Failed to load WHCC config:', err);
    }
  }, []);

  useEffect(() => {
    const loadWebhookStatus = async () => {
      try {
        const status = await whccService.getWebhookStatus();
        setWebhookStatus(status);
      } catch {
        setWebhookStatus(null);
      }
    };
    loadWebhookStatus();
  }, []);

  const handleSave = () => {
    try {
      const config = {
        enabled,
        consumerKey,
        consumerSecret,
        isSandbox,
        webhookCallbackUri,
        shipFromAddress: {
          name: shipFromName,
          addr1: shipFromAddr1,
          addr2: shipFromAddr2,
          city: shipFromCity,
          state: shipFromState,
          zip: shipFromZip,
          country: 'US',
          phone: shipFromPhone,
        },
      };

      localStorage.setItem('whccConfig', JSON.stringify(config));
      setSaved(true);
      setError(null);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError('Failed to save configuration');
    }
  };

  const refreshWebhookStatus = async () => {
    setIsWebhookLoading(true);
    setWebhookMessage(null);
    try {
      const status = await whccService.getWebhookStatus();
      setWebhookStatus(status);
    } catch (err) {
      setWebhookMessage(`Failed to load webhook status: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsWebhookLoading(false);
    }
  };

  const handleRegisterWebhook = async () => {
    setIsWebhookLoading(true);
    setWebhookMessage(null);
    try {
      await whccService.registerWebhook(webhookCallbackUri);
      setWebhookMessage('✓ Webhook registration requested. WHCC should send a verifier callback immediately.');
      await refreshWebhookStatus();
    } catch (err) {
      setWebhookMessage(`✗ Failed to register webhook: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setIsWebhookLoading(false);
    }
  };

  const handleVerifyWebhook = async () => {
    setIsWebhookLoading(true);
    setWebhookMessage(null);
    try {
      await whccService.verifyWebhook(webhookStatus?.lastVerifier || undefined);
      setWebhookMessage('✓ Webhook verified successfully.');
      await refreshWebhookStatus();
    } catch (err) {
      setWebhookMessage(`✗ Failed to verify webhook: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setIsWebhookLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTestLoading(true);
    setTestResult(null);

    // Temporarily save config for test
    const tempConfig = {
      enabled: true,
      consumerKey,
      consumerSecret,
      isSandbox,
    };
    localStorage.setItem('whccConfig', JSON.stringify(tempConfig));

    try {
      const isConnected = await whccService.testConnection();
      setTestResult(
        isConnected
          ? '✓ Connection successful! Credentials are valid.'
          : '✗ Connection failed. Check your credentials.'
      );
    } catch (err) {
      setTestResult(`✗ Connection failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsTestLoading(false);
    }
  };

  const webhookSummary = formatWebhookSummary(webhookStatus);

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
      <h1>WHCC Configuration</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '30px' }}>
        Configure your Whitehouse Custom Colour (WHCC) API credentials for order submission.
      </p>

      {error && (
        <div className="info-box-error" style={{ marginBottom: '20px' }}>
          ✗ {error}
        </div>
      )}

      {saved && (
        <div className="info-box-success" style={{ marginBottom: '20px' }}>
          ✓ Configuration saved successfully
        </div>
      )}

      {testResult && (
        <div className={testResult.startsWith('✓') ? 'info-box-success' : 'info-box-error'} style={{ marginBottom: '20px' }}>
          {testResult}
        </div>
      )}

      <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '20px', borderRadius: '8px', marginBottom: '30px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '15px' }}>Basic Settings</h2>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <span style={{ cursor: 'pointer', fontWeight: 500 }}>Enable WHCC Integration</span>
          </label>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '5px' }}>
            When enabled, orders will be submitted to WHCC instead of the standard backend.
          </p>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
            Environment
          </label>
          <div style={{ display: 'flex', gap: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="radio"
                name="environment"
                checked={isSandbox}
                onChange={() => setIsSandbox(true)}
                style={{ cursor: 'pointer' }}
              />
              <span>Sandbox (Development)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="radio"
                name="environment"
                checked={!isSandbox}
                onChange={() => setIsSandbox(false)}
                style={{ cursor: 'pointer' }}
              />
              <span>Production</span>
            </label>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '5px' }}>
            Use Sandbox for testing. Switch to Production when ready.
          </p>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
            Consumer Key
          </label>
          <input
            type="text"
            value={consumerKey}
            onChange={(e) => setConsumerKey(e.target.value)}
            placeholder="B431BE78D2E9FFFE3709"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '12px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
            Consumer Secret
          </label>
          <input
            type="password"
            value={consumerSecret}
            onChange={(e) => setConsumerSecret(e.target.value)}
            placeholder="RkZGRTM3MDk="
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '12px',
              boxSizing: 'border-box',
            }}
          />
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '5px' }}>
            This will be stored in localStorage. Consider using environment variables for sensitive data.
          </p>
        </div>

        <button
          onClick={handleTestConnection}
          disabled={!consumerKey || !consumerSecret || isTestLoading}
          className="btn btn-primary"
          style={{
            padding: '10px 20px',
            fontWeight: 500,
            opacity: isTestLoading || !consumerKey || !consumerSecret ? 0.5 : 1,
          }}
        >
          {isTestLoading ? 'Testing...' : 'Test Connection'}
        </button>
      </div>

      <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '20px', borderRadius: '8px', marginBottom: '30px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '15px' }}>Ship From Address</h2>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '15px' }}>
          This address will appear on shipping labels and is used for undeliverable returns.
        </p>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Name</label>
          <input
            type="text"
            value={shipFromName}
            onChange={(e) => setShipFromName(e.target.value)}
            placeholder="Returns Department"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Address 1</label>
          <input
            type="text"
            value={shipFromAddr1}
            onChange={(e) => setShipFromAddr1(e.target.value)}
            placeholder="3432 Denmark Ave"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Address 2 (Optional)</label>
          <input
            type="text"
            value={shipFromAddr2}
            onChange={(e) => setShipFromAddr2(e.target.value)}
            placeholder="Suite 390"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>City</label>
            <input
              type="text"
              value={shipFromCity}
              onChange={(e) => setShipFromCity(e.target.value)}
              placeholder="Eagan"
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 5}}>State</label>
            <input
              type="text"
              value={shipFromState}
              onChange={(e) => setShipFromState(e.target.value.toUpperCase())}
              placeholder="MN"
              maxLength={2}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Zip Code</label>
          <input
            type="text"
            value={shipFromZip}
            onChange={(e) => setShipFromZip(e.target.value)}
            placeholder="55123"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Phone (Optional)</label>
          <input
            type="text"
            value={shipFromPhone}
            onChange={(e) => setShipFromPhone(e.target.value)}
            placeholder="8002525234"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '30px' }}>
        <button
          onClick={handleSave}
          className="btn btn-success"
          style={{
            padding: '12px 30px',
            fontWeight: 500,
            fontSize: '14px',
          }}
        >
          Save Configuration
        </button>
      </div>

      <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '20px', borderRadius: '8px', marginBottom: '30px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '15px' }}>Webhooks</h2>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '15px' }}>
          Register a public callback URL so WHCC can send verifier, status, and shipped tracking updates for this studio.
        </p>

        {webhookMessage && (
          <div className={webhookMessage.startsWith('✓') ? 'info-box-success' : 'info-box-error'} style={{ marginBottom: '20px' }}>
            {webhookMessage}
          </div>
        )}

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Webhook Callback URL</label>
          <input
            type="url"
            value={webhookCallbackUri}
            onChange={(e) => setWebhookCallbackUri(e.target.value)}
            placeholder="https://your-domain.com/api/webhooks/whcc"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              boxSizing: 'border-box',
            }}
          />
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '5px' }}>
            Must be a public HTTPS URL. The studio ID is appended automatically during registration.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
          <button onClick={handleRegisterWebhook} disabled={!consumerKey || !consumerSecret || !webhookCallbackUri || isWebhookLoading} className="btn btn-primary" style={{ opacity: !consumerKey || !consumerSecret || !webhookCallbackUri || isWebhookLoading ? 0.5 : 1 }}>
            {isWebhookLoading ? 'Working...' : 'Register Webhook'}
          </button>
          <button onClick={handleVerifyWebhook} disabled={!webhookStatus?.lastVerifier || isWebhookLoading} className="btn btn-success" style={{ opacity: !webhookStatus?.lastVerifier || isWebhookLoading ? 0.5 : 1 }}>
            Verify Webhook
          </button>
          <button onClick={refreshWebhookStatus} disabled={isWebhookLoading} className="btn btn-secondary" style={{ opacity: isWebhookLoading ? 0.5 : 1 }}>
            Refresh Status
          </button>
        </div>

        <div className="info-box-blue">
          <div style={{ fontSize: '12px', lineHeight: '1.7' }}>
            <div><strong>Registered callback:</strong> {webhookStatus?.callbackUri || 'Not registered'}</div>
            <div><strong>Last verifier:</strong> {webhookStatus?.lastVerifier || 'None yet'}</div>
            <div><strong>Verified at:</strong> {webhookStatus?.verifiedAt ? new Date(webhookStatus.verifiedAt).toLocaleString() : 'Not verified'}</div>
            <div><strong>Last webhook received:</strong> {webhookStatus?.lastReceivedAt ? new Date(webhookStatus.lastReceivedAt).toLocaleString() : 'None yet'}</div>
          </div>
        </div>

        <div className="info-box-blue" style={{ marginTop: '15px' }}>
          <h3 style={{ fontSize: '14px', marginBottom: '10px' }}>Latest Order Event</h3>
          <div style={{ fontSize: '12px', lineHeight: '1.7' }}>
            <div><strong>Event:</strong> {webhookSummary.event || 'None yet'}</div>
            <div><strong>Status:</strong> {webhookSummary.status || 'None yet'}</div>
            <div><strong>WHCC Order #:</strong> {webhookSummary.orderNumber || 'None yet'}</div>
            <div><strong>Confirmation ID:</strong> {webhookSummary.confirmationId || 'None yet'}</div>
            <div><strong>Carrier:</strong> {webhookSummary.carrier || 'None yet'}</div>
            <div><strong>Tracking Number:</strong> {webhookSummary.trackingNumber || 'None yet'}</div>
            <div><strong>Ship Date:</strong> {webhookSummary.shipDate ? new Date(webhookSummary.shipDate).toLocaleString() : 'None yet'}</div>
            <div><strong>Tracking URL:</strong> {webhookSummary.trackingUrl ? <a href={webhookSummary.trackingUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-color)' }}>{webhookSummary.trackingUrl}</a> : 'None yet'}</div>
          </div>
        </div>
      </div>

      <div className="info-box-blue" style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '14px', marginBottom: '10px' }}>ℹ️ Integration Notes</h3>
        <ul style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: '1.6', marginLeft: '20px' }}>
          <li>
            <strong>API Credentials:</strong> Obtain from{' '}
            <a href="https://developer.whcc.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-color)' }}>
              WHCC Developer Portal
            </a>
          </li>
          <li>
            <strong>Sandbox Testing:</strong> Use Sandbox environment first to test your integration.
          </li>
          <li>
            <strong>Image Requirements:</strong> All images must be accessible via HTTPS URI (e.g., S3 bucket).
          </li>
          <li>
            <strong>Product UIDs:</strong> Map your products to WHCC ProductUIDs in your cart system.
          </li>
          <li>
            <strong>Webhooks:</strong> Configure WHCC webhooks to receive order status updates.
          </li>
          <li>
            <strong>Tokens:</strong> Access tokens are cached for 1 hour. New tokens are requested automatically.
          </li>
        </ul>
      </div>

      <div className="info-box-warning">
        <h3 style={{ fontSize: '14px', marginBottom: '10px' }}>⚠️ Production Checklist</h3>
        <ul style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: '1.6', marginLeft: '20px' }}>
          <li>Store credentials in environment variables, not localStorage</li>
          <li>Use Production environment URLs when live</li>
          <li>Test order submission with real products</li>
          <li>Implement webhook receivers for order updates</li>
          <li>Set up proper error handling and logging</li>
          <li>Calculate actual MD5 hashes for image assets</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminWhccConfig;
