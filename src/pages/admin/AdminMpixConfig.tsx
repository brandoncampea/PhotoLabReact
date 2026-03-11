import React, { useState, useEffect } from 'react';
import { mpixService } from '../../services/mpixService';

interface MpixConfigState {
  enabled: boolean;
  apiKey: string;
  apiSecret: string;
  environment: 'sandbox' | 'production';
  shipFromName: string;
  shipFromPhone: string;
  shipFromEmail: string;
}

const AdminMpixConfig: React.FC = () => {
  const [config, setConfig] = useState<MpixConfigState>({
    enabled: false,
    apiKey: '',
    apiSecret: '',
    environment: 'sandbox',
    shipFromName: '',
    shipFromPhone: '',
    shipFromEmail: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const savedConfig = mpixService.getConfig();
    setConfig({
      enabled: savedConfig.enabled,
      apiKey: savedConfig.apiKey,
      apiSecret: savedConfig.apiSecret,
      environment: savedConfig.environment,
      shipFromName: savedConfig.shipFromName || '',
      shipFromPhone: savedConfig.shipFromPhone || '',
      shipFromEmail: savedConfig.shipFromEmail || '',
    });
  }, []);

  const handleSave = () => {
    setLoading(true);
    setMessage(null);
    try {
      mpixService.saveConfig(config);
      setMessage({ type: 'success', text: 'Configuration saved successfully' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Failed to save configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const result = await mpixService.testConnection();
      setMessage({
        type: result.success ? 'success' : 'error',
        text: result.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    setConfig({ ...config, enabled: !config.enabled });
  };

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>📦 Mpix Configuration</h1>
      </div>

      {message && (
        <div className={message.type === 'success' ? 'info-box-success' : 'info-box-error'} style={{ marginBottom: '20px' }}>
          {message.type === 'success' ? '✓' : '✗'} {message.text}
        </div>
      )}

      <div className="admin-section-card">
        <h2 style={{ marginTop: 0 }}>Configuration</h2>

        {/* Enable/Disable Toggle */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={handleToggle}
              style={{ width: '18px', height: '18px' }}
            />
            <span style={{ fontSize: '16px', fontWeight: 500 }}>Enable Mpix Integration</span>
          </label>
          <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
            When enabled, Mpix will be available as a fulfillment provider for orders
          </p>
        </div>

        {/* API Credentials */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
            API Key *
          </label>
          <input
            type="password"
            value={config.apiKey}
            onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
            placeholder="Enter your Mpix API Key"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              boxSizing: 'border-box',
            }}
          />
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
            From your Mpix developer account
          </p>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
            API Secret *
          </label>
          <input
            type="password"
            value={config.apiSecret}
            onChange={(e) => setConfig({ ...config, apiSecret: e.target.value })}
            placeholder="Enter your Mpix API Secret"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              boxSizing: 'border-box',
            }}
          />
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
            Keep this secret and never share publicly
          </p>
        </div>

        {/* Environment Selection */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
            Environment
          </label>
          <select
            value={config.environment}
            onChange={(e) => setConfig({ ...config, environment: e.target.value as 'sandbox' | 'production' })}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              boxSizing: 'border-box',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="sandbox">Sandbox (Testing)</option>
            <option value="production">Production (Live)</option>
          </select>
          <p className="muted-text" style={{ margin: '4px 0 0 0', fontSize: '12px' }}>
            Use sandbox for testing, production for live orders
          </p>
        </div>

        {/* Ship From Details */}
        <h3 style={{ marginTop: '30px', marginBottom: '15px' }}>Ship From Address (Optional)</h3>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
            Name
          </label>
          <input
            type="text"
            value={config.shipFromName}
            onChange={(e) => setConfig({ ...config, shipFromName: e.target.value })}
            placeholder="Your name or business name"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              boxSizing: 'border-box',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
            Phone
          </label>
          <input
            type="tel"
            value={config.shipFromPhone}
            onChange={(e) => setConfig({ ...config, shipFromPhone: e.target.value })}
            placeholder="Phone number"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              boxSizing: 'border-box',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        <div style={{ marginBottom: '30px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
            Email
          </label>
          <input
            type="email"
            value={config.shipFromEmail}
            onChange={(e) => setConfig({ ...config, shipFromEmail: e.target.value })}
            placeholder="Email address"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              boxSizing: 'border-box',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleSave}
            disabled={loading}
            className="btn btn-success"
            style={{ opacity: loading ? 0.6 : 1 }}
          >
            {loading ? 'Saving...' : '💾 Save Configuration'}
          </button>

          <button
            onClick={handleTestConnection}
            disabled={loading || !config.apiKey || !config.apiSecret}
            className="btn btn-primary"
            style={{ opacity: loading || !config.apiKey || !config.apiSecret ? 0.5 : 1 }}
          >
            {loading ? 'Testing...' : '🔗 Test Connection'}
          </button>
        </div>

        {/* Info Box */}
        <div className="info-box-blue" style={{ marginTop: '30px' }}>
          <h4 style={{ margin: '0 0 10px 0' }}>📋 About Mpix</h4>
          <p style={{ margin: '0 0 8px 0', fontSize: '14px' }}>
            Mpix (https://devapi.mpix.com/) is a professional photo printing service offering:
          </p>
          <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px', fontSize: '14px' }}>
            <li>Professional photographic prints</li>
            <li>Fine art and archival prints</li>
            <li>Metal, canvas, and acrylic prints</li>
            <li>Photo books and albums</li>
            <li>Custom cards and stationery</li>
            <li>Fast production and shipping</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AdminMpixConfig;
