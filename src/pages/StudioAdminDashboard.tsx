import React, { useState, useEffect } from 'react';
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
        `http://localhost:3001/api/studios/${user?.studioId}/fees`,
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
        `http://localhost:3001/api/studios/${user?.studioId}/subscription`,
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
      const response = await fetch('http://localhost:3001/api/studios/plans/list');
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
        `http://localhost:3001/api/studios/${user?.studioId}/checkout`,
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
        `http://localhost:3001/api/studios/${user?.studioId}/subscription/cancel`,
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
        `http://localhost:3001/api/studios/${user?.studioId}/subscription/reactivate`,
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

      {error && <div style={{ color: '#d32f2f', marginBottom: '20px' }}>{error}</div>}

      {/* Subscription Required Banner */}
      {needsSubscription && (
        <div style={{
          backgroundColor: '#fff3cd',
          border: '2px solid #ffc107',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '30px',
          textAlign: 'center'
        }}>
          <h2 style={{ color: '#856404', margin: '0 0 15px 0' }}>
            🔒 Subscription Required
          </h2>
          <p style={{ color: '#856404', margin: '0 0 15px 0', fontSize: '16px' }}>
            To create albums and start selling, please subscribe to one of our plans.
          </p>
          <button
            onClick={() => setShowUpgradeModal(true)}
            style={{
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              padding: '12px 30px',
              fontSize: '16px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            View Subscription Plans
          </button>
        </div>
      )}

      {/* Cancellation Warning Banner */}
      {subscription?.studio.cancellation_requested && (
        <div style={{
          backgroundColor: '#fff3cd',
          border: '2px solid #ff9800',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '30px'
        }}>
          <h3 style={{ color: '#e65100', margin: '0 0 10px 0' }}>
            ⚠️ Subscription Cancellation Scheduled
          </h3>
          <p style={{ color: '#856404', margin: '0 0 15px 0' }}>
            Your subscription will end on {subscription.studio.subscription_end 
              ? new Date(subscription.studio.subscription_end).toLocaleDateString()
              : 'the renewal date'}. 
            You will continue to have full access until then.
          </p>
          <button
            onClick={handleReactivateSubscription}
            disabled={loading}
            style={{
              backgroundColor: '#4caf50',
              color: 'white',
              border: 'none',
              padding: '10px 25px',
              fontSize: '14px',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              opacity: loading ? 0.6 : 1
            }}
          >
            {loading ? 'Processing...' : 'Reactivate Subscription'}
          </button>
        </div>
      )}

      {/* Cancellation Warning Banner */}
      {subscription?.studio.cancellation_requested && (
        <div style={{
          backgroundColor: '#fff3cd',
          border: '2px solid #ff9800',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '30px'
        }}>
          <h3 style={{ color: '#e65100', margin: '0 0 10px 0' }}>
            ⚠️ Subscription Cancellation Scheduled
          </h3>
          <p style={{ color: '#856404', margin: '0 0 15px 0' }}>
            Your subscription will end on {subscription.studio.subscription_end 
              ? new Date(subscription.studio.subscription_end).toLocaleDateString()
              : 'the renewal date'}. 
            You will continue to have full access until then.
          </p>
          <button
            onClick={handleReactivateSubscription}
            disabled={loading}
            style={{
              backgroundColor: '#4caf50',
              color: 'white',
              border: 'none',
              padding: '10px 25px',
              fontSize: '14px',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              opacity: loading ? 0.6 : 1
            }}
          >
            {loading ? 'Processing...' : 'Reactivate Subscription'}
          </button>
        </div>
      )}

      {subscription && (
        <>
          {/* Current Subscription Card */}
          <div style={{
            backgroundColor: '#f5f5f5',
            padding: '20px',
            borderRadius: '8px',
            marginBottom: '30px',
            border: isExpiringSoon ? '2px solid #ff9800' : 'none'
          }}>
            <h2>{subscription.studio.name}</h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginTop: '20px' }}>
              <div>
                <h4>Current Plan</h4>
                <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#007bff' }}>
                  {subscription.plan?.name || 'No Plan'}
                </p>
                {subscription.studio.is_free_subscription ? (
                  <p style={{ color: '#4caf50', fontWeight: 'bold' }}>FREE (No Billing)</p>
                ) : (
                  <p style={{ color: '#666' }}>
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
                    ? '#ff9800' 
                    : subscription.studio.subscription_status === 'active' ? '#4caf50' : '#f44336'
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
                backgroundColor: '#fff3cd',
                border: '1px solid #ffc107',
                borderRadius: '4px',
                color: '#856404'
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
                  style={{
                    backgroundColor: '#f44336',
                    color: 'white',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: '6px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    opacity: loading ? 0.6 : 1
                  }}
                >
                  Cancel Subscription
                </button>
              )}
            </div>
          </div>

          {/* Product Fees Info */}
          {studioFees && (
            <div style={{
              backgroundColor: '#f9f9f9',
              padding: '20px',
              borderRadius: '8px',
              marginBottom: '30px',
              border: '1px solid #e0e0e0'
            }}>
              <h3 style={{ marginTop: 0 }}>💰 Product Fees Applied</h3>
              <p style={{ color: '#666', marginBottom: '15px' }}>
                The following fee is added to each product price when customers make purchases:
              </p>
              <div style={{
                backgroundColor: 'white',
                padding: '15px',
                borderRadius: '6px',
                border: '2px solid #ff9800'
              }}>
                <p style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>
                  {studioFees.feeType === 'percentage'
                    ? `${studioFees.feeValue}% markup`
                    : `$${studioFees.feeValue.toFixed(2)} per item`
                  }
                </p>
                <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: '#666' }}>
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
                  <li key={idx} style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
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
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    padding: '20px',
                    textAlign: 'center',
                    backgroundColor: subscription.plan?.id === plan.id ? '#f0f7ff' : '#fff'
                  }}
                >
                  <h4>{plan.name}</h4>
                  <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#007bff' }}>
                    ${plan.monthlyPrice}/mo
                  </p>
                  {plan.yearlyPrice && (
                    <p style={{ fontSize: '14px', color: '#4caf50', marginTop: '-10px' }}>
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
                    <button disabled style={{
                      width: '100%',
                      padding: '10px',
                      backgroundColor: '#ccc',
                      color: '#333',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'not-allowed'
                    }}>
                      Current Plan
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setSelectedUpgradePlan(plan.id);
                        setShowUpgradeModal(true);
                      }}
                      style={{
                        width: '100%',
                        padding: '10px',
                        backgroundColor: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
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
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '8px',
            maxWidth: '400px',
            width: '90%'
          }}>
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
                  border: `2px solid ${selectedBillingCycle === 'monthly' ? '#007bff' : '#ddd'}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  backgroundColor: selectedBillingCycle === 'monthly' ? '#e3f2fd' : 'white'
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
                  border: `2px solid ${selectedBillingCycle === 'yearly' ? '#007bff' : '#ddd'}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  backgroundColor: selectedBillingCycle === 'yearly' ? '#e3f2fd' : 'white'
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
                  <div style={{ fontSize: '12px', color: '#4caf50', marginTop: '4px' }}>
                    Save ~17%
                  </div>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={handleUpgrade}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1
                }}
              >
                {loading ? 'Processing...' : 'Continue to Payment'}
              </button>
              <button
                onClick={() => setShowUpgradeModal(false)}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#ccc',
                  color: '#333',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
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
