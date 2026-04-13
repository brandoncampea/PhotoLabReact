import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { studioFeatureService } from '../services/studioFeatureService';
import AdminLayout from '../components/AdminLayout';

interface SubscriptionInfo {
  studio: {
    id: number;
    name: string;
    subscription_status: string;
    subscription_start?: string;
    subscription_end?: string;
    billing_cycle?: string;
    is_free_subscription?: boolean;
    cancellation_requested?: boolean;
    cancellation_date?: string;
  };
  plan: {
    id: string;
    name: string;
    monthlyPrice: number;
    yearlyPrice?: number;
    maxAlbums?: number;
    maxUsers?: number;
    maxPhotos?: number;
    maxStorageGb?: number;
    features: string[];
  };
}

interface Plan {
  id: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice?: number;
  maxAlbums?: number;
  maxUsers?: number;
  maxPhotos?: number;
  maxStorageGb?: number;
  features: string[];
}

interface StudioUsageStats {
  usage: {
    albumCount: number;
    photoCount: number;
    storageBytes: number;
    storageGbUsed: number;
  };
  limits: {
    maxAlbums: number | null;
    maxPhotos: number | null;
    maxStorageGb: number | null;
  };
}

interface StudioProfitOrder {
  orderId: number;
  orderDate: string;
  itemCount: number;
  studioRevenue: number;
  baseRevenue: number;
  grossStudioMarkup: number;
  superAdminProfit: number;
  stripeFeeAmount: number;
  studioProfit: number;
}

interface StudioProfitSummary {
  studioId: number;
  studioName: string;
  totalOrders: number;
  totalItems: number;
  totalStudioRevenue: number;
  totalBaseRevenue: number;
  totalGrossStudioMarkup: number;
  totalSuperAdminProfit: number;
  totalStripeFees: number;
  totalStudioProfitGross: number;
  totalStudioProfit: number;
  totalPayouts: number;
  payoutThreshold: number;
  isPayoutEligible: boolean;
  amountToNextPayout: number;
  orders: StudioProfitOrder[];
}

interface StudioPayoutHistoryItem {
  id: number;
  amount: number;
  notes?: string;
  createdAt: string;
  createdByName?: string;
}

export default function StudioAdminDashboard() {
    // Editable shipping address state
    const [shipFrom, setShipFrom] = useState({
      ship_from_name: '',
      ship_from_address1: '',
      ship_from_address2: '',
      ship_from_city: '',
      ship_from_state: '',
      ship_from_zip: '',
      ship_from_country: ''
    });
    const [shipFromLoading, setShipFromLoading] = useState(false);
    const [shipFromSaved, setShipFromSaved] = useState(false);

    // Populate shipping address state when subscription loads
    useEffect(() => {
      if (subscription?.studio) {
        setShipFrom({
          ship_from_name: subscription.studio.ship_from_name || '',
          ship_from_address1: subscription.studio.ship_from_address1 || '',
          ship_from_address2: subscription.studio.ship_from_address2 || '',
          ship_from_city: subscription.studio.ship_from_city || '',
          ship_from_state: subscription.studio.ship_from_state || '',
          ship_from_zip: subscription.studio.ship_from_zip || '',
          ship_from_country: subscription.studio.ship_from_country || ''
        });
      }
    }, [subscription]);

    const handleShipFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setShipFrom((prev) => ({ ...prev, [name]: value }));
      setShipFromSaved(false);
    };

    const handleSaveShipFrom = async () => {
      setShipFromLoading(true);
      setShipFromSaved(false);
      try {
        const response = await fetch(`/api/studios/${effectiveStudioId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify(shipFrom),
        });
        if (response.ok) {
          setShipFromSaved(true);
          fetchSubscriptionInfo(); // Refresh data
        }
      } catch (err) {
        // Optionally handle error
      } finally {
        setShipFromLoading(false);
      }
    };
  const { user } = useAuth();
  const effectiveStudioId = studioFeatureService.getEffectiveStudioId(user);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [availablePlans, setAvailablePlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedUpgradePlan, setSelectedUpgradePlan] = useState<string>('');
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [studioFees, setStudioFees] = useState<{ feeType: string; feeValue: number } | null>(null);
  const [usageStats, setUsageStats] = useState<StudioUsageStats | null>(null);
  const [profitSummary, setProfitSummary] = useState<StudioProfitSummary | null>(null);
  const [showProfitOrders, setShowProfitOrders] = useState(false);
  const [payoutHistory, setPayoutHistory] = useState<StudioPayoutHistoryItem[]>([]);
  const [showPayoutHistory, setShowPayoutHistory] = useState(false);
  const [publicStudioLink, setPublicStudioLink] = useState('');
  const [shareLinkNotice, setShareLinkNotice] = useState('');

  useEffect(() => {
    if (effectiveStudioId) {
      fetchSubscriptionInfo();
      fetchAvailablePlans();
      fetchStudioFees();
      fetchUsageStats();
      fetchProfitSummary();
      fetchPayoutHistory();
      fetchPublicStudioLink();
    }
  }, [user, effectiveStudioId]);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('authToken');
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
    };
    const actingStudioId = localStorage.getItem('viewAsStudioId');
    if (user?.role === 'super_admin' && actingStudioId) {
      headers['x-acting-studio-id'] = actingStudioId;
    }
    return headers;
  };

  const fetchStudioFees = async () => {
    try {
      const response = await fetch(
        `/api/studios/${effectiveStudioId}/fees`,
        {
          headers: getAuthHeaders()
        }
      );

      if (response.ok) {
        const data = await response.json();
        setStudioFees(data);
      }
    } catch (err: any) {
      console.error('Failed to load studio fees:', err);
    }
  };

  const fetchSubscriptionInfo = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/studios/${effectiveStudioId}/subscription`,
        {
          headers: getAuthHeaders()
        }
      );

      if (response.ok) {
        const data = await response.json();
        setSubscription(data);
        setError('');
      } else {
        setError('Failed to load subscription info');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsageStats = async () => {
    try {
      const response = await fetch(`/api/studios/${effectiveStudioId}/usage`, {
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        setUsageStats(data);
      }
    } catch (err) {
      console.error('Failed to load usage stats:', err);
    }
  };

  const fetchAvailablePlans = async () => {
    try {
      const response = await fetch('/api/studios/plans/list');
      if (response.ok) {
        const data = await response.json();
        setAvailablePlans(Object.values(data));
      }
    } catch (err) {
      console.error('Failed to fetch plans:', err);
    }
  };

  const fetchProfitSummary = async () => {
    if (!effectiveStudioId) return;
    try {
      const response = await fetch(`/api/studios/${effectiveStudioId}/profit`, {
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        setProfitSummary(data);
      } else {
        setProfitSummary(null);
      }
    } catch (err) {
      console.error('Failed to load studio profit summary:', err);
      setProfitSummary(null);
    }
  };

  const fetchPayoutHistory = async () => {
    if (!effectiveStudioId) return;
    try {
      const response = await fetch(`/api/studios/${effectiveStudioId}/profit-payouts`, {
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setPayoutHistory(Array.isArray(data.payouts) ? data.payouts : []);
      } else {
        setPayoutHistory([]);
      }
    } catch (err) {
      console.error('Failed to load payout history:', err);
      setPayoutHistory([]);
    }
  };

  const fetchPublicStudioLink = async () => {
    if (!effectiveStudioId) return;
    try {
      const response = await fetch(`/api/studios/${effectiveStudioId}/public-link`, {
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        setPublicStudioLink(data.url || '');
      } else {
        setPublicStudioLink('');
      }
    } catch (err) {
      console.error('Failed to load studio public link:', err);
      setPublicStudioLink('');
    }
  };

  const handleCopyPublicLink = async () => {
    if (!publicStudioLink) return;
    try {
      await navigator.clipboard.writeText(publicStudioLink);
      setShareLinkNotice('Customer link copied to clipboard');
      setTimeout(() => setShareLinkNotice(''), 2500);
    } catch {
      setShareLinkNotice('Could not copy link');
      setTimeout(() => setShareLinkNotice(''), 2500);
    }
  };

  const handleSharePublicLink = async () => {
    if (!publicStudioLink || !subscription?.studio?.name) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${subscription.studio.name} Gallery`,
          text: `View ${subscription.studio.name}'s photo galleries`,
          url: publicStudioLink,
        });
        return;
      } catch {
        // fall through to clipboard
      }
    }
    await handleCopyPublicLink();
  };

  const handleUpgrade = async () => {
    if (!selectedUpgradePlan) {
      alert('Please select a plan');
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `/api/studios/${user?.studioId}/checkout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            planId: selectedUpgradePlan,
            billingCycle: selectedBillingCycle
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        // Redirect to Stripe Checkout
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
        }
      } else {
        setError('Failed to create checkout session');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isExpiringSoon = subscription?.studio.subscription_end ? 
    new Date(subscription.studio.subscription_end) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) :
    false;

  const handleCancelSubscription = async () => {
    if (!confirm('Are you sure you want to cancel your subscription? You will retain access until the end of your billing period.')) {
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `/api/studios/${user?.studioId}/subscription/cancel`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        alert(data.message);
        await fetchSubscriptionInfo();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to cancel subscription');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReactivateSubscription = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `/api/studios/${user?.studioId}/subscription/reactivate`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        alert(data.message);
        await fetchSubscriptionInfo();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to reactivate subscription');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const needsSubscription = subscription?.studio.subscription_status === 'inactive' || 
    subscription?.studio.is_free_subscription;

  const formatStorage = (storageBytes: number) => {
    const gb = storageBytes / (1024 ** 3);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = storageBytes / (1024 ** 2);
    return `${mb.toFixed(1)} MB`;
  };

  const getUsagePercent = (used: number, limit: number | null) => {
    if (!limit || limit <= 0) return 0;
    return Math.min((used / limit) * 100, 100);
  };

  return (
    <AdminLayout>
      <h1>Studio Dashboard</h1>

      {error && <div style={{ color: 'var(--error-color)', marginBottom: '20px' }}>{error}</div>}

      {/* Subscription Required Banner */}
      {needsSubscription && (
        <div style={{
          backgroundColor: 'rgba(251, 191, 36, 0.12)',
          border: '2px solid rgba(251, 191, 36, 0.5)',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '30px',
          textAlign: 'center'
        }}>
          <h2 style={{ color: '#fde68a', margin: '0 0 15px 0' }}>
            🔒 Subscription Required
          </h2>
          <p style={{ color: '#fde68a', margin: '0 0 15px 0', fontSize: '16px' }}>
            To create albums and start selling, please subscribe to one of our plans.
          </p>
          <button
            onClick={() => setShowUpgradeModal(true)}
            className="btn btn-primary"
            style={{ fontSize: '16px', fontWeight: 'bold' }}
          >
            View Subscription Plans
          </button>
        </div>
      )}

      {/* Cancellation Warning Banner */}
      {subscription?.studio.cancellation_requested && (
        <div style={{
          backgroundColor: 'rgba(251, 191, 36, 0.12)',
          border: '2px solid rgba(251, 191, 36, 0.5)',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '30px'
        }}>
          <h3 style={{ color: '#fde68a', margin: '0 0 10px 0' }}>
            ⚠️ Subscription Cancellation Scheduled
          </h3>
          <p style={{ color: '#fde68a', margin: '0 0 15px 0' }}>
            Your subscription will end on {subscription.studio.subscription_end 
              ? new Date(subscription.studio.subscription_end).toLocaleDateString()
              : 'the renewal date'}. 
            You will continue to have full access until then.
          </p>
          <button
            onClick={handleReactivateSubscription}
            disabled={loading}
            className="btn btn-success"
            style={{ fontSize: '14px', fontWeight: 'bold', opacity: loading ? 0.6 : 1 }}
          >
            {loading ? 'Processing...' : 'Reactivate Subscription'}
          </button>
        </div>
      )}

      {!effectiveStudioId && user?.role === 'super_admin' && (
        <div style={{
          backgroundColor: 'rgba(59, 130, 246, 0.12)',
          border: '1px solid rgba(59, 130, 246, 0.4)',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '24px',
          color: '#bfdbfe'
        }}>
          Select a studio from Studio Admins and choose view-as-studio to see that studio’s dashboard details.
        </div>
      )}

      {publicStudioLink && (
        <div
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '24px'
          }}
        >
          <h3 style={{ margin: '0 0 10px 0' }}>Customer Direct Link</h3>
          <p style={{ margin: '0 0 12px 0', color: 'var(--text-secondary)' }}>
            Share this URL with customers so they can go straight to your studio galleries.
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              value={publicStudioLink}
              readOnly
              style={{
                flex: 1,
                minWidth: '280px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                padding: '10px',
                color: 'var(--text-primary)'
              }}
            />
            <button className="btn btn-primary" onClick={handleSharePublicLink}>Share Link</button>
            <button className="btn btn-secondary" onClick={handleCopyPublicLink}>Copy Link</button>
            <a className="btn btn-secondary" href={publicStudioLink} target="_blank" rel="noreferrer">Open</a>
          </div>
          {shareLinkNotice && (
            <div style={{ marginTop: '10px', color: '#86efac', fontSize: '14px' }}>{shareLinkNotice}</div>
          )}
        </div>
      )}

      {subscription && (
        <>
          {/* Current Subscription Card */}
          <div style={{
            backgroundColor: 'var(--bg-tertiary)',
            padding: '20px',
            borderRadius: '8px',
            marginBottom: '30px',
            border: isExpiringSoon ? '2px solid rgba(251, 191, 36, 0.5)' : '1px solid var(--border-color)'
          }}>
            <h2>{subscription.studio.name}</h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginTop: '20px' }}>
              <div>
                <h4>Current Plan</h4>
                <p style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                  {subscription.plan?.name || 'No Plan'}
                </p>
                {subscription.studio.is_free_subscription ? (
                  <p style={{ color: '#86efac', fontWeight: 'bold' }}>FREE (No Billing)</p>
                ) : (
                  <p style={{ color: 'var(--text-secondary)' }}>
                    ${subscription.studio.billing_cycle === 'yearly' 
                      ? subscription.plan?.yearlyPrice 
                      : subscription.plan?.monthlyPrice}
                    /{subscription.studio.billing_cycle === 'yearly' ? 'year' : 'month'}
                  </p>
                )}
              </div>

              <div>
                <h4>Status</h4>
                <p style={{
                  fontSize: '18px',
                  fontWeight: 'bold',
                  color: subscription.studio.cancellation_requested 
                    ? '#fde68a' 
                    : subscription.studio.subscription_status === 'active' ? '#86efac' : 'var(--error-color)'
                }}>
                  {subscription.studio.cancellation_requested 
                    ? `Active (Cancels ${subscription.studio.subscription_end 
                        ? new Date(subscription.studio.subscription_end).toLocaleDateString()
                        : 'at renewal'})`
                    : subscription.studio.subscription_status}
                </p>
              </div>

              <div>
                <h4>Renewal Date</h4>
                <p style={{ fontSize: '16px' }}>
                  {subscription.studio.subscription_end 
                    ? new Date(subscription.studio.subscription_end).toLocaleDateString()
                    : 'Not set'
                  }
                </p>
              </div>
            </div>

            {usageStats && (
              <div style={{ marginTop: '24px' }}>
                <h3 style={{ marginBottom: '12px' }}>Plan Usage</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                  <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Albums</div>
                    <div style={{ fontSize: '22px', fontWeight: 'bold' }}>
                      {usageStats.usage.albumCount}
                      <span style={{ fontSize: '14px', color: 'var(--text-secondary)', marginLeft: '6px' }}>
                        / {usageStats.limits.maxAlbums ?? 'Unlimited'}
                      </span>
                    </div>
                    {usageStats.limits.maxAlbums && (
                      <div style={{ marginTop: '10px', height: '8px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '999px', overflow: 'hidden' }}>
                        <div style={{ width: `${getUsagePercent(usageStats.usage.albumCount, usageStats.limits.maxAlbums)}%`, height: '100%', backgroundColor: 'var(--primary-color)' }} />
                      </div>
                    )}
                  </div>

                  <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Photos</div>
                    <div style={{ fontSize: '22px', fontWeight: 'bold' }}>
                      {usageStats.usage.photoCount}
                      <span style={{ fontSize: '14px', color: 'var(--text-secondary)', marginLeft: '6px' }}>
                        / {usageStats.limits.maxPhotos ?? 'Unlimited'}
                      </span>
                    </div>
                    {usageStats.limits.maxPhotos && (
                      <div style={{ marginTop: '10px', height: '8px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '999px', overflow: 'hidden' }}>
                        <div style={{ width: `${getUsagePercent(usageStats.usage.photoCount, usageStats.limits.maxPhotos)}%`, height: '100%', backgroundColor: '#10b981' }} />
                      </div>
                    )}
                  </div>

                  <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Storage Used</div>
                    <div style={{ fontSize: '22px', fontWeight: 'bold' }}>
                      {formatStorage(usageStats.usage.storageBytes)}
                      <span style={{ fontSize: '14px', color: 'var(--text-secondary)', marginLeft: '6px' }}>
                        / {usageStats.limits.maxStorageGb ? `${usageStats.limits.maxStorageGb} GB` : 'Unlimited'}
                      </span>
                    </div>
                    {usageStats.limits.maxStorageGb && (
                      <div style={{ marginTop: '10px', height: '8px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '999px', overflow: 'hidden' }}>
                        <div style={{ width: `${getUsagePercent(usageStats.usage.storageGbUsed, usageStats.limits.maxStorageGb)}%`, height: '100%', backgroundColor: '#f59e0b' }} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {isExpiringSoon && (
              <div style={{
                marginTop: '15px',
                padding: '10px',
                backgroundColor: 'rgba(251, 191, 36, 0.12)',
                border: '1px solid rgba(251, 191, 36, 0.5)',
                borderRadius: '4px',
                color: '#fde68a'
              }}>
                ⚠️ Your subscription is expiring soon!
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
              {subscription.studio.subscription_status === 'active' && 
               !subscription.studio.is_free_subscription && 
               !subscription.studio.cancellation_requested && (
                <button
                  onClick={handleCancelSubscription}
                  disabled={loading}
                  className="btn btn-danger"
                  style={{ fontSize: '14px', opacity: loading ? 0.6 : 1 }}
                >
                  Cancel Subscription
                </button>
              )}
            </div>
          </div>

          {/* Ship From Address Section */}
          <div style={{
            backgroundColor: 'var(--bg-tertiary)',
            padding: '20px',
            borderRadius: '8px',
            marginBottom: '30px',
            border: '1px solid var(--border-color)'
          }}>
            <h3 style={{ marginTop: 0 }}>📦 Ship From Address</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '15px' }}>Name</div>
                <input
                  type="text"
                  name="ship_from_name"
                  value={shipFrom.ship_from_name}
                  onChange={handleShipFromChange}
                  className="form-control"
                  placeholder="Sender Name"
                  style={{ width: '100%' }}
                  disabled={shipFromLoading}
                />
              </div>
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '15px' }}>Address 1</div>
                <input
                  type="text"
                  name="ship_from_address1"
                  value={shipFrom.ship_from_address1}
                  onChange={handleShipFromChange}
                  className="form-control"
                  placeholder="Street Address 1"
                  style={{ width: '100%' }}
                  disabled={shipFromLoading}
                />
              </div>
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '15px' }}>Address 2</div>
                <input
                  type="text"
                  name="ship_from_address2"
                  value={shipFrom.ship_from_address2}
                  onChange={handleShipFromChange}
                  className="form-control"
                  placeholder="Street Address 2 (optional)"
                  style={{ width: '100%' }}
                  disabled={shipFromLoading}
                />
              </div>
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '15px' }}>City</div>
                <input
                  type="text"
                  name="ship_from_city"
                  value={shipFrom.ship_from_city}
                  onChange={handleShipFromChange}
                  className="form-control"
                  placeholder="City"
                  style={{ width: '100%' }}
                  disabled={shipFromLoading}
                />
              </div>
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '15px' }}>State</div>
                <input
                  type="text"
                  name="ship_from_state"
                  value={shipFrom.ship_from_state}
                  onChange={handleShipFromChange}
                  className="form-control"
                  placeholder="State/Province"
                  style={{ width: '100%' }}
                  disabled={shipFromLoading}
                />
              </div>
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '15px' }}>ZIP</div>
                <input
                  type="text"
                  name="ship_from_zip"
                  value={shipFrom.ship_from_zip}
                  onChange={handleShipFromChange}
                  className="form-control"
                  placeholder="ZIP/Postal Code"
                  style={{ width: '100%' }}
                  disabled={shipFromLoading}
                />
              </div>
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '15px' }}>Country</div>
                <input
                  type="text"
                  name="ship_from_country"
                  value={shipFrom.ship_from_country}
                  onChange={handleShipFromChange}
                  className="form-control"
                  placeholder="Country"
                  style={{ width: '100%' }}
                  disabled={shipFromLoading}
                />
              </div>
            </div>
            <div style={{ marginTop: '18px', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button
                className="btn btn-primary"
                onClick={handleSaveShipFrom}
                disabled={shipFromLoading}
                style={{ minWidth: 120 }}
              >
                {shipFromLoading ? 'Saving...' : 'Save Shipping Address'}
              </button>
              {shipFromSaved && <span style={{ color: '#22c55e' }}>Saved!</span>}
            </div>
          </div>

          {/* Product Fees Info */}
          {studioFees && (
            <div style={{
              backgroundColor: 'var(--bg-tertiary)',
              padding: '20px',
              borderRadius: '8px',
              marginBottom: '30px',
              border: '1px solid var(--border-color)'
            }}>
              <h3 style={{ marginTop: 0 }}>💰 Product Fees Applied</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '15px' }}>
                The following fee is added to each product price when customers make purchases:
              </p>
              <div style={{
                backgroundColor: 'var(--bg-primary)',
                padding: '15px',
                borderRadius: '6px',
                border: '2px solid rgba(251, 191, 36, 0.5)'
              }}>
                <p style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>
                  {studioFees.feeType === 'percentage'
                    ? `${studioFees.feeValue}% markup`
                    : `$${studioFees.feeValue.toFixed(2)} per item`
                  }
                </p>
                <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {studioFees.feeType === 'percentage'
                    ? 'This percentage is added to the base price of each product'
                    : 'This fixed amount is added to each product price'
                  }
                </p>
              </div>
            </div>
          )}

          {/* Studio Profit Summary */}
          {profitSummary && (
            <div style={{
              backgroundColor: 'var(--bg-tertiary)',
              padding: '20px',
              borderRadius: '8px',
              marginBottom: '30px',
              border: '1px solid var(--border-color)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0 }}>📈 Studio Profit</h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowProfitOrders((prev) => !prev)}
                  >
                    {showProfitOrders ? 'Hide Orders' : 'Drill into Orders'}
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowPayoutHistory((prev) => !prev)}
                  >
                    {showPayoutHistory ? 'Hide Payouts' : 'View Payout History'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <div className="admin-summary-box">
                  <div className="muted-text" style={{ fontSize: '12px' }}>Available Studio Profit</div>
                  <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#86efac' }}>
                    ${profitSummary.totalStudioProfit.toFixed(2)}
                  </div>
                </div>
                <div className="admin-summary-box">
                  <div className="muted-text" style={{ fontSize: '12px' }}>Total Paid Out</div>
                  <div style={{ fontSize: '22px', fontWeight: 'bold' }}>
                    ${Number(profitSummary.totalPayouts || 0).toFixed(2)}
                  </div>
                </div>
                <div className="admin-summary-box">
                  <div className="muted-text" style={{ fontSize: '12px' }}>Studio Revenue</div>
                  <div style={{ fontSize: '22px', fontWeight: 'bold' }}>
                    ${profitSummary.totalStudioRevenue.toFixed(2)}
                  </div>
                </div>
                <div className="admin-summary-box">
                  <div className="muted-text" style={{ fontSize: '12px' }}>Base Order Cost</div>
                  <div style={{ fontSize: '22px', fontWeight: 'bold' }}>
                    ${Number(profitSummary.totalBaseRevenue || 0).toFixed(2)}
                  </div>
                </div>
                <div className="admin-summary-box">
                  <div className="muted-text" style={{ fontSize: '12px' }}>Gross Studio Markup</div>
                  <div style={{ fontSize: '22px', fontWeight: 'bold' }}>
                    ${Number(profitSummary.totalGrossStudioMarkup || 0).toFixed(2)}
                  </div>
                </div>
                <div className="admin-summary-box">
                  <div className="muted-text" style={{ fontSize: '12px' }}>Super Admin Profit</div>
                  <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#fbbf24' }}>
                    ${profitSummary.totalSuperAdminProfit.toFixed(2)}
                  </div>
                </div>
                <div className="admin-summary-box">
                  <div className="muted-text" style={{ fontSize: '12px' }}>Stripe Fees</div>
                  <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#fca5a5' }}>
                    ${Number(profitSummary.totalStripeFees || 0).toFixed(2)}
                  </div>
                </div>
                <div className="admin-summary-box">
                  <div className="muted-text" style={{ fontSize: '12px' }}>Discounts</div>
                  <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#a5b4fc' }}>
                    ${Number(profitSummary.totalDiscounts || 0).toFixed(2)}
                  </div>
                </div>
                <div className="admin-summary-box">
                  <div className="muted-text" style={{ fontSize: '12px' }}>Orders</div>
                  <div style={{ fontSize: '22px', fontWeight: 'bold' }}>{profitSummary.totalOrders}</div>
                </div>
              </div>

              <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Payout threshold: <strong>${profitSummary.payoutThreshold.toFixed(2)}</strong>
              </div>
              <div style={{ marginTop: '6px' }}>
                {profitSummary.isPayoutEligible ? (
                  <span className="status-badge status-active">Payout Eligible</span>
                ) : (
                  <span className="status-badge status-inactive">
                    ${(profitSummary.amountToNextPayout || 0).toFixed(2)} more to reach payout
                  </span>
                )}
              </div>

              {showPayoutHistory && (
                <div style={{ marginTop: '16px', overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Payout ID</th>
                        <th>Date</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                        <th>Created By</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payoutHistory.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                            No payouts recorded yet.
                          </td>
                        </tr>
                      ) : (
                        payoutHistory.map((payout) => (
                          <tr key={payout.id}>
                            <td>#{payout.id}</td>
                            <td>{new Date(payout.createdAt).toLocaleString()}</td>
                            <td style={{ textAlign: 'right' }}>${Number(payout.amount || 0).toFixed(2)}</td>
                            <td>{payout.createdByName || '—'}</td>
                            <td>{payout.notes || '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {showProfitOrders && (
                <div style={{ marginTop: '16px', overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Date</th>
                        <th>Items</th>
                        <th style={{ textAlign: 'right' }}>Revenue</th>
                        <th style={{ textAlign: 'right' }}>Base Cost</th>
                        <th style={{ textAlign: 'right' }}>Markup</th>
                        <th style={{ textAlign: 'right' }}>Stripe Fee</th>
                        <th style={{ textAlign: 'right' }}>Super Admin Profit</th>
                        <th style={{ textAlign: 'right' }}>Studio Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profitSummary.orders.length === 0 ? (
                        <tr>
                          <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                            No order profit data yet.
                          </td>
                        </tr>
                      ) : (
                        profitSummary.orders.map((order) => (
                          <tr key={order.orderId}>
                            <td>#{order.orderId}</td>
                            <td>{new Date(order.orderDate).toLocaleDateString()}</td>
                            <td>{order.itemCount}</td>
                            <td style={{ textAlign: 'right' }}>${order.studioRevenue.toFixed(2)}</td>
                            <td style={{ textAlign: 'right' }}>${order.baseRevenue.toFixed(2)}</td>
                            <td style={{ textAlign: 'right' }}>${order.grossStudioMarkup.toFixed(2)}</td>
                            <td style={{ textAlign: 'right', color: '#fca5a5' }}>${order.stripeFeeAmount.toFixed(2)}</td>
                            <td style={{ textAlign: 'right', color: '#fbbf24' }}>${order.superAdminProfit.toFixed(2)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#86efac' }}>
                              ${order.studioProfit.toFixed(2)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Plan Features */}
          {subscription.plan && (
            <div style={{ marginBottom: '30px' }}>
              <h3>Your Plan Includes:</h3>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {subscription.plan.features?.map((feature, idx) => (
                  <li key={idx} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                    ✓ {feature}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Available Plans */}
          <div>
            <h3>Upgrade Your Plan</h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '20px'
            }}>
              {availablePlans.map(plan => (
                <div
                  key={plan.id}
                  style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '20px',
                    textAlign: 'center',
                    backgroundColor: subscription.plan?.id === plan.id ? 'rgba(124, 92, 255, 0.1)' : 'var(--bg-primary)'
                  }}
                >
                  <h4>{plan.name}</h4>
                  <p style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                    ${plan.monthlyPrice}/mo
                  </p>
                  {plan.yearlyPrice && (
                    <p style={{ fontSize: '14px', color: '#86efac', marginTop: '-10px' }}>
                      or ${plan.yearlyPrice}/year (Save ~17%)
                    </p>
                  )}
                  <ul style={{ listStyle: 'none', padding: '15px 0', textAlign: 'left' }}>
                    {plan.features?.map((feature, idx) => (
                      <li key={idx} style={{ padding: '4px 0', fontSize: '14px' }}>
                        ✓ {feature}
                      </li>
                    ))}
                  </ul>

                  {subscription.plan?.id === plan.id ? (
                    <button disabled className="btn btn-secondary" style={{ width: '100%' }}>
                      Current Plan
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setSelectedUpgradePlan(plan.id);
                        setShowUpgradeModal(true);
                      }}
                      className="btn btn-primary"
                      style={{ width: '100%' }}
                    >
                      {plan.monthlyPrice > (subscription.plan?.monthlyPrice || 0) ? 'Upgrade' : 'Downgrade'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="modal-overlay">
          <div className="modal-content admin-modal-content" style={{ padding: '30px', maxWidth: '400px' }}>
            <h2>Confirm Plan Change</h2>
            <p>You're about to upgrade/downgrade your subscription. You'll be redirected to payment.</p>

            <div style={{ marginBottom: '20px', marginTop: '20px' }}>
              <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>
                Billing Cycle:
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <label style={{
                  flex: 1,
                  padding: '10px',
                  border: `2px solid ${selectedBillingCycle === 'monthly' ? 'var(--primary-color)' : 'var(--border-color)'}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  backgroundColor: selectedBillingCycle === 'monthly' ? 'rgba(124, 92, 255, 0.12)' : 'var(--bg-primary)'
                }}>
                  <input
                    type="radio"
                    name="billingCycle"
                    value="monthly"
                    checked={selectedBillingCycle === 'monthly'}
                    onChange={() => setSelectedBillingCycle('monthly')}
                    style={{ marginRight: '8px' }}
                  />
                  Monthly
                </label>
                <label style={{
                  flex: 1,
                  padding: '10px',
                  border: `2px solid ${selectedBillingCycle === 'yearly' ? 'var(--primary-color)' : 'var(--border-color)'}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  backgroundColor: selectedBillingCycle === 'yearly' ? 'rgba(124, 92, 255, 0.12)' : 'var(--bg-primary)'
                }}>
                  <input
                    type="radio"
                    name="billingCycle"
                    value="yearly"
                    checked={selectedBillingCycle === 'yearly'}
                    onChange={() => setSelectedBillingCycle('yearly')}
                    style={{ marginRight: '8px' }}
                  />
                  Yearly
                  <div style={{ fontSize: '12px', color: '#86efac', marginTop: '4px' }}>
                    Save ~17%
                  </div>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={handleUpgrade}
                disabled={loading}
                className="btn btn-primary"
                style={{ flex: 1, opacity: loading ? 0.7 : 1 }}
              >
                {loading ? 'Processing...' : 'Continue to Payment'}
              </button>
              <button
                onClick={() => setShowUpgradeModal(false)}
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
