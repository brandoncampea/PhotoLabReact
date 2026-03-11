import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import '../AdminStyles.css';

interface Studio {
  id: number;
  name: string;
  email: string;
  created_at: string;
  subscription_status: string;
  subscription_plan: string;
  subscription_start?: string;
  subscription_end?: string;
  userCount?: number;
  fee_type?: string;
  fee_value?: number;
  billing_cycle?: string;
  is_free_subscription?: boolean;
  cancellation_requested?: boolean;
  cancellation_date?: string;
}

interface Plan {
  id: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice?: number;
  features: string[];
}

export default function SuperAdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [studios, setStudios] = useState<Studio[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [_loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedStudio, setSelectedStudio] = useState<Studio | null>(null);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [newSubscription, setNewSubscription] = useState({
    subscriptionPlan: '',
    subscriptionStatus: 'active',
    billingCycle: 'monthly',
    isFreeSubscription: false
  });
  const [studioFees, setStudioFees] = useState({
    feeType: 'percentage',
    feeValue: 0
  });
  const [subscriptionPaymentConfig, setSubscriptionPaymentConfig] = useState({
    publishableKey: '',
    secretKey: '',
    webhookSecret: '',
    isLiveMode: false,
    isActive: false,
  });
  const [savingSubscriptionConfig, setSavingSubscriptionConfig] = useState(false);

  useEffect(() => {
    if (user?.role === 'super_admin') {
      fetchStudios();
      fetchPlans();
      fetchSubscriptionPaymentConfig();
    }
  }, [user]);

  const fetchSubscriptionPaymentConfig = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/studios/subscription-payment-config', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSubscriptionPaymentConfig({
          publishableKey: data.publishableKey || '',
          secretKey: data.secretKey || '',
          webhookSecret: data.webhookSecret || '',
          isLiveMode: !!data.isLiveMode,
          isActive: !!data.isActive,
        });
      }
    } catch (err) {
      console.error('Failed to fetch subscription payment config:', err);
    }
  };

  const handleSaveSubscriptionPaymentConfig = async () => {
    try {
      setSavingSubscriptionConfig(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/studios/subscription-payment-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(subscriptionPaymentConfig),
      });

      if (response.ok) {
        alert('Subscription payment configuration saved successfully');
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to save subscription payment configuration');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save subscription payment configuration');
    } finally {
      setSavingSubscriptionConfig(false);
    }
  };

  const fetchStudios = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/studios', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setStudios(data);
        setError('');
      } else {
        setError('Failed to load studios');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPlans = async () => {
    try {
      const response = await fetch('/api/studios/plans/list');
      if (response.ok) {
        const data = await response.json();
        setPlans(Object.values(data));
      }
    } catch (err) {
      console.error('Failed to fetch plans:', err);
    }
  };

  const handleUpdateSubscription = async () => {
    if (!selectedStudio) return;

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `/api/studios/${selectedStudio.id}/subscription`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            subscriptionPlan: newSubscription.subscriptionPlan,
            subscriptionStatus: newSubscription.subscriptionStatus,
            billingCycle: newSubscription.billingCycle,
            isFreeSubscription: newSubscription.isFreeSubscription
          })
        }
      );

      if (response.ok) {
        alert('Subscription updated successfully');
        setShowSubscriptionModal(false);
        fetchStudios();
      } else {
        setError('Failed to update subscription');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleOpenFeeModal = async (studio: Studio) => {
    setSelectedStudio(studio);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `/api/studios/${studio.id}/fees`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setStudioFees({
          feeType: data.feeType,
          feeValue: data.feeValue
        });
      }
    } catch (err) {
      console.error('Failed to fetch fees:', err);
    }
    setShowFeeModal(true);
  };

  const handleUpdateFees = async () => {
    if (!selectedStudio) return;

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `/api/studios/${selectedStudio.id}/fees`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            feeType: studioFees.feeType,
            feeValue: studioFees.feeValue
          })
        }
      );

      if (response.ok) {
        alert('Studio fees updated successfully');
        setShowFeeModal(false);
        fetchStudios();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to update fees');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getPlanPrice = (planId: string) => {
    const plan = plans.find(p => p.id === planId);
    return plan ? `$${plan.monthlyPrice}/mo` : 'N/A';
  };

  if (user?.role !== 'super_admin') {
    return <div style={{ padding: '20px' }}>Access denied. Super admin only.</div>;
  }

  return (
    <div className="admin-container">
      <h1>Super Admin Dashboard</h1>

      {error && <div style={{ color: 'var(--error-color)', marginBottom: '20px' }}>{error}</div>}

      <div style={{ marginBottom: '30px' }}>
        <button
          onClick={() => navigate('/super-admin-pricing')}
          className="btn btn-primary"
          style={{ fontSize: '16px', fontWeight: 'bold' }}
        >
          💰 Manage Pricing
        </button>
      </div>

      <div className="admin-summary-box" style={{ marginBottom: '24px' }}>
        <h2 style={{ marginTop: 0 }}>Studio Subscription Payment Gateway</h2>
        <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
          This Stripe configuration is used only for studio subscription billing (not customer checkout).
        </p>

        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={subscriptionPaymentConfig.isActive}
              onChange={(e) => setSubscriptionPaymentConfig(prev => ({ ...prev, isActive: e.target.checked }))}
              style={{ marginRight: '0.5rem' }}
            />
            Enable subscription billing gateway
          </label>
        </div>

        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={subscriptionPaymentConfig.isLiveMode}
              onChange={(e) => setSubscriptionPaymentConfig(prev => ({ ...prev, isLiveMode: e.target.checked }))}
              style={{ marginRight: '0.5rem' }}
            />
            Live mode
          </label>
        </div>

        <div className="form-group">
          <label>Publishable Key</label>
          <input
            type="text"
            value={subscriptionPaymentConfig.publishableKey}
            onChange={(e) => setSubscriptionPaymentConfig(prev => ({ ...prev, publishableKey: e.target.value }))}
            placeholder={subscriptionPaymentConfig.isLiveMode ? 'pk_live_...' : 'pk_test_...'}
          />
        </div>

        <div className="form-group">
          <label>Secret Key</label>
          <input
            type="password"
            value={subscriptionPaymentConfig.secretKey}
            onChange={(e) => setSubscriptionPaymentConfig(prev => ({ ...prev, secretKey: e.target.value }))}
            placeholder={subscriptionPaymentConfig.isLiveMode ? 'sk_live_...' : 'sk_test_...'}
          />
        </div>

        <div className="form-group">
          <label>Webhook Secret</label>
          <input
            type="password"
            value={subscriptionPaymentConfig.webhookSecret}
            onChange={(e) => setSubscriptionPaymentConfig(prev => ({ ...prev, webhookSecret: e.target.value }))}
            placeholder="whsec_..."
          />
        </div>

        <button
          onClick={handleSaveSubscriptionPaymentConfig}
          className="btn btn-success"
          disabled={savingSubscriptionConfig}
        >
          {savingSubscriptionConfig ? 'Saving...' : 'Save Subscription Gateway Config'}
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Studios</h3>
          <p className="stat-value">{studios.length}</p>
        </div>
        <div className="stat-card">
          <h3>Active Subscriptions</h3>
          <p className="stat-value">{studios.filter(s => s.subscription_status === 'active').length}</p>
        </div>
        <div className="stat-card">
          <h3>Monthly Revenue</h3>
          <p className="stat-value">${studios.reduce((sum, s) => sum + parseFloat(s.subscription_plan || '0'), 0).toFixed(2)}</p>
        </div>
      </div>

      <h2>Studios Management</h2>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Studio Name</th>
              <th>Email</th>
              <th>Plan</th>
              <th>Billing</th>
              <th>Status</th>
              <th>Fee</th>
              <th>Created</th>
              <th>Users</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {studios.map(studio => (
              <tr key={studio.id}>
                <td>{studio.name}</td>
                <td>{studio.email}</td>
                <td>{getPlanPrice(studio.subscription_plan)}</td>
                <td>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {studio.is_free_subscription 
                      ? 'FREE' 
                      : (studio.billing_cycle === 'yearly' ? 'Yearly' : 'Monthly')}
                  </span>
                </td>
                <td>
                  <span className={`status-badge ${studio.cancellation_requested ? 'badge-warning' : studio.subscription_status === 'active' ? 'status-active' : 'status-inactive'}`}>
                    {studio.cancellation_requested 
                      ? `Cancelling ${studio.subscription_end ? new Date(studio.subscription_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}` 
                      : studio.subscription_status}
                  </span>
                </td>
                <td>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {studio.fee_type === 'percentage' 
                      ? `${studio.fee_value}%` 
                      : `$${(studio.fee_value || 0).toFixed(2)}`}
                  </span>
                </td>
                <td>{new Date(studio.created_at).toLocaleDateString()}</td>
                <td>{studio.userCount || 0}</td>
                <td>
                  <button
                    onClick={() => {
                      setSelectedStudio(studio);
                      setNewSubscription({
                        subscriptionPlan: studio.subscription_plan,
                        subscriptionStatus: studio.subscription_status,
                        billingCycle: studio.billing_cycle || 'monthly',
                        isFreeSubscription: studio.is_free_subscription || false
                      });
                      setShowSubscriptionModal(true);
                    }}
                    className="btn btn-primary btn-sm"
                    style={{ marginRight: '8px' }}
                  >
                    Edit Sub
                  </button>
                  <button
                    onClick={() => handleOpenFeeModal(studio)}
                    className="btn btn-secondary btn-sm"
                  >
                    Edit Fees
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Subscription Modal */}
      {showSubscriptionModal && selectedStudio && (
        <div className="modal-overlay">
          <div className="modal-content admin-modal-content" style={{ padding: '30px', maxWidth: '500px' }}>
            <h2>Update Subscription for {selectedStudio.name}</h2>

            <div style={{ marginBottom: '20px' }}>
              <label>Subscription Plan</label>
              <select
                value={newSubscription.subscriptionPlan}
                onChange={(e) => setNewSubscription({
                  ...newSubscription,
                  subscriptionPlan: e.target.value
                })}
                style={{
                  width: '100%',
                  padding: '10px',
                  marginBottom: '10px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)'
                }}
              >
                {plans.map(plan => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} - ${plan.monthlyPrice}/mo
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label>Status</label>
              <select
                value={newSubscription.subscriptionStatus}
                onChange={(e) => setNewSubscription({
                  ...newSubscription,
                  subscriptionStatus: e.target.value
                })}
                style={{
                  width: '100%',
                  padding: '10px',
                  marginBottom: '10px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)'
                }}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="past_due">Past Due</option>
                <option value="canceled">Canceled</option>
                <option value="paused">Paused</option>
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={newSubscription.isFreeSubscription}
                  onChange={(e) => setNewSubscription({
                    ...newSubscription,
                    isFreeSubscription: e.target.checked
                  })}
                />
                <span>Free Subscription (No Billing)</span>
              </label>
            </div>

            {!newSubscription.isFreeSubscription && (
              <div style={{ marginBottom: '20px' }}>
                <label>Billing Cycle</label>
                <select
                  value={newSubscription.billingCycle}
                  onChange={(e) => setNewSubscription({
                    ...newSubscription,
                    billingCycle: e.target.value
                  })}
                  style={{
                    width: '100%',
                    padding: '10px',
                    marginBottom: '10px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)'
                  }}
                >
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly (Save ~17%)</option>
                </select>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleUpdateSubscription}
                className="btn btn-success"
                style={{ flex: 1 }}
              >
                Update
              </button>
              <button
                onClick={() => setShowSubscriptionModal(false)}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fee Modal */}
      {showFeeModal && selectedStudio && (
        <div className="modal-overlay">
          <div className="modal-content admin-modal-content" style={{ padding: '30px', maxWidth: '500px' }}>
            <h2>Update Fees for {selectedStudio.name}</h2>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>
                Fee Type
              </label>
              <div style={{ display: 'flex', gap: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="radio"
                    name="feeType"
                    value="percentage"
                    checked={studioFees.feeType === 'percentage'}
                    onChange={() => setStudioFees({ ...studioFees, feeType: 'percentage' })}
                  />
                  Percentage (%)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="radio"
                    name="feeType"
                    value="fixed"
                    checked={studioFees.feeType === 'fixed'}
                    onChange={() => setStudioFees({ ...studioFees, feeType: 'fixed' })}
                  />
                  Fixed Amount ($)
                </label>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                {studioFees.feeType === 'percentage' ? 'Fee Percentage' : 'Fee Amount ($)'}
              </label>
              <input
                type="number"
                value={studioFees.feeValue}
                onChange={(e) => setStudioFees({ ...studioFees, feeValue: parseFloat(e.target.value) || 0 })}
                min="0"
                max={studioFees.feeType === 'percentage' ? '100' : undefined}
                step={studioFees.feeType === 'percentage' ? '0.1' : '0.01'}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  fontSize: '16px'
                }}
              />
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                {studioFees.feeType === 'percentage'
                  ? 'This percentage will be added to each product price'
                  : 'This fixed amount will be added to each product price'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => handleUpdateFees()}
                className="btn btn-success"
                style={{ flex: 1, fontWeight: 'bold' }}
              >
                Update Fees
              </button>
              <button
                onClick={() => setShowFeeModal(false)}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

