import React, { useState, useEffect } from 'react';

interface RoesConfig {
  apiKey: string;
  configId: string;
  enabled: boolean;
}

const AdminRoesConfig: React.FC = () => {
  const [config, setConfig] = useState<RoesConfig>({
    apiKey: '',
    configId: '',
    enabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testStatus, setTestStatus] = useState<string>('');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      // Load from localStorage or from API endpoint
      const stored = localStorage.getItem('roesConfig');
      if (stored) {
        setConfig(JSON.parse(stored));
      }
      setLoading(false);
    } catch (error) {
      console.error('Failed to load ROES config:', error);
      setMessage({ type: 'error', text: 'Failed to load ROES configuration.' });
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof RoesConfig, value: string | boolean) => {
    setConfig((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      // Save to localStorage (can be extended to API later)
      localStorage.setItem('roesConfig', JSON.stringify(config));
      setMessage({ type: 'success', text: 'ROES configuration saved successfully.' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Failed to save ROES config:', error);
      setMessage({ type: 'error', text: 'Failed to save ROES configuration.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTestStatus('Testing connection...');
      
      // Test by checking if window.$roes loads with the key
      const testScript = document.createElement('script');
      testScript.src = 'https://roeswebtest.com/roesWebComponents.js';
      testScript.async = true;
      testScript.onload = () => {
        if (window.$roes?.EventBus) {
          window.$roes.EventBus.emit('apikey', config.apiKey);
          window.$roes.EventBus.on('config_loaded', (id: string) => {
            setTestStatus(`✓ Connection successful. Config ID: ${id}`);
            setTimeout(() => setTestStatus(''), 3000);
          });
          setTimeout(() => {
            if (testStatus === 'Testing connection...') {
              setTestStatus('⚠ Waiting for config load (may require valid API key and config ID)');
            }
          }, 2000);
        } else {
          setTestStatus('✗ Failed to load ROES Web Components');
        }
      };
      testScript.onerror = () => {
        setTestStatus('✗ Failed to load ROES Web Components script');
      };
      document.head.appendChild(testScript);
    } catch (error) {
      setTestStatus(`✗ Test failed: ${(error as Error).message}`);
    }
  };

  if (loading) {
    return <div className="admin-page"><p>Loading...</p></div>;
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h1>ROES Web Configuration</h1>
        <p>Manage ROES Web Components API settings for order editing and integration.</p>
      </div>

      {message && (
        <div className={`admin-message ${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="admin-form-section">
        <div className="form-group">
          <label htmlFor="enabled">
            <input
              type="checkbox"
              id="enabled"
              checked={config.enabled}
              onChange={(e) => handleInputChange('enabled', e.target.checked)}
            />
            Enable ROES Web Integration
          </label>
          <small>Check this to enable ROES Web Components functionality throughout the app.</small>
        </div>

        <div className="form-group">
          <label htmlFor="apiKey">API Key</label>
          <textarea
            id="apiKey"
            value={config.apiKey}
            onChange={(e) => handleInputChange('apiKey', e.target.value)}
            placeholder="Paste your ROES API key here..."
            rows={4}
            disabled={!config.enabled}
          />
          <small>
            Get your API key from{' '}
            <a href="https://roeswebtest.com/webcomponents" target="_blank" rel="noopener noreferrer">
              ROES Web Components
            </a>
            . If left empty, a demo key will be used.
          </small>
        </div>

        <div className="form-group">
          <label htmlFor="configId">Config ID (Optional)</label>
          <input
            type="text"
            id="configId"
            value={config.configId}
            onChange={(e) => handleInputChange('configId', e.target.value)}
            placeholder="e.g., LabNameRWTest"
            disabled={!config.enabled}
          />
          <small>Optional ROES config ID. Defaults to demo if not provided.</small>
        </div>

        <div className="form-actions">
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !config.enabled}
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleTestConnection}
            disabled={!config.apiKey && !config.enabled}
          >
            Test Connection
          </button>
        </div>

        {testStatus && (
          <div className={`test-result ${testStatus.startsWith('✓') ? 'success' : testStatus.startsWith('✗') ? 'error' : 'info'}`}>
            {testStatus}
          </div>
        )}
      </div>

      <div className="admin-info-section">
        <h3>About ROES Web Components</h3>
        <p>
          ROES Web Components (RWC) provides embedded photo editing, cropping, and order management
          capabilities. The integration allows customers to:
        </p>
        <ul>
          <li>Edit and crop photos directly in your app</li>
          <li>Access ROES product catalog and templates</li>
          <li>Build and manage orders with ROES backend</li>
          <li>Capture order data for processing</li>
        </ul>

        <h4>Key Features</h4>
        <ul>
          <li><strong>Embedded Editor:</strong> Full editing UI in your application</li>
          <li><strong>Event Bus:</strong> Real-time communication between your app and ROES</li>
          <li><strong>Catalog Integration:</strong> Access your lab's product templates and pricing</li>
          <li><strong>Price Customization:</strong> Override or adjust prices dynamically</li>
        </ul>

        <h4>Integration Points</h4>
        <p>Visit <code>/roes-web</code> page to test the embedded editor and inspect event payloads.</p>
      </div>
    </div>
  );
};

export default AdminRoesConfig;
