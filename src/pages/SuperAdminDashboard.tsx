import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
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

interface StudioProfitRow {
  studioId: number;
  studioName: string;
  orderCount: number;
  studioRevenue: number;
  superAdminProfit: number;
  stripeFeeAmount: number;
  studioProfitGross: number;
  totalPayouts: number;
  payoutCount: number;
  studioProfit: number;
  isPayoutEligible: boolean;
  amountToNextPayout: number;
}

interface StudioProfitPayout {
  id: number;
  studioId: number;
  amount: number;
  notes?: string;
  createdAt: string;
  createdByName?: string;
}

interface ProfitSummary {
  payoutThreshold: number;
  totals: {
    totalStudioRevenue: number;
    totalSuperAdminProfit: number;
    totalStripeFees: number;
    totalStudioProfitGross: number;
    totalPayouts: number;
    totalStudioProfit: number;
    totalOrders: number;
    eligibleStudioCount: number;
    totalEligibleStudioPayout: number;
  };
  byStudio: StudioProfitRow[];
}

interface SubscriptionPlanDB {
  id: number;
  name: string;
  description?: string;
  monthly_price: number;
  yearly_price?: number;
  stripe_monthly_price_id?: string;
  stripe_yearly_price_id?: string;
  is_active: boolean;
}

export default function SuperAdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
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
  const [profitSummary, setProfitSummary] = useState<ProfitSummary | null>(null);
  const [showSuperAdminProfitByStudio, setShowSuperAdminProfitByStudio] = useState(false);
  const [showStudioProfitByStudio, setShowStudioProfitByStudio] = useState(false);
  const [payoutThreshold, setPayoutThreshold] = useState(500);
  const [savingPayoutThreshold, setSavingPayoutThreshold] = useState(false);
  const [selectedPayoutStudio, setSelectedPayoutStudio] = useState<StudioProfitRow | null>(null);
  const [studioPayoutHistory, setStudioPayoutHistory] = useState<StudioProfitPayout[]>([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlanDB[]>([]);
  const [editingPlanPrices, setEditingPlanPrices] = useState<Record<number, { monthly: string; yearly: string }>>({});
  const [savingPlanPrices, setSavingPlanPrices] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (user?.role === 'super_admin') {
      fetchStudios();
      fetchPlans();
      fetchSubscriptionPaymentConfig();
      fetchPayoutThreshold();
      fetchProfitSummary();
      fetchSubscriptionPlans();
    }
  }, [user]);

  useEffect(() => {
    if (location.hash === '#subscription-payment-gateway') {
      requestAnimationFrame(() => {
        document.getElementById('subscription-payment-gateway')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [location.hash]);

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

  const fetchPayoutThreshold = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/studios/profit-payout-config', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setPayoutThreshold(Number(data.payoutThreshold) || 500);
      }
    } catch (err) {
      console.error('Failed to fetch payout threshold:', err);
    }
  };

  const handleSavePayoutThreshold = async () => {
    try {
      setSavingPayoutThreshold(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/studios/profit-payout-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ payoutThreshold }),
      });

      if (response.ok) {
        await fetchProfitSummary();
        alert('Profit payout threshold saved');
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to save payout threshold');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save payout threshold');
    } finally {
      setSavingPayoutThreshold(false);
    }
  };

  const fetchStudioPayoutHistory = async (studio: StudioProfitRow) => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`/api/studios/${studio.studioId}/profit-payouts`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSelectedPayoutStudio(studio);
        setStudioPayoutHistory(Array.isArray(data.payouts) ? data.payouts : []);
      }
    } catch (err) {
      console.error('Failed to fetch studio payout history:', err);
    }
  };

  const handleMarkPayoutSent = async (studio: StudioProfitRow) => {
    const defaultAmount = Number(studio.studioProfit || 0).toFixed(2);
    const entered = window.prompt(`Enter payout amount for ${studio.studioName}`, defaultAmount);
    if (entered === null) return;

    const amount = Number(entered);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Please enter a valid payout amount greater than 0');
      return;
    }

    const notes = window.prompt('Optional payout note', '') || undefined;

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`/api/studios/${studio.studioId}/profit-payouts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ amount, notes }),
      });

      if (response.ok) {
        await fetchProfitSummary();
        if (selectedPayoutStudio?.studioId === studio.studioId) {
          await fetchStudioPayoutHistory(studio);
        }
        alert('Payout recorded successfully');
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to record payout');
      }
    } catch (err) {
      console.error('Failed to mark payout sent:', err);
      alert('Failed to record payout');
    }
  };

  const fetchProfitSummary = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/studios/profit/summary', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setProfitSummary(data);
      } else {
        setProfitSummary(null);
      }
    } catch (err) {
      console.error('Failed to fetch profit summary:', err);
      setProfitSummary(null);
    }
  };

  const fetchSubscriptionPlans = async () => {
    try {
      const response = await fetch('/api/subscription-plans');
      if (response.ok) {
        const data: SubscriptionPlanDB[] = await response.json();
        setSubscriptionPlans(data);
        // Initialise editing state with current DB values
        const initial: Record<number, { monthly: string; yearly: string }> = {};
        data.forEach(p => {
          initial[p.id] = {
            monthly: p.stripe_monthly_price_id || '',
            yearly: p.stripe_yearly_price_id || '',
          };
        });
        setEditingPlanPrices(initial);
      }
    } catch (err) {
      console.error('Failed to fetch subscription plans:', err);
    }
  };

  const handleSavePlanPrices = async (planId: number) => {
    const prices = editingPlanPrices[planId];
    if (!prices) return;
    setSavingPlanPrices(prev => ({ ...prev, [planId]: true }));
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`/api/subscription-plans/${planId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          stripe_monthly_price_id: prices.monthly || null,
          stripe_yearly_price_id: prices.yearly || null,
        }),
      });
      if (response.ok) {
        await fetchSubscriptionPlans();
        alert('Stripe Price IDs saved');
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to save Price IDs');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save Price IDs');
    } finally {
      setSavingPlanPrices(prev => ({ ...prev, [planId]: false }));
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

      <div id="subscription-payment-gateway" className="admin-summary-box" style={{ marginBottom: '24px' }}>
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

        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
          <h3 style={{ marginTop: 0 }}>Studio Profit Payout Threshold</h3>
          <p style={{ marginTop: 0, color: 'var(--text-secondary)' }}>
            Studio payouts are marked eligible once studio profit reaches this amount.
          </p>
          <div className="form-group" style={{ maxWidth: '280px' }}>
            <label>Payout Threshold ($)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={payoutThreshold}
              onChange={(e) => setPayoutThreshold(Number(e.target.value) || 0)}
            />
          </div>
          <button
            onClick={handleSavePayoutThreshold}
            className="btn btn-primary"
            disabled={savingPayoutThreshold}
          >
            {savingPayoutThreshold ? 'Saving...' : 'Save Payout Threshold'}
          </button>
        </div>
      </div>

      {/* Subscription Plans — Stripe Price ID configuration */}
      <div className="admin-summary-box" style={{ marginBottom: '24px' }}>
        <h2 style={{ marginTop: 0 }}>📋 Subscription Plans — Stripe Price IDs</h2>
        <p style={{ marginTop: '0.25rem', color: 'var(--text-secondary)' }}>
          Set the Stripe <code>price_xxx</code> IDs for each plan. Create them first in your Stripe Dashboard
          under <strong>Products → Pricing</strong>, then paste the IDs here. Studios use these when
          subscribing via Stripe Checkout.
        </p>
        {subscriptionPlans.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No subscription plans found.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1rem' }}>
            {subscriptionPlans.map(plan => (
              <div
                key={plan.id}
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '1rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <strong style={{ fontSize: '1rem' }}>{plan.name}</strong>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    ${plan.monthly_price}/mo{plan.yearly_price ? ` · $${plan.yearly_price}/yr` : ''}
                  </span>
                  {!plan.is_active && (
                    <span className="status-badge inactive" style={{ marginLeft: 'auto' }}>Inactive</span>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.8rem' }}>Monthly Price ID</label>
                    <input
                      type="text"
                      placeholder="price_..."
                      value={editingPlanPrices[plan.id]?.monthly ?? ''}
                      onChange={e => setEditingPlanPrices(prev => ({
                        ...prev,
                        [plan.id]: { ...prev[plan.id], monthly: e.target.value },
                      }))}
                      style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.8rem' }}>Yearly Price ID</label>
                    <input
                      type="text"
                      placeholder="price_... (optional)"
                      value={editingPlanPrices[plan.id]?.yearly ?? ''}
                      onChange={e => setEditingPlanPrices(prev => ({
                        ...prev,
                        [plan.id]: { ...prev[plan.id], yearly: e.target.value },
                      }))}
                      style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                    />
                  </div>
                </div>
                <button
                  onClick={() => handleSavePlanPrices(plan.id)}
                  className="btn btn-primary"
                  disabled={savingPlanPrices[plan.id]}
                  style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}
                >
                  {savingPlanPrices[plan.id] ? 'Saving…' : `Save ${plan.name} Price IDs`}
                </button>
              </div>
            ))}
          </div>
        )}
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
        <div className="stat-card">
          <h3>Total Super Admin Profit</h3>
          <p className="stat-value" style={{ color: '#fbbf24' }}>
            ${Number(profitSummary?.totals?.totalSuperAdminProfit || 0).toFixed(2)}
          </p>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
            Studio payout threshold: ${Number(profitSummary?.payoutThreshold ?? payoutThreshold).toFixed(2)}
          </p>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowSuperAdminProfitByStudio((prev) => !prev)}
            style={{ marginTop: '0.5rem' }}
          >
            {showSuperAdminProfitByStudio ? 'Hide by Studio' : 'Drill by Studio'}
          </button>
        </div>
        <div className="stat-card">
          <h3>Total Studio Profit</h3>
          <p className="stat-value" style={{ color: '#86efac' }}>
            ${Number(profitSummary?.totals?.totalStudioProfit || 0).toFixed(2)}
          </p>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
            Eligible studios: {Number(profitSummary?.totals?.eligibleStudioCount || 0)}
          </p>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowStudioProfitByStudio((prev) => !prev)}
            style={{ marginTop: '0.5rem' }}
          >
            {showStudioProfitByStudio ? 'Hide by Studio' : 'Drill by Studio'}
          </button>
        </div>
        <div className="stat-card">
          <h3>Total Stripe Fees</h3>
          <p className="stat-value" style={{ color: '#fca5a5' }}>
            ${Number(profitSummary?.totals?.totalStripeFees || 0).toFixed(2)}
          </p>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
            Internal only — not charged to customers
          </p>
        </div>
      </div>

      {(showSuperAdminProfitByStudio || showStudioProfitByStudio) && profitSummary && (
        <div className="admin-summary-box" style={{ marginBottom: '24px' }}>
          <h3 style={{ marginTop: 0 }}>Profit by Studio</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Studio</th>
                  <th>Orders</th>
                  {showSuperAdminProfitByStudio && <th style={{ textAlign: 'right' }}>Super Admin Profit</th>}
                  {showStudioProfitByStudio && <th style={{ textAlign: 'right' }}>Studio Profit</th>}
                  <th style={{ textAlign: 'right' }}>Stripe Fees</th>
                  <th style={{ textAlign: 'right' }}>Paid Out</th>
                  <th style={{ textAlign: 'center' }}>Payout Status</th>
                  <th style={{ textAlign: 'right' }}>Studio Revenue</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {profitSummary.byStudio.map((row) => (
                  <tr key={row.studioId}>
                    <td>{row.studioName}</td>
                    <td>{row.orderCount}</td>
                    {showSuperAdminProfitByStudio && (
                      <td style={{ textAlign: 'right', color: '#fbbf24', fontWeight: 'bold' }}>
                        ${row.superAdminProfit.toFixed(2)}
                      </td>
                    )}
                    {showStudioProfitByStudio && (
                      <td style={{ textAlign: 'right', color: '#86efac', fontWeight: 'bold' }}>
                        ${row.studioProfit.toFixed(2)}
                      </td>
                    )}
                    <td style={{ textAlign: 'right', color: '#fca5a5' }}>
                      ${Number(row.stripeFeeAmount || 0).toFixed(2)}
                    </td>
                    <td style={{ textAlign: 'right' }}>${(row.totalPayouts || 0).toFixed(2)}</td>
                    <td style={{ textAlign: 'center' }}>
                      {row.isPayoutEligible ? (
                        <span className="status-badge status-active">Eligible</span>
                      ) : (
                        <span className="status-badge status-inactive">
                          ${(row.amountToNextPayout || 0).toFixed(2)} to go
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>${row.studioRevenue.toFixed(2)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => fetchStudioPayoutHistory(row)}>
                          View Payouts
                        </button>
                        <button
                          className="btn btn-success btn-sm"
                          disabled={!row.isPayoutEligible}
                          onClick={() => handleMarkPayoutSent(row)}
                        >
                          Mark Payout
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="admin-summary-box" style={{ marginBottom: '24px' }}>
        <h3 style={{ marginTop: 0 }}>Studios Management</h3>
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
              <th style={{ textAlign: 'right' }}>Studio Profit</th>
              <th style={{ textAlign: 'right' }}>Super Admin Profit</th>
              <th style={{ textAlign: 'right' }}>Paid Out</th>
              <th>Payout Status</th>
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
                <td style={{ textAlign: 'right', color: '#86efac', fontWeight: 'bold' }}>
                  ${Number(profitSummary?.byStudio?.find((row) => row.studioId === studio.id)?.studioProfit || 0).toFixed(2)}
                </td>
                <td style={{ textAlign: 'right', color: '#fbbf24', fontWeight: 'bold' }}>
                  ${Number(profitSummary?.byStudio?.find((row) => row.studioId === studio.id)?.superAdminProfit || 0).toFixed(2)}
                </td>
                <td style={{ textAlign: 'right' }}>
                  ${Number(profitSummary?.byStudio?.find((row) => row.studioId === studio.id)?.totalPayouts || 0).toFixed(2)}
                </td>
                <td>
                  {(() => {
                    const row = profitSummary?.byStudio?.find((item) => item.studioId === studio.id);
                    if (!row) return <span style={{ color: 'var(--text-secondary)' }}>—</span>;
                    return row.isPayoutEligible
                      ? <span className="status-badge status-active">Eligible</span>
                      : <span className="status-badge status-inactive">${row.amountToNextPayout.toFixed(2)} to go</span>;
                  })()}
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
                    style={{ marginRight: '8px' }}
                  >
                    Edit Fees
                  </button>
                  {(() => {
                    const row = profitSummary?.byStudio?.find((item) => item.studioId === studio.id);
                    if (!row) return null;
                    return (
                      <>
                        <button
                          onClick={() => fetchStudioPayoutHistory(row)}
                          className="btn btn-secondary btn-sm"
                          style={{ marginRight: '8px' }}
                        >
                          View Payouts
                        </button>
                        <button
                          onClick={() => handleMarkPayoutSent(row)}
                          className="btn btn-success btn-sm"
                          disabled={!row.isPayoutEligible}
                        >
                          Mark Payout
                        </button>
                      </>
                    );
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>

      {selectedPayoutStudio && (
        <div className="admin-summary-box" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>
              Payout History — {selectedPayoutStudio.studioName}
            </h3>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedPayoutStudio(null)}>
              Close
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th>Created By</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {studioPayoutHistory.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                      No payout history for this studio.
                    </td>
                  </tr>
                ) : (
                  studioPayoutHistory.map((payout) => (
                    <tr key={payout.id}>
                      <td>#{payout.id}</td>
                      <td>{new Date(payout.createdAt).toLocaleString()}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold' }}>${Number(payout.amount || 0).toFixed(2)}</td>
                      <td>{payout.createdByName || '—'}</td>
                      <td>{payout.notes || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

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

