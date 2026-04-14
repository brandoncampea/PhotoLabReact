import { useState, useEffect } from 'react';
import { whccService, WhccWebhookStatus } from '../../services/whccService';
import { orderService } from '../../services/orderService';
import { shippingService, ShippingRubricSummary } from '../../services/shippingService';
import { useAuth } from '../../contexts/AuthContext';
import { Order } from '../../types';

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

const currency = (value: number) => `$${Number(value || 0).toFixed(2)}`;

const AdminWhccConfig = () => {
    const [directPricingMode, setDirectPricingMode] = useState<'pass_through' | 'flat_fee'>('pass_through');
    const [directFlatFee, setDirectFlatFee] = useState('');
  const { user } = useAuth();
  const canViewApiLogs = user?.role === 'super_admin';
  const canViewRubricRules = user?.role === 'super_admin';
  // const isSuperAdmin = user?.role === 'super_admin';
  const [enabled, setEnabled] = useState(false);
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
  const [whccLogOrders, setWhccLogOrders] = useState<Order[]>([]);
  const [isLogLoading, setIsLogLoading] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [logQuery, setLogQuery] = useState('');
  const [logDateFrom, setLogDateFrom] = useState('');
  const [logDateTo, setLogDateTo] = useState('');
  const [failedOnly, setFailedOnly] = useState(false);
  const [shippingPolicyLoading, setShippingPolicyLoading] = useState(false);
  const [shippingPolicySaving, setShippingPolicySaving] = useState(false);
  const [shippingPolicyMessage, setShippingPolicyMessage] = useState<string | null>(null);
  const [shippingRubric, setShippingRubric] = useState<ShippingRubricSummary | null>(null);
  const [shippingRubricLoading, setShippingRubricLoading] = useState(false);
  const [shippingRubricError, setShippingRubricError] = useState<string | null>(null);

  // Load config from localStorage
  useEffect(() => {
    try {
      const config = localStorage.getItem('whccConfig');
      if (config) {
        const parsed = JSON.parse(config);
        setEnabled(parsed.enabled || false);
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
      } catch (err) {
        // Optionally log or handle error
      }
    };
    loadWebhookStatus();
  }, []);

  useEffect(() => {
    const loadShippingPolicy = async () => {
      setShippingPolicyLoading(true);
      try {
        const config = await shippingService.getConfig();
        setDirectPricingMode(config.directPricingMode === 'flat_fee' ? 'flat_fee' : 'pass_through');
        setDirectFlatFee(config.directFlatFee == null ? String(config.directShippingCharge || '') : String(config.directFlatFee));
      } catch {
        // no-op: this section is optional and should not block WHCC config page usage
      } finally {
        setShippingPolicyLoading(false);
      }
    };
    loadShippingPolicy();
  }, []);

  useEffect(() => {
    const loadShippingRubric = async () => {
      if (!canViewRubricRules) return;
      setShippingRubricLoading(true);
      try {
        const rubric = await shippingService.getRubric();
        setShippingRubric(rubric);
      } catch (err) {
        setShippingRubricError(`Failed to load translated shipping rules: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setShippingRubricLoading(false);
      }
    };
    loadShippingRubric();
  }, [canViewRubricRules]);

  const loadWhccApiLogs = async () => {
    if (!canViewApiLogs) return;
    setIsLogLoading(true);
    setLogError(null);
    try {
      const orders = await orderService.getAdminOrders();
      const withWhccLogs = (orders || [])
        .filter((order) => (
          order.whccRequestLog ||
          order.whccImportResponse ||
          order.whccSubmitResponse ||
          order.whccLastError ||
          order.whccConfirmationId ||
          order.whccOrderNumber
        ))
        .sort((a, b) => {
          const aTs = new Date(a.orderDate).getTime() || 0;
          const bTs = new Date(b.orderDate).getTime() || 0;
          return bTs - aTs;
        });
      setWhccLogOrders(withWhccLogs);
    } catch (err) {
      setLogError(`Failed to load WHCC API logs: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setWhccLogOrders([]);
    } finally {
      setIsLogLoading(false);
    }
  };

  useEffect(() => {
    loadWhccApiLogs();
  }, [canViewApiLogs]);

  const formatWhccPayload = (value: unknown) => {
    if (value == null) return null;
    if (typeof value === 'string') {
      try {
        return JSON.stringify(JSON.parse(value), null, 2);
      } catch {
        return value;
      }
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  };

  const formatDateTime = (value: unknown) => {
    if (!value) return null;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
  };

  const renderWhccLogBlock = (title: string, value: unknown, defaultOpen = false, runAt?: unknown) => {
    const formatted = formatWhccPayload(value);
    if (!formatted) return null;
    const runAtText = formatDateTime(runAt);

    return (
      <details open={defaultOpen} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '10px' }}>
        <summary style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: '10px', fontWeight: 600 }}>
          <span>{title}</span>
          {runAtText && <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>Last run: {runAtText}</span>}
        </summary>
        <pre style={{ margin: 0, padding: '12px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-secondary)', overflowX: 'auto', maxHeight: '360px' }}>{formatted}</pre>
      </details>
    );
  };

  const handleSave = () => {
    try {
      const config = {
        enabled,
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

  const handleSaveShippingPolicy = async () => {
    setShippingPolicySaving(true);
    setShippingPolicyMessage(null);
    try {
      await shippingService.updateConfig({
        directPricingMode,
        directFlatFee: directPricingMode === 'flat_fee'
          ? (directFlatFee === '' ? 0 : Number(directFlatFee))
          : null,
      });
      setShippingPolicyMessage('✓ WHCC shipping policy saved for this studio context.');
    } catch (err) {
      setShippingPolicyMessage(`✗ Failed to save shipping policy: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setShippingPolicySaving(false);
    }
  };

  const webhookSummary = formatWebhookSummary(webhookStatus);
  const normalizedLogQuery = logQuery.trim().toLowerCase();
  const fromDate = logDateFrom ? new Date(`${logDateFrom}T00:00:00`) : null;
  const toDate = logDateTo ? new Date(`${logDateTo}T23:59:59.999`) : null;
  const filteredWhccLogOrders = whccLogOrders.filter((order) => {
    const searchable = [
      order.id,
      order.status,
      order.whccConfirmationId,
      order.whccOrderNumber,
      order.shippingAddress?.fullName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (normalizedLogQuery && !searchable.includes(normalizedLogQuery)) {
      return false;
    }

    const orderDate = new Date(order.orderDate);
    if (fromDate && !Number.isNaN(orderDate.getTime()) && orderDate < fromDate) {
      return false;
    }
    if (toDate && !Number.isNaN(orderDate.getTime()) && orderDate > toDate) {
      return false;
    }

    if (failedOnly) {
      const hasFailure = Boolean(order.whccLastError) || String(order.status || '').toLowerCase() === 'failed';
      if (!hasFailure) return false;
    }

    return true;
  });
  const shippingRubricDestinations = shippingRubric?.destinations
    ? Object.values(shippingRubric.destinations)
    : [];
  const shippingRubricGroups = shippingRubric?.matrix
    ? Object.entries(shippingRubric.matrix)
    : [];

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
        <h2 style={{ fontSize: '18px', marginBottom: '15px' }}>WHCC Shipping Policy</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
          Configure how direct-shipping WHCC costs are charged to customers. Batch shipping remains studio-paid.
        </p>

        {shippingPolicyLoading ? (
          <div style={{ color: 'var(--text-secondary)' }}>Loading shipping policy…</div>
        ) : (
          <>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                Direct Shipping Pricing Mode
              </label>
              <select
                value={directPricingMode}
                onChange={(e) => setDirectPricingMode((e.target.value === 'flat_fee' ? 'flat_fee' : 'pass_through'))}
                style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid var(--border-color)' }}
              >
                <option value="pass_through">Pass WHCC shipping cost to customer</option>
                <option value="flat_fee">Charge a flat fee to customer</option>
              </select>
            </div>

            {directPricingMode === 'flat_fee' && (
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                  Direct Shipping Flat Fee ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={directFlatFee}
                  onChange={(e) => setDirectFlatFee(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                />
              </div>
            )}

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSaveShippingPolicy}
              disabled={shippingPolicySaving}
            >
              {shippingPolicySaving ? 'Saving…' : 'Save Shipping Policy'}
            </button>

            {shippingPolicyMessage && (
              <div className={shippingPolicyMessage.startsWith('✓') ? 'info-box-success' : 'info-box-error'} style={{ marginTop: '12px' }}>
                {shippingPolicyMessage}
              </div>
            )}
          </>
        )}
      </div>

      {canViewRubricRules && (
        <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '20px', borderRadius: '8px', marginBottom: '30px' }}>
          <h2 style={{ fontSize: '18px', marginBottom: '15px' }}>Translated WHCC Shipping Rules</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
            These rules are translated from {shippingRubric?.source || 'WHCC Shipping Rubric.xlsx'} and drive per-order shipping charges.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
              <strong>Batch Orders</strong>
              <div style={{ color: 'var(--text-secondary)', marginTop: '6px', fontSize: '14px' }}>
                Customer is charged $0 shipping. Studio pays the WHCC rubric amount.
              </div>
            </div>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
              <strong>Direct + Pass Through</strong>
              <div style={{ color: 'var(--text-secondary)', marginTop: '6px', fontSize: '14px' }}>
                Customer pays the WHCC rubric amount for the detected destination and product group.
              </div>
            </div>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
              <strong>Direct + Flat Fee</strong>
              <div style={{ color: 'var(--text-secondary)', marginTop: '6px', fontSize: '14px' }}>
                Customer pays your flat fee. The studio keeps or absorbs the difference versus the rubric amount.
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '12px', color: 'var(--text-secondary)', fontSize: '14px' }}>
            Shipping is calculated from the Drop Ship Lowest Cost rubric by destination. Destinations are classified as Lower 48, Alaska, Hawaii, Military, PO Box, US Territories, Canada, or International.
          </div>

          {shippingRubricLoading ? (
            <div style={{ color: 'var(--text-secondary)' }}>Loading translated rules…</div>
          ) : shippingRubricError ? (
            <div className="info-box-error">✗ {shippingRubricError}</div>
          ) : shippingRubric && shippingRubricDestinations.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '10px', borderBottom: '1px solid var(--border-color)' }}>Product Group</th>
                    {shippingRubricDestinations.map((destination) => (
                      <th key={destination} style={{ textAlign: 'right', padding: '10px', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}>
                        {destination}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shippingRubricGroups.map(([groupName, groupRules]) => (
                    <tr key={groupName}>
                      <td style={{ padding: '10px', borderBottom: '1px solid var(--border-color)', fontWeight: 600 }}>{groupName}</td>
                      {shippingRubricDestinations.map((destination) => (
                        <td key={`${groupName}-${destination}`} style={{ padding: '10px', borderBottom: '1px solid var(--border-color)', textAlign: 'right', color: groupRules?.[destination] == null ? 'var(--text-secondary)' : 'inherit' }}>
                          {groupRules?.[destination] == null ? '—' : currency(groupRules[destination])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ color: 'var(--text-secondary)' }}>No translated rules available.</div>
          )}
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
          {/* Consumer Key field removed; now managed via environment variables. */}
        </div>


        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
            Consumer Secret
          </label>
          <input
            type="password"
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
          disabled={isTestLoading}
          className="btn btn-primary"
          style={{
            padding: '10px 20px',
            fontWeight: 500,
            opacity: isTestLoading ? 0.5 : 1,
          }}
        >
          {isTestLoading ? 'Testing...' : 'Test Connection'}
        </button>
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
          <button onClick={handleRegisterWebhook} disabled={!webhookCallbackUri || isWebhookLoading} className="btn btn-primary" style={{ opacity: !webhookCallbackUri || isWebhookLoading ? 0.5 : 1 }}>
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

      {canViewApiLogs && (
        <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '20px', borderRadius: '8px', marginBottom: '30px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '18px', margin: 0 }}>WHCC API Logs (All Orders)</h2>
            <button onClick={loadWhccApiLogs} className="btn btn-secondary" disabled={isLogLoading} style={{ opacity: isLogLoading ? 0.6 : 1 }}>
              {isLogLoading ? 'Refreshing…' : 'Refresh Logs'}
            </button>
          </div>

          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            Super admin visibility into WHCC token, import, submit, response, and error payloads across all orders.
          </p>

          <input
            type="text"
            value={logQuery}
            onChange={(e) => setLogQuery(e.target.value)}
            placeholder="Filter by order #, status, confirmation, customer…"
            style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '4px', boxSizing: 'border-box', marginBottom: '12px' }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '10px', marginBottom: '12px', alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>From Date</label>
              <input
                type="date"
                value={logDateFrom}
                onChange={(e) => setLogDateFrom(e.target.value)}
                style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '4px', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>To Date</label>
              <input
                type="date"
                value={logDateTo}
                onChange={(e) => setLogDateTo(e.target.value)}
                style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '4px', boxSizing: 'border-box' }}
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', paddingBottom: '10px' }}>
              <input
                type="checkbox"
                checked={failedOnly}
                onChange={(e) => setFailedOnly(e.target.checked)}
              />
              Failed only
            </label>
          </div>

          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
            Showing {filteredWhccLogOrders.length} of {whccLogOrders.length} order log entries.
          </div>

          {logError && (
            <div className="info-box-error" style={{ marginBottom: '12px' }}>
              {logError}
            </div>
          )}

          {!isLogLoading && !logError && filteredWhccLogOrders.length === 0 && (
            <div className="info-box-blue">No WHCC API logs found for current filters.</div>
          )}

          {filteredWhccLogOrders.map((order) => {
            const importRunAt =
              order.whccRequestLog?.importRequest?.runAt ||
              order.whccImportResponse?.Received ||
              order.whccImportResponse?.received ||
              order.whccImportResponse?.Timestamp ||
              null;
            const submitRunAt =
              order.whccRequestLog?.submitRequest?.runAt ||
              order.whccSubmitResponse?.Received ||
              order.whccSubmitResponse?.received ||
              order.whccSubmitResponse?.Timestamp ||
              order.labSubmittedAt ||
              null;
            const errorRunAt =
              order.whccLastError?.runAt ||
              order.whccLastError?.timestamp ||
              order.whccLastError?.createdAt ||
              null;

            return (
              <details key={order.id} style={{ marginBottom: '14px', border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden' }}>
                <summary style={{ cursor: 'pointer', padding: '12px', background: 'var(--bg-secondary)', display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                  <strong>Order #{order.id}</strong>
                  <span>Status: {order.status}</span>
                  {order.whccConfirmationId && <span>Confirmation: {order.whccConfirmationId}</span>}
                  {order.whccOrderNumber && <span>WHCC Order #: {order.whccOrderNumber}</span>}
                  <span>{new Date(order.orderDate).toLocaleString()}</span>
                </summary>

                <div style={{ padding: '12px' }}>
                  {order.whccLastError && (
                    <div style={{ marginBottom: '10px', border: '1px solid #cc3333', borderRadius: '8px', background: 'rgba(204, 51, 51, 0.08)', padding: '10px' }}>
                      <div style={{ fontWeight: 700, marginBottom: '6px' }}>⚠ Last Error</div>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{formatWhccPayload(order.whccLastError)}</pre>
                    </div>
                  )}

                  {renderWhccLogBlock('Full OrderImport Payload Sent to WHCC', order.whccRequestLog?.importRequest?.body, true, order.whccRequestLog?.importRequest?.runAt)}
                  {renderWhccLogBlock('WHCC Token Request Metadata', order.whccRequestLog?.tokenRequest, false, order.whccRequestLog?.tokenRequest?.runAt)}
                  {renderWhccLogBlock('WHCC Import Request Envelope', order.whccRequestLog?.importRequest, false, importRunAt)}
                  {renderWhccLogBlock('WHCC Submit Request', order.whccRequestLog?.submitRequest, false, order.whccRequestLog?.submitRequest?.runAt)}
                  {renderWhccLogBlock('WHCC Import Response', order.whccImportResponse, false, importRunAt)}
                  {renderWhccLogBlock('WHCC Submit Response', order.whccSubmitResponse, false, submitRunAt)}
                  {renderWhccLogBlock('WHCC Last Error (Raw)', order.whccLastError, false, errorRunAt)}

                  {!order.whccRequestLog && !order.whccImportResponse && !order.whccSubmitResponse && !order.whccLastError && (
                    <div className="info-box-blue">
                      No detailed WHCC payload log captured for this order yet.
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}

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
