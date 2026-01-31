import { useState, useEffect } from 'react';
import { whccService } from '../../services/whccService';

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
      }
    } catch (err) {
      console.error('Failed to load WHCC config:', err);
    }
  }, []);

  const handleSave = () => {
    try {
      const config = {
        enabled,
        consumerKey,
        consumerSecret,
        isSandbox,
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

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
      <h1>WHCC Configuration</h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>
        Configure your Whitehouse Custom Colour (WHCC) API credentials for order submission.
      </p>

      {error && (
        <div style={{ backgroundColor: '#ffebee', padding: '12px', marginBottom: '20px', borderRadius: '4px', color: '#c62828' }}>
          ✗ {error}
        </div>
      )}

      {saved && (
        <div style={{ backgroundColor: '#e8f5e9', padding: '12px', marginBottom: '20px', borderRadius: '4px', color: '#2e7d32' }}>
          ✓ Configuration saved successfully
        </div>
      )}

      {testResult && (
        <div
          style={{
            backgroundColor: testResult.startsWith('✓') ? '#e8f5e9' : '#ffebee',
            padding: '12px',
            marginBottom: '20px',
            borderRadius: '4px',
            color: testResult.startsWith('✓') ? '#2e7d32' : '#c62828',
          }}
        >
          {testResult}
        </div>
      )}

      <div style={{ backgroundColor: '#f5f5f5', padding: '20px', borderRadius: '8px', marginBottom: '30px' }}>
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
          <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
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
          <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
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
              border: '1px solid #ddd',
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
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '12px',
              boxSizing: 'border-box',
            }}
          />
          <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
            This will be stored in localStorage. Consider using environment variables for sensitive data.
          </p>
        </div>

        <button
          onClick={handleTestConnection}
          disabled={!consumerKey || !consumerSecret || isTestLoading}
          style={{
            padding: '10px 20px',
            backgroundColor: isTestLoading ? '#ccc' : '#2196f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isTestLoading ? 'not-allowed' : 'pointer',
            fontWeight: 500,
          }}
        >
          {isTestLoading ? 'Testing...' : 'Test Connection'}
        </button>
      </div>

      <div style={{ backgroundColor: '#f5f5f5', padding: '20px', borderRadius: '8px', marginBottom: '30px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '15px' }}>Ship From Address</h2>
        <p style={{ fontSize: '12px', color: '#666', marginBottom: '15px' }}>
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
              border: '1px solid #ddd',
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
              border: '1px solid #ddd',
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
              border: '1px solid #ddd',
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
                border: '1px solid #ddd',
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
                border: '1px solid #ddd',
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
              border: '1px solid #ddd',
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
              border: '1px solid #ddd',
              borderRadius: '4px',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '30px' }}>
        <button
          onClick={handleSave}
          style={{
            padding: '12px 30px',
            backgroundColor: '#4caf50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '14px',
          }}
        >
          Save Configuration
        </button>
      </div>

      <div style={{ backgroundColor: '#f0f4ff', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
        <h3 style={{ fontSize: '14px', marginBottom: '10px' }}>ℹ️ Integration Notes</h3>
        <ul style={{ fontSize: '12px', color: '#333', lineHeight: '1.6', marginLeft: '20px' }}>
          <li>
            <strong>API Credentials:</strong> Obtain from{' '}
            <a href="https://developer.whcc.com" target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2' }}>
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

      <div style={{ backgroundColor: '#fff3e0', padding: '20px', borderRadius: '8px' }}>
        <h3 style={{ fontSize: '14px', marginBottom: '10px' }}>⚠️ Production Checklist</h3>
        <ul style={{ fontSize: '12px', color: '#333', lineHeight: '1.6', marginLeft: '20px' }}>
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
