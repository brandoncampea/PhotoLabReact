import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import '../AdminStyles.css';

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
  features: string[];
}

export default function StudioAdminDashboard() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [availablePlans, setAvailablePlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedUpgradePlan, setSelectedUpgradePlan] = useState<string>('');
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [studioFees, setStudioFees] = useState<{ feeType: string; feeValue: number } | null>(null);

  useEffect(() => {
    if (user?.studioId) {
      fetchSubscriptionInfo();
      fetchAvailablePlans();
      fetchStudioFees();
    }
  }, [user]);

  const fetchStudioFees = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `/api/studios/${user?.studioId}/fees`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
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
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `/api/studios/${user?.studioId}/subscription`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
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

  return (
    <div className="admin-container">
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
    </div>
  );
}
