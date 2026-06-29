import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import api from '../../services/api';

interface PlanDetails {
  id: number;
  monthlyPrice: number;
  yearlyPrice: number | null;
  features: string[];
  description: string | null;
  stripeMonthlyPriceId: string | null;
  stripeYearlyPriceId: string | null;
}

interface SubscriptionStatus {
  studioId: number;
  studioName: string;
  subscriptionPlan: string | null;
  subscriptionStatus: string;
  billingCycle: string;
  subscriptionStart: string | null;
  subscriptionEnd: string | null;
  hasStripeCustomer: boolean;
  hasStripeSubscription: boolean;
  isFreeSubscription: boolean;
  cancellationRequested: boolean;
  cancellationDate: string | null;
  planDetails: PlanDetails | null;
}

interface Plan {
  id: number;
  name: string;
  monthly_price: number;
  yearly_price: number | null;
  features: string[];
  stripe_monthly_price_id: string | null;
  stripe_yearly_price_id: string | null;
}

const cardStyle: React.CSSProperties = {
  background: 'rgba(20,20,35,0.8)',
  border: '1px solid rgba(102,102,204,0.3)',
  borderRadius: 12,
  padding: 24,
  marginBottom: 20,
};

const statusColors: Record<string, string> = {
  active: '#4ade80',
  inactive: '#a1a1aa',
  past_due: '#f59e0b',
  canceled: '#ef4444',
  paused: '#60a5fa',
};

function statusLabel(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ') : 'Inactive';
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function savingsPct(monthly: number, yearly: number): number {
  const annualAtMonthly = monthly * 12;
  if (annualAtMonthly === 0) return 0;
  return Math.round(((annualAtMonthly - yearly) / annualAtMonthly) * 100);
}

const StudioBilling: React.FC = () => {
  const location = useLocation();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reactivating, setReactivating] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('subscribed') === '1') setToast('Your subscription is now active!');
    if (params.get('cancelled') === '1') setToast('Checkout was cancelled — your subscription was not changed.');
  }, [location.search]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  useEffect(() => {
    Promise.all([
      api.get('/stripe/subscription-status'),
      api.get('/subscription-plans'),
    ])
      .then(([sRes, pRes]) => {
        setStatus(sRes.data);
        const activePlans = (pRes.data as Plan[]).filter(p => p.stripe_monthly_price_id || p.stripe_yearly_price_id);
        setPlans(activePlans);
        if (sRes.data.billingCycle) setBillingCycle(sRes.data.billingCycle);
      })
      .catch(err => setError(err.response?.data?.error || 'Failed to load billing info'))
      .finally(() => setLoading(false));
  }, []);

  const handleSubscribe = async () => {
    if (!selectedPlanId) return;
    setCheckingOut(true);
    setError(null);
    try {
      const res = await api.post('/stripe/create-subscription-checkout', {
        planId: selectedPlanId,
        billingCycle,
      });
      window.location.href = res.data.url;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start checkout');
      setCheckingOut(false);
    }
  };

  const handleManageBilling = async () => {
    setOpeningPortal(true);
    setError(null);
    try {
      const res = await api.post('/stripe/billing-portal', {});
      window.location.href = res.data.url;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to open billing portal');
      setOpeningPortal(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!status?.studioId) return;
    setCancelling(true);
    setError(null);
    try {
      await api.post(`/studios/${status.studioId}/subscription/cancel`);
      const sRes = await api.get('/stripe/subscription-status');
      setStatus(sRes.data);
      setToast('Your subscription has been cancelled and will end on ' + formatDate(sRes.data.subscriptionEnd) + '.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to cancel subscription');
    } finally {
      setCancelling(false);
      setShowCancelModal(false);
    }
  };

  const handleReactivate = async () => {
    if (!status?.studioId) return;
    setReactivating(true);
    setError(null);
    try {
      await api.post(`/studios/${status.studioId}/subscription/reactivate`);
      const sRes = await api.get('/stripe/subscription-status');
      setStatus(sRes.data);
      setToast('Your subscription has been reactivated and will continue to renew.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reactivate subscription');
    } finally {
      setReactivating(false);
    }
  };

  const isActive = status?.subscriptionStatus === 'active';
  const isPastDue = status?.subscriptionStatus === 'past_due';

  return (
    <AdminLayout>
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          padding: '40px 32px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: 36 }}>
            <h1
              style={{
                margin: 0,
                fontSize: 32,
                fontWeight: 800,
                background: 'linear-gradient(90deg, #a78bfa, #7c5cff)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Billing &amp; Subscription
            </h1>
            <p style={{ color: '#a1a1aa', marginTop: 8, fontSize: 15 }}>
              Manage your studio subscription and billing.
            </p>
          </div>

          {toast && (
            <div
              style={{
                background: 'rgba(74,222,128,0.15)',
                border: '1px solid rgba(74,222,128,0.4)',
                color: '#86efac',
                borderRadius: 8,
                padding: '12px 16px',
                marginBottom: 20,
                fontSize: 14,
              }}
            >
              {toast}
            </div>
          )}

          {error && (
            <div
              style={{
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.4)',
                color: '#fca5a5',
                borderRadius: 8,
                padding: '12px 16px',
                marginBottom: 20,
                fontSize: 14,
              }}
            >
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ color: '#a1a1aa', textAlign: 'center', padding: 60 }}>Loading billing info...</div>
          ) : (
            <>
              {/* Current Status */}
              <div style={cardStyle}>
                <h2 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 700, color: '#fff' }}>
                  Current Subscription
                </h2>
                <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ color: '#a1a1aa', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Plan</div>
                    <div style={{ color: '#e4e4e7', fontWeight: 600, fontSize: 16 }}>
                      {status?.subscriptionPlan || 'None'}
                      {status?.isFreeSubscription && <span style={{ marginLeft: 8, background: 'rgba(74,222,128,0.15)', color: '#4ade80', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12 }}>Free</span>}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#a1a1aa', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Status</div>
                    <div
                      style={{
                        color: statusColors[status?.subscriptionStatus || 'inactive'] || '#a1a1aa',
                        fontWeight: 700,
                        fontSize: 15,
                      }}
                    >
                      {statusLabel(status?.subscriptionStatus || 'inactive')}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#a1a1aa', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Billing Cycle</div>
                    <div style={{ color: '#e4e4e7', fontWeight: 600, fontSize: 15 }}>
                      {status?.billingCycle === 'yearly' ? 'Annual' : 'Monthly'}
                    </div>
                  </div>
                  {status?.subscriptionEnd && (
                    <div>
                      <div style={{ color: '#a1a1aa', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                        {status?.cancellationRequested ? 'Ends On' : 'Renews On'}
                      </div>
                      <div style={{ color: '#e4e4e7', fontWeight: 600, fontSize: 15 }}>
                        {formatDate(status.subscriptionEnd)}
                      </div>
                    </div>
                  )}
                </div>

                {isPastDue && (
                  <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, color: '#fcd34d', fontSize: 13 }}>
                    Your last payment failed. Update your payment method to keep your studio active.
                  </div>
                )}

                {status?.cancellationRequested && (
                  <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#fca5a5', fontSize: 13 }}>
                    Cancellation requested — your subscription will end on {formatDate(status.cancellationDate)}.
                  </div>
                )}

                {(isActive || isPastDue) && status?.hasStripeCustomer && (
                  <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                    <button
                      onClick={handleManageBilling}
                      disabled={openingPortal}
                      style={{
                        background: openingPortal ? 'rgba(102,102,204,0.3)' : 'rgba(102,102,204,0.2)',
                        border: '1px solid rgba(102,102,204,0.5)',
                        color: '#cfd5ff',
                        fontWeight: 700,
                        fontSize: 14,
                        borderRadius: 8,
                        padding: '10px 22px',
                        cursor: openingPortal ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {openingPortal ? 'Opening portal...' : 'Manage Billing & Invoices'}
                    </button>

                    {isActive && !status.cancellationRequested && (
                      <button
                        onClick={() => setShowCancelModal(true)}
                        style={{
                          background: 'transparent',
                          border: '1px solid rgba(239,68,68,0.4)',
                          color: '#f87171',
                          fontWeight: 600,
                          fontSize: 14,
                          borderRadius: 8,
                          padding: '10px 22px',
                          cursor: 'pointer',
                        }}
                      >
                        Cancel Subscription
                      </button>
                    )}

                    {status.cancellationRequested && (
                      <button
                        onClick={handleReactivate}
                        disabled={reactivating}
                        style={{
                          background: reactivating ? 'rgba(74,222,128,0.1)' : 'rgba(74,222,128,0.15)',
                          border: '1px solid rgba(74,222,128,0.4)',
                          color: '#4ade80',
                          fontWeight: 700,
                          fontSize: 14,
                          borderRadius: 8,
                          padding: '10px 22px',
                          cursor: reactivating ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {reactivating ? 'Reactivating...' : 'Undo Cancellation'}
                      </button>
                    )}
                  </div>
                )}
                {(isActive || isPastDue) && status?.hasStripeCustomer && (
                  <p style={{ color: '#52525b', fontSize: 12, marginTop: 8 }}>
                    Update payment method and download invoices via the billing portal.
                  </p>
                )}
              </div>

              {/* Plan Selector — shown when not active */}
              {!isActive && (
                <div style={cardStyle}>
                  <h2 style={{ margin: '0 0 8px 0', fontSize: 18, fontWeight: 700, color: '#fff' }}>
                    {status?.hasStripeSubscription ? 'Change Plan' : 'Subscribe'}
                  </h2>
                  <p style={{ color: '#a1a1aa', fontSize: 14, margin: '0 0 20px 0' }}>
                    Choose a plan and billing cycle to get started.
                  </p>

                  {/* Billing cycle toggle */}
                  <div style={{ display: 'flex', gap: 0, marginBottom: 24, background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid rgba(102,102,204,0.2)', padding: 4, width: 'fit-content' }}>
                    {(['monthly', 'yearly'] as const).map(cycle => (
                      <button
                        key={cycle}
                        onClick={() => setBillingCycle(cycle)}
                        style={{
                          padding: '8px 20px',
                          borderRadius: 7,
                          border: 'none',
                          background: billingCycle === cycle ? '#7c5cff' : 'transparent',
                          color: billingCycle === cycle ? '#fff' : '#a1a1aa',
                          fontWeight: 700,
                          fontSize: 14,
                          cursor: 'pointer',
                          transition: 'background 0.15s, color 0.15s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        {cycle === 'monthly' ? 'Monthly' : 'Annual'}
                        {cycle === 'yearly' && (
                          <span style={{ background: 'rgba(74,222,128,0.2)', color: '#4ade80', fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 10 }}>
                            Save up to 20%
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {plans.length === 0 ? (
                    <div style={{ color: '#a1a1aa', fontSize: 14 }}>No plans available. Contact support.</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
                      {plans.map(plan => {
                        const price = billingCycle === 'yearly' && plan.yearly_price != null ? plan.yearly_price : plan.monthly_price;
                        const monthlyEquiv = billingCycle === 'yearly' && plan.yearly_price != null ? plan.yearly_price / 12 : plan.monthly_price;
                        const savings = plan.yearly_price != null ? savingsPct(plan.monthly_price, plan.yearly_price) : 0;
                        const isSelected = selectedPlanId === plan.id;
                        const hasPrice = billingCycle === 'yearly' ? !!plan.stripe_yearly_price_id : !!plan.stripe_monthly_price_id;

                        return (
                          <div
                            key={plan.id}
                            onClick={() => hasPrice && setSelectedPlanId(plan.id)}
                            style={{
                              padding: 18,
                              border: isSelected ? '2px solid #7c5cff' : '2px solid rgba(102,102,204,0.3)',
                              borderRadius: 10,
                              background: isSelected ? 'rgba(124,92,255,0.12)' : 'rgba(255,255,255,0.02)',
                              cursor: hasPrice ? 'pointer' : 'default',
                              opacity: hasPrice ? 1 : 0.45,
                              transition: 'border-color 0.15s, background 0.15s',
                              boxShadow: isSelected ? '0 0 0 3px rgba(124,92,255,0.18)' : 'none',
                            }}
                          >
                            <div style={{ fontWeight: 700, fontSize: 16, color: '#fff', marginBottom: 4 }}>{plan.name}</div>
                            <div style={{ fontWeight: 800, fontSize: 22, color: '#a78bfa', marginBottom: 2 }}>
                              ${billingCycle === 'yearly' && plan.yearly_price != null
                                ? (plan.yearly_price / 12).toFixed(2)
                                : plan.monthly_price.toFixed(2)}
                              <span style={{ fontSize: 14, fontWeight: 500, color: '#a1a1aa' }}>/mo</span>
                            </div>
                            {billingCycle === 'yearly' && plan.yearly_price != null && (
                              <div style={{ fontSize: 12, color: '#a1a1aa', marginBottom: 6 }}>
                                ${plan.yearly_price.toFixed(2)}/yr
                                {savings > 0 && (
                                  <span style={{ marginLeft: 6, color: '#4ade80', fontWeight: 700 }}>Save {savings}%</span>
                                )}
                              </div>
                            )}
                            {!hasPrice && (
                              <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>Not available for {billingCycle} billing</div>
                            )}
                            {plan.features.slice(0, 3).map((f, i) => (
                              <div key={i} style={{ fontSize: 12, color: '#71717a', marginTop: 3 }}>✓ {f}</div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <button
                    onClick={handleSubscribe}
                    disabled={!selectedPlanId || checkingOut}
                    style={{
                      background: !selectedPlanId || checkingOut ? 'rgba(124,92,255,0.4)' : '#7c5cff',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: 15,
                      borderRadius: 8,
                      padding: '12px 32px',
                      border: 'none',
                      cursor: !selectedPlanId || checkingOut ? 'not-allowed' : 'pointer',
                      transition: 'background 0.2s',
                    }}
                  >
                    {checkingOut ? 'Redirecting to checkout...' : 'Subscribe Now'}
                  </button>
                  <p style={{ color: '#52525b', fontSize: 12, marginTop: 10 }}>
                    You'll be redirected to Stripe to securely enter your payment info.
                  </p>
                </div>
              )}

              {/* Plan details for active subscription */}
              {isActive && status?.planDetails && (
                <div style={cardStyle}>
                  <h2 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 700, color: '#fff' }}>Plan Details</h2>
                  <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ color: '#a1a1aa', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Monthly Rate</div>
                      <div style={{ color: '#a78bfa', fontWeight: 800, fontSize: 22 }}>
                        ${status.planDetails.monthlyPrice.toFixed(2)}<span style={{ fontSize: 13, color: '#a1a1aa', fontWeight: 500 }}>/mo</span>
                      </div>
                    </div>
                    {status.planDetails.yearlyPrice != null && (
                      <div>
                        <div style={{ color: '#a1a1aa', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Annual Rate</div>
                        <div style={{ color: '#a78bfa', fontWeight: 800, fontSize: 22 }}>
                          ${status.planDetails.yearlyPrice.toFixed(2)}<span style={{ fontSize: 13, color: '#a1a1aa', fontWeight: 500 }}>/yr</span>
                        </div>
                        <div style={{ color: '#4ade80', fontSize: 12, fontWeight: 700, marginTop: 2 }}>
                          Save {savingsPct(status.planDetails.monthlyPrice, status.planDetails.yearlyPrice)}%
                        </div>
                      </div>
                    )}
                    {status.planDetails.features.length > 0 && (
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ color: '#a1a1aa', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Includes</div>
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {status.planDetails.features.map((f, i) => (
                            <li key={i} style={{ color: '#e4e4e7', fontSize: 13, marginBottom: 3 }}>{f}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {showCancelModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
          onClick={() => !cancelling && setShowCancelModal(false)}
        >
          <div
            style={{
              background: '#1a1a2e', border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: 12, padding: 32, maxWidth: 440, width: '90%',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 12px 0', fontSize: 18, fontWeight: 700, color: '#fff' }}>
              Cancel Subscription?
            </h3>
            <p style={{ color: '#a1a1aa', fontSize: 14, margin: '0 0 8px 0' }}>
              Your subscription will remain active until the end of your current billing period
              {status?.subscriptionEnd ? ` (${formatDate(status.subscriptionEnd)})` : ''}.
              After that date, your studio will be deactivated.
            </p>
            <p style={{ color: '#71717a', fontSize: 13, margin: '0 0 24px 0' }}>
              You can undo this at any time before your billing period ends.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCancelModal(false)}
                disabled={cancelling}
                style={{
                  background: 'transparent', border: '1px solid rgba(113,113,122,0.4)',
                  color: '#a1a1aa', fontWeight: 600, fontSize: 14,
                  borderRadius: 8, padding: '9px 20px', cursor: 'pointer',
                }}
              >
                Keep Subscription
              </button>
              <button
                onClick={handleCancelSubscription}
                disabled={cancelling}
                style={{
                  background: cancelling ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.15)',
                  border: '1px solid rgba(239,68,68,0.5)',
                  color: '#f87171', fontWeight: 700, fontSize: 14,
                  borderRadius: 8, padding: '9px 20px',
                  cursor: cancelling ? 'not-allowed' : 'pointer',
                }}
              >
                {cancelling ? 'Cancelling...' : 'Yes, Cancel Subscription'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default StudioBilling;
