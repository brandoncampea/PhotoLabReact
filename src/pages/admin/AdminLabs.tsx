import React, { useState, useEffect } from 'react';
import { mpixService } from '../../services/mpixService';
import { siteConfigService } from '../../services/siteConfigService';

interface RoesConfig {
  apiKey: string;
  configId: string;
  enabled: boolean;
}

interface WhccConfig {
  enabled: boolean;
  consumerKey: string;
  consumerSecret: string;
  isSandbox: boolean;
  shipFromName: string;
  shipFromAddr1: string;
  shipFromAddr2: string;
  shipFromCity: string;
  shipFromState: string;
  shipFromZip: string;
  shipFromPhone: string;
}

interface MpixConfigState {
  enabled: boolean;
  apiKey: string;
  apiSecret: string;
  environment: 'sandbox' | 'production';
  shipFromName: string;
  shipFromPhone: string;
  shipFromEmail: string;
}

const AdminLabs: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'roes' | 'whcc' | 'mpix'>('roes');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ROES State
  const [roesConfig, setRoesConfig] = useState<RoesConfig>({
    apiKey: '',
    configId: '',
    enabled: false,
  });

  // WHCC State
  const [whccConfig, setWhccConfig] = useState<WhccConfig>({
    enabled: false,
    consumerKey: '',
    consumerSecret: '',
    isSandbox: true,
    shipFromName: '',
    shipFromAddr1: '',
    shipFromAddr2: '',
    shipFromCity: '',
    shipFromState: '',
    shipFromZip: '',
    shipFromPhone: '',
  });

  // Mpix State
  const [mpixConfig, setMpixConfig] = useState<MpixConfigState>({
    enabled: false,
    apiKey: '',
    apiSecret: '',
    environment: 'sandbox',
    shipFromName: '',
    shipFromPhone: '',
    shipFromEmail: '',
  });

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = () => {
    // Load ROES
    const storedRoes = localStorage.getItem('roesConfig');
    if (storedRoes) {
      setRoesConfig(JSON.parse(storedRoes));
    }

    // Load WHCC
    const storedWhcc = localStorage.getItem('whccConfig');
    if (storedWhcc) {
      const parsed = JSON.parse(storedWhcc);
      setWhccConfig({
        enabled: parsed.enabled || false,
        consumerKey: parsed.consumerKey || '',
        consumerSecret: parsed.consumerSecret || '',
        isSandbox: parsed.isSandbox ?? true,
        shipFromName: parsed.shipFromAddress?.name || '',
        shipFromAddr1: parsed.shipFromAddress?.addr1 || '',
        shipFromAddr2: parsed.shipFromAddress?.addr2 || '',
        shipFromCity: parsed.shipFromAddress?.city || '',
        shipFromState: parsed.shipFromAddress?.state || '',
        shipFromZip: parsed.shipFromAddress?.zip || '',
        shipFromPhone: parsed.shipFromAddress?.phone || '',
      });
    }

    // Load Mpix
    const savedMpixConfig = mpixService.getConfig();
    setMpixConfig({
      enabled: savedMpixConfig.enabled,
      apiKey: savedMpixConfig.apiKey,
      apiSecret: savedMpixConfig.apiSecret,
      environment: savedMpixConfig.environment,
      shipFromName: savedMpixConfig.shipFromName || '',
      shipFromPhone: savedMpixConfig.shipFromPhone || '',
      shipFromEmail: savedMpixConfig.shipFromEmail || '',
    });
  };

  const handleRoesSave = () => {
    try {
      localStorage.setItem('roesConfig', JSON.stringify(roesConfig));
      siteConfigService.setSiteEnabled('roes', roesConfig.enabled);
      setMessage({ type: 'success', text: 'ROES configuration saved successfully.' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save ROES configuration.' });
    }
  };

  const handleWhccSave = () => {
    try {
      const config = {
        enabled: whccConfig.enabled,
        consumerKey: whccConfig.consumerKey,
        consumerSecret: whccConfig.consumerSecret,
        isSandbox: whccConfig.isSandbox,
        shipFromAddress: {
          name: whccConfig.shipFromName,
          addr1: whccConfig.shipFromAddr1,
          addr2: whccConfig.shipFromAddr2,
          city: whccConfig.shipFromCity,
          state: whccConfig.shipFromState,
          zip: whccConfig.shipFromZip,
          phone: whccConfig.shipFromPhone,
        },
      };
      localStorage.setItem('whccConfig', JSON.stringify(config));
      siteConfigService.setSiteEnabled('whcc', whccConfig.enabled);
      setMessage({ type: 'success', text: 'WHCC configuration saved successfully.' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save WHCC configuration.' });
    }
  };

  const handleMpixSave = () => {
    try {
      mpixService.saveConfig(mpixConfig);
      siteConfigService.setSiteEnabled('mpix', mpixConfig.enabled);
      setMessage({ type: 'success', text: 'Mpix configuration saved successfully.' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Failed to save Mpix configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  };

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>Lab Configuration</h1>
        <p>Configure your printing lab integrations (ROES, WHCC, Mpix)</p>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="tab-container">
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'roes' ? 'active' : ''}`}
            onClick={() => setActiveTab('roes')}
          >
            ⚙️ ROES
          </button>
          <button
            className={`tab ${activeTab === 'whcc' ? 'active' : ''}`}
            onClick={() => setActiveTab('whcc')}
          >
            📦 WHCC
          </button>
          <button
            className={`tab ${activeTab === 'mpix' ? 'active' : ''}`}
            onClick={() => setActiveTab('mpix')}
          >
            📸 Mpix
          </button>
        </div>

        <div className="tab-content">
          {/* ROES Configuration */}
          {activeTab === 'roes' && (
            <div className="config-section">
              <h2>ROES Web Components Configuration</h2>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={roesConfig.enabled}
                    onChange={(e) =>
                      setRoesConfig({ ...roesConfig, enabled: e.target.checked })
                    }
                  />
                  Enable ROES
                </label>
              </div>

              <div className="form-group">
                <label>API Key</label>
                <input
                  type="password"
                  value={roesConfig.apiKey}
                  onChange={(e) =>
                    setRoesConfig({ ...roesConfig, apiKey: e.target.value })
                  }
                  placeholder="Enter ROES API Key"
                />
              </div>

              <div className="form-group">
                <label>Config ID</label>
                <input
                  type="text"
                  value={roesConfig.configId}
                  onChange={(e) =>
                    setRoesConfig({ ...roesConfig, configId: e.target.value })
                  }
                  placeholder="Enter ROES Config ID"
                />
              </div>

              <button onClick={handleRoesSave} className="btn btn-primary">
                Save ROES Configuration
              </button>
            </div>
          )}

          {/* WHCC Configuration */}
          {activeTab === 'whcc' && (
            <div className="config-section">
              <h2>WHCC Configuration</h2>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={whccConfig.enabled}
                    onChange={(e) =>
                      setWhccConfig({ ...whccConfig, enabled: e.target.checked })
                    }
                  />
                  Enable WHCC
                </label>
              </div>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={whccConfig.isSandbox}
                    onChange={(e) =>
                      setWhccConfig({ ...whccConfig, isSandbox: e.target.checked })
                    }
                  />
                  Use Sandbox Environment
                </label>
              </div>

              <div className="form-group">
                <label>Consumer Key</label>
                <input
                  type="password"
                  value={whccConfig.consumerKey}
                  onChange={(e) =>
                    setWhccConfig({ ...whccConfig, consumerKey: e.target.value })
                  }
                  placeholder="Enter Consumer Key"
                />
              </div>

              <div className="form-group">
                <label>Consumer Secret</label>
                <input
                  type="password"
                  value={whccConfig.consumerSecret}
                  onChange={(e) =>
                    setWhccConfig({ ...whccConfig, consumerSecret: e.target.value })
                  }
                  placeholder="Enter Consumer Secret"
                />
              </div>

              <h3>Ship From Address</h3>
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={whccConfig.shipFromName}
                  onChange={(e) =>
                    setWhccConfig({ ...whccConfig, shipFromName: e.target.value })
                  }
                  placeholder="Name"
                />
              </div>

              <div className="form-group">
                <label>Address Line 1</label>
                <input
                  type="text"
                  value={whccConfig.shipFromAddr1}
                  onChange={(e) =>
                    setWhccConfig({ ...whccConfig, shipFromAddr1: e.target.value })
                  }
                  placeholder="Address"
                />
              </div>

              <div className="form-group">
                <label>Address Line 2 (Optional)</label>
                <input
                  type="text"
                  value={whccConfig.shipFromAddr2}
                  onChange={(e) =>
                    setWhccConfig({ ...whccConfig, shipFromAddr2: e.target.value })
                  }
                  placeholder="Address 2"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>City</label>
                  <input
                    type="text"
                    value={whccConfig.shipFromCity}
                    onChange={(e) =>
                      setWhccConfig({ ...whccConfig, shipFromCity: e.target.value })
                    }
                    placeholder="City"
                  />
                </div>

                <div className="form-group">
                  <label>State</label>
                  <input
                    type="text"
                    value={whccConfig.shipFromState}
                    onChange={(e) =>
                      setWhccConfig({ ...whccConfig, shipFromState: e.target.value })
                    }
                    placeholder="State"
                    maxLength={2}
                  />
                </div>

                <div className="form-group">
                  <label>ZIP</label>
                  <input
                    type="text"
                    value={whccConfig.shipFromZip}
                    onChange={(e) =>
                      setWhccConfig({ ...whccConfig, shipFromZip: e.target.value })
                    }
                    placeholder="ZIP"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Phone</label>
                <input
                  type="tel"
                  value={whccConfig.shipFromPhone}
                  onChange={(e) =>
                    setWhccConfig({ ...whccConfig, shipFromPhone: e.target.value })
                  }
                  placeholder="Phone"
                />
              </div>

              <button onClick={handleWhccSave} className="btn btn-primary">
                Save WHCC Configuration
              </button>
            </div>
          )}

          {/* Mpix Configuration */}
          {activeTab === 'mpix' && (
            <div className="config-section">
              <h2>Mpix Configuration</h2>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={mpixConfig.enabled}
                    onChange={(e) =>
                      setMpixConfig({ ...mpixConfig, enabled: e.target.checked })
                    }
                  />
                  Enable Mpix
                </label>
              </div>

              <div className="form-group">
                <label>Environment</label>
                <select
                  value={mpixConfig.environment}
                  onChange={(e) =>
                    setMpixConfig({
                      ...mpixConfig,
                      environment: e.target.value as 'sandbox' | 'production',
                    })
                  }
                >
                  <option value="sandbox">Sandbox</option>
                  <option value="production">Production</option>
                </select>
              </div>

              <div className="form-group">
                <label>API Key</label>
                <input
                  type="password"
                  value={mpixConfig.apiKey}
                  onChange={(e) =>
                    setMpixConfig({ ...mpixConfig, apiKey: e.target.value })
                  }
                  placeholder="Enter API Key"
                />
              </div>

              <div className="form-group">
                <label>API Secret</label>
                <input
                  type="password"
                  value={mpixConfig.apiSecret}
                  onChange={(e) =>
                    setMpixConfig({ ...mpixConfig, apiSecret: e.target.value })
                  }
                  placeholder="Enter API Secret"
                />
              </div>

              <h3>Ship From Information</h3>
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={mpixConfig.shipFromName}
                  onChange={(e) =>
                    setMpixConfig({ ...mpixConfig, shipFromName: e.target.value })
                  }
                  placeholder="Sender Name"
                />
              </div>

              <div className="form-group">
                <label>Phone</label>
                <input
                  type="tel"
                  value={mpixConfig.shipFromPhone}
                  onChange={(e) =>
                    setMpixConfig({ ...mpixConfig, shipFromPhone: e.target.value })
                  }
                  placeholder="Phone"
                />
              </div>

              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={mpixConfig.shipFromEmail}
                  onChange={(e) =>
                    setMpixConfig({ ...mpixConfig, shipFromEmail: e.target.value })
                  }
                  placeholder="Email"
                />
              </div>

              <button onClick={handleMpixSave} className="btn btn-primary">
                Save Mpix Configuration
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .tab-container {
          margin-top: 2rem;
        }

        .tabs {
          display: flex;
          gap: 1rem;
          border-bottom: 2px solid #e0e0e0;
          margin-bottom: 2rem;
        }

        .tab {
          padding: 0.75rem 1.5rem;
          border: none;
          background: none;
          cursor: pointer;
          font-size: 1rem;
          border-bottom: 3px solid transparent;
          transition: all 0.3s ease;
        }

        .tab:hover {
          background-color: #f5f5f5;
        }

        .tab.active {
          border-bottom-color: #007bff;
          color: #007bff;
          font-weight: bold;
        }

        .config-section {
          max-width: 600px;
        }

        .config-section h2 {
          margin-top: 0;
          color: #333;
        }

        .config-section h3 {
          margin-top: 2rem;
          margin-bottom: 1rem;
          color: #555;
          font-size: 0.95rem;
          text-transform: uppercase;
          border-bottom: 1px solid #e0e0e0;
          padding-bottom: 0.5rem;
        }

        .form-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 1rem;
        }

        .alert {
          padding: 1rem;
          border-radius: 4px;
          margin-bottom: 1rem;
        }

        .alert-success {
          background-color: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }

        .alert-error {
          background-color: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }
      `}</style>
    </div>
  );
};

export default AdminLabs;
