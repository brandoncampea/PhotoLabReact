import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import '../AdminStyles.css';
import AdminLayout from '../components/AdminLayout';

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
  id: string | number;
  name: string;
  monthlyPrice: number;
  yearlyPrice?: number;
  features: string[];
  isActive?: boolean;
}

interface StudioProfitRow {
  studioId: number;
  studioName: string;
  orderCount: number;
  studioRevenue: number;
  baseRevenue: number;
  grossStudioMarkup: number;
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
    totalBaseRevenue: number;
    totalGrossStudioMarkup: number;
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

export default function SuperAdminDashboard() {
  // Application version from environment variable
  const appVersion = process.env.VITE_APP_VERSION || 'unknown';
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
  const [profitSummary, setProfitSummary] = useState<ProfitSummary | null>(null);
  const [showSuperAdminProfitByStudio, setShowSuperAdminProfitByStudio] = useState(false);
  const [showStudioProfitByStudio, setShowStudioProfitByStudio] = useState(false);
  const [payoutThreshold, setPayoutThreshold] = useState(500);
  const [selectedPayoutStudio, setSelectedPayoutStudio] = useState<StudioProfitRow | null>(null);
  const [studioPayoutHistory, setStudioPayoutHistory] = useState<StudioProfitPayout[]>([]);

  const normalizePlanValue = (value: string | number | null | undefined) =>
    String(value || '').trim().toLowerCase();

  const findPlan = (value: string | number | null | undefined) => {
    const normalized = normalizePlanValue(value);
    if (!normalized) return undefined;
    return plans.find((candidate) => {
      const candidateId = normalizePlanValue(candidate.id);
      const candidateName = normalizePlanValue(candidate.name);
      return candidateId === normalized || candidateName === normalized;
    });
  };

  const getPlanSelectionValue = (value: string | number | null | undefined) => {
    const match = findPlan(value);
    if (match?.name) return String(match.name);
    return String(value || '');
  };

  useEffect(() => {
    if (user?.role === 'super_admin') {
      fetchStudios();
      fetchPlans();
      fetchPayoutThreshold();
      return (
        <div className="admin-panel dark-bg">
          {/* ...existing code... */}
          {selectedPayoutStudio && (
            <div className="admin-summary-box dark-card" style={{ marginBottom: '24px' }}>
              <div className="admin-summary-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="admin-summary-title" style={{ marginTop: 0, marginBottom: '0.75rem' }}>
                  Payout History — {selectedPayoutStudio.studioName}
                </h3>
                <button className="btn btn-secondary btn-sm dark-btn" onClick={() => setSelectedPayoutStudio(null)}>
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
          {/* ...existing code... */}
        </div>
      );
        const fallbackPlans = Object.values(fallbackData as Record<string, any>).map((plan: any) => ({
          id: plan.id,
          name: String(plan.name || '').trim(),
          monthlyPrice: Number(plan.monthlyPrice ?? plan.monthly_price ?? 0) || 0,
          yearlyPrice: plan.yearlyPrice !== undefined && plan.yearlyPrice !== null
            ? (Number(plan.yearlyPrice) || undefined)
            : (plan.yearly_price !== undefined && plan.yearly_price !== null ? (Number(plan.yearly_price) || undefined) : undefined),
          features: Array.isArray(plan.features) ? plan.features : [],
          isActive: true,
        }));
        setPlans(fallbackPlans);
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
      const studiosResponse = await fetch('/api/studios', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!studiosResponse.ok) {
        setProfitSummary(null);
        return;
      }

      const studiosData: Studio[] = await studiosResponse.json();

      const perStudio = await Promise.all(
        studiosData.map(async (studio) => {
          const response = await fetch(`/api/studios/${studio.id}/profit`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });

          if (!response.ok) {
            return {
              studioId: studio.id,
              studioName: studio.name,
              orderCount: 0,
              studioRevenue: 0,
              baseRevenue: 0,
              grossStudioMarkup: 0,
              superAdminProfit: 0,
              stripeFeeAmount: 0,
              studioProfitGross: 0,
              totalPayouts: 0,
              payoutCount: 0,
              studioProfit: 0,
              isPayoutEligible: false,
              amountToNextPayout: 0,
            } as StudioProfitRow;
          }

          const data = await response.json();
          return {
            studioId: Number(data.studioId) || studio.id,
            studioName: data.studioName || studio.name,
            orderCount: Number(data.totalOrders) || 0,
            studioRevenue: Number(data.totalStudioRevenue) || 0,
            baseRevenue: Number(data.totalBaseRevenue) || 0,
            grossStudioMarkup: Number(data.totalGrossStudioMarkup) || 0,
            superAdminProfit: Number(data.totalSuperAdminProfit) || 0,
            stripeFeeAmount: Number(data.totalStripeFees) || 0,
            studioProfitGross: Number(data.totalStudioProfitGross) || 0,
            totalPayouts: Number(data.totalPayouts) || 0,
            payoutCount: Number(data.payoutCount) || 0,
            studioProfit: Number(data.totalStudioProfit) || 0,
            isPayoutEligible: !!data.isPayoutEligible,
            amountToNextPayout: Number(data.amountToNextPayout) || 0,
          } as StudioProfitRow;
        })
      );

      const totals = perStudio.reduce(
        (acc, row) => {
          acc.totalStudioRevenue += row.studioRevenue;
          acc.totalBaseRevenue += row.baseRevenue;
          acc.totalGrossStudioMarkup += row.grossStudioMarkup;
          acc.totalSuperAdminProfit += row.superAdminProfit;
          acc.totalStripeFees += row.stripeFeeAmount;
          acc.totalStudioProfitGross += row.studioProfitGross;
          acc.totalPayouts += row.totalPayouts;
          acc.totalStudioProfit += row.studioProfit;
          acc.totalOrders += row.orderCount;
          if (row.isPayoutEligible) {
            acc.eligibleStudioCount += 1;
            acc.totalEligibleStudioPayout += row.studioProfit;
          }
          return acc;
        },
        {
          totalStudioRevenue: 0,
          totalBaseRevenue: 0,
          totalGrossStudioMarkup: 0,
          totalSuperAdminProfit: 0,
          totalStripeFees: 0,
          totalStudioProfitGross: 0,
          totalPayouts: 0,
          totalStudioProfit: 0,
          totalOrders: 0,
          eligibleStudioCount: 0,
          totalEligibleStudioPayout: 0,
        }
      );

      setProfitSummary({
        payoutThreshold,
        totals,
        byStudio: perStudio,
      });
    } catch (err) {
      console.error('Failed to fetch profit summary:', err);
      setProfitSummary(null);
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
    const plan = findPlan(planId);
    return plan ? `$${plan.monthlyPrice}/mo` : 'N/A';
  };

  const getMonthlySubscriptionRevenue = (studio: Studio) => {
    if (
      !studio ||
      studio.subscription_status !== 'active' ||
      studio.is_free_subscription
    ) {
      return 0;
    }

    const plan = findPlan(studio.subscription_plan);

    if (!plan) {
      return 0;
    }

    if (studio.billing_cycle === 'yearly') {
      const yearlyPrice = Number(plan.yearlyPrice);
      if (Number.isFinite(yearlyPrice) && yearlyPrice > 0) {
        return yearlyPrice / 12;
      }
    }

    const monthlyPrice = Number(plan.monthlyPrice);
    return Number.isFinite(monthlyPrice) ? monthlyPrice : 0;
  };

  const monthlyRevenue = studios.reduce(
    (sum, studio) => sum + getMonthlySubscriptionRevenue(studio),
    0
  );

  if (user?.role !== 'super_admin') {
    return <div style={{ padding: '20px' }}>Access denied. Super admin only.</div>;
  }

  return (
    <AdminLayout>
      <div style={{ marginBottom: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
        <strong>App Version:</strong> {appVersion || 'unknown'}
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#888' }}>
          <strong>Env Debug:</strong>
          <pre style={{ background: '#222', color: '#fff', padding: '8px', borderRadius: '4px', maxWidth: '400px', overflowX: 'auto' }}>{JSON.stringify(process.env, null, 2)}</pre>
        </div>
      </div>
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
          <p className="stat-value">${monthlyRevenue.toFixed(2)}</p>
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
          <h3>Total Studio Profit (Pre-Payout)</h3>
          <p className="stat-value" style={{ color: '#86efac' }}>
            ${Number(profitSummary?.totals?.totalStudioProfitGross || 0).toFixed(2)}
          </p>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
            Available after payouts: ${Number(profitSummary?.totals?.totalStudioProfit || 0).toFixed(2)}
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
          <h3>Total Base Cost</h3>
          <p className="stat-value">${Number(profitSummary?.totals?.totalBaseRevenue || 0).toFixed(2)}</p>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
            Base order cost across all studios
          </p>
        </div>
        <div className="stat-card">
          <h3>Total Markup</h3>
          <p className="stat-value">${Number(profitSummary?.totals?.totalGrossStudioMarkup || 0).toFixed(2)}</p>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
            Revenue minus base order cost
          </p>
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
                  <th style={{ textAlign: 'right' }}>Revenue</th>
                  <th style={{ textAlign: 'right' }}>Base Cost</th>
                  <th style={{ textAlign: 'right' }}>Markup</th>
                  <th style={{ textAlign: 'right' }}>Stripe Fees</th>
                  {showSuperAdminProfitByStudio && <th style={{ textAlign: 'right' }}>Super Admin Profit</th>}
                  {showStudioProfitByStudio && <th style={{ textAlign: 'right' }}>Studio Profit (Pre-Payout)</th>}
                  <th style={{ textAlign: 'right' }}>Paid Out</th>
                  {showStudioProfitByStudio && <th style={{ textAlign: 'right' }}>Available After Payouts</th>}
                  <th style={{ textAlign: 'center' }}>Payout Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {profitSummary.byStudio.map((row) => (
                  <tr key={row.studioId}>
                    <td>{row.studioName}</td>
                    <td>{row.orderCount}</td>
                    <td style={{ textAlign: 'right' }}>${row.studioRevenue.toFixed(2)}</td>
                    <td style={{ textAlign: 'right' }}>${Number(row.baseRevenue || 0).toFixed(2)}</td>
                    <td style={{ textAlign: 'right' }}>${Number(row.grossStudioMarkup || 0).toFixed(2)}</td>
                    <td style={{ textAlign: 'right', color: '#fca5a5' }}>
                      ${Number(row.stripeFeeAmount || 0).toFixed(2)}
                    </td>
                    {showSuperAdminProfitByStudio && (
                      <td style={{ textAlign: 'right', color: '#fbbf24', fontWeight: 'bold' }}>
                        ${row.superAdminProfit.toFixed(2)}
                      </td>
                    )}
                    {showStudioProfitByStudio && (
                      <td style={{ textAlign: 'right', color: '#86efac', fontWeight: 'bold' }}>
                        ${row.studioProfitGross.toFixed(2)}
                      </td>
                    )}
                    <td style={{ textAlign: 'right' }}>${(row.totalPayouts || 0).toFixed(2)}</td>
                    {showStudioProfitByStudio && (
                      <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                        ${row.studioProfit.toFixed(2)}
                      </td>
                    )}
                    <td style={{ textAlign: 'center' }}>
                      {row.isPayoutEligible ? (
                        <span className="status-badge status-active">Eligible</span>
                      ) : (
                        <span className="status-badge status-inactive">
                          ${(row.amountToNextPayout || 0).toFixed(2)} to go
                        </span>
                      )}
                    </td>
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
              <th style={{ textAlign: 'right' }}>Studio Profit (Pre-Payout)</th>
              <th style={{ textAlign: 'right' }}>Super Admin Profit</th>
              <th style={{ textAlign: 'right' }}>Paid Out</th>
              <th style={{ textAlign: 'right' }}>Available After Payouts</th>
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
                  ${Number(profitSummary?.byStudio?.find((row) => row.studioId === studio.id)?.studioProfitGross || 0).toFixed(2)}
                </td>
                <td style={{ textAlign: 'right', color: '#fbbf24', fontWeight: 'bold' }}>
                  ${Number(profitSummary?.byStudio?.find((row) => row.studioId === studio.id)?.superAdminProfit || 0).toFixed(2)}
                </td>
                <td style={{ textAlign: 'right' }}>
                  ${Number(profitSummary?.byStudio?.find((row) => row.studioId === studio.id)?.totalPayouts || 0).toFixed(2)}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                  ${Number(profitSummary?.byStudio?.find((row) => row.studioId === studio.id)?.studioProfit || 0).toFixed(2)}
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
                        subscriptionPlan: getPlanSelectionValue(studio.subscription_plan),
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
                  <option key={String(plan.id)} value={plan.name}>
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
    </AdminLayout>
  );
}

