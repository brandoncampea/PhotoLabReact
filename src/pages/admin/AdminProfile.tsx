
import React, { useState, useEffect } from 'react';
import { ProfileConfig } from '../../types';
import { profileService } from '../../services/profileService';
import { useAuth } from '../../contexts/AuthContext';
import { SUBSCRIPTION_PLANS } from '../../services/subscriptionService';
import AdminLayout from '../../components/AdminLayout';

const AdminProfile: React.FC = () => {
  const { user } = useAuth();
  const [config, setConfig] = useState<ProfileConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [receiveOrderNotifications, setReceiveOrderNotifications] = useState(true);
  const [logoUrl, setLogoUrl] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [subscription, setSubscription] = useState<any>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedUpgradePlan, setSelectedUpgradePlan] = useState<string>('');
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    loadConfig();
    if (user?.studioId) {
      fetchSubscriptionInfo();
    }
  }, [user]);

  const loadConfig = async () => {
    try {
      const data = await profileService.getConfig();
      setConfig(data);
      setOwnerName(data.ownerName);
      setBusinessName(data.businessName);
      setEmail(data.email);
      setReceiveOrderNotifications(data.receiveOrderNotifications);
      setLogoUrl(data.logoUrl || '');
      setLogoPreview(data.logoUrl || '');
    } catch (error) {
      console.error('Failed to load profile config:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubscriptionInfo = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `/api/studios/${user?.studioId}/subscription`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (response.ok) {
        const data = await response.json();
        setSubscription(data);
      }
    } catch (err: any) {
      console.error('Failed to load subscription:', err);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm('Cancel subscription? You keep access until the renewal date.')) return;
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `/api/studios/${user?.studioId}/subscription/cancel`,
        { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (response.ok) {
        await fetchSubscriptionInfo();
      }
    } catch (err: any) {
      alert('Failed to cancel subscription');
    }
  };

  const handleReactivateSubscription = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `/api/studios/${user?.studioId}/subscription/reactivate`,
        { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (response.ok) {
        await fetchSubscriptionInfo();
      }
    } catch (err: any) {
      alert('Failed to reactivate subscription');
    }
  };

  const handleUpgrade = async () => {
    if (!selectedUpgradePlan) {
      alert('Please select a plan');
      return;
    }

    try {
      setUpgrading(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `/api/studios/${user?.studioId}/subscription/self-service`,
        {
          method: 'PATCH',
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
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
          return;
        }
        setShowUpgradeModal(false);
        await fetchSubscriptionInfo();
      } else {
        const errorData = await response.json().catch(() => null);
        alert(errorData?.error || 'Failed to update subscription');
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setUpgrading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // If a new logo was uploaded, use the preview URL
      const finalLogoUrl = logoFile ? logoPreview : logoUrl;
      const updatedConfig = await profileService.updateConfig({
            ownerName,
            businessName,
            email,
            receiveOrderNotifications,
            logoUrl: finalLogoUrl,
          });
      setConfig(updatedConfig);
      alert('Profile saved successfully!');
    } catch (error) {
      console.error('Failed to save profile:', error);
      alert('Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const openEditSubscriptionModal = () => {
    const currentPlan = subscription?.studio?.subscription_plan;
    const currentCycle = subscription?.studio?.billing_cycle;

    if (currentPlan && SUBSCRIPTION_PLANS[currentPlan as keyof typeof SUBSCRIPTION_PLANS]) {
      setSelectedUpgradePlan(currentPlan);
    } else {
      setSelectedUpgradePlan('');
    }

    if (currentCycle === 'monthly' || currentCycle === 'yearly') {
      setSelectedBillingCycle(currentCycle);
    } else {
      setSelectedBillingCycle('monthly');
    }

    setShowUpgradeModal(true);
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="loading">Loading profile...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <>
      <div className="page-header">
        <h1>👤 Profile Settings</h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Manage your business profile and notification preferences
        </p>
      </div>
      <div className="admin-form" style={{ maxWidth: '600px' }}>
        <div className="form-group">
          <label htmlFor="logo">Site Logo</label>
          <div style={{ marginBottom: '1rem' }}>
            {logoPreview && (
              <div style={{
                marginBottom: '1rem',
                padding: '1rem',
                backgroundColor: 'var(--bg-tertiary)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem'
              }}>
                <img
                  src={logoPreview}
                  alt="Logo preview"
                  style={{
                    maxWidth: '200px',
                    maxHeight: '60px',
                    objectFit: 'contain'
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setLogoFile(null);
                    setLogoPreview('');
                    setLogoUrl('');
                  }}
                  className="btn btn-danger btn-sm"
                >
                  Remove Logo
                </button>
              </div>
            )}
            <input
              type="file"
              id="logo"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setLogoFile(file);
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    setLogoPreview(reader.result as string);
                  };
                  reader.readAsDataURL(file);
                }
              }}
            />
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Upload a logo image to replace the "📸 Photo Lab" text in the header. Recommended: transparent PNG, max height 60px
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="ownerName">
            Owner Name <span style={{ color: 'var(--error-color)' }}>*</span>
          </label>
          <input
            type="text"
            id="ownerName"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            placeholder="John Smith"
            required
          />
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Your full name
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="businessName">
            Business Name <span style={{ color: 'var(--error-color)' }}>*</span>
          </label>
          <input
            type="text"
            id="businessName"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="PhotoLab Studio"
            required
          />
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Your business or studio name
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="email">
            Email Address <span style={{ color: 'var(--error-color)' }}>*</span>
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@photolab.com"
            required
          />
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Primary contact email for your business
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="receiveOrderNotifications">
            <input
              type="checkbox"
              id="receiveOrderNotifications"
              checked={receiveOrderNotifications}
              onChange={(e) => setReceiveOrderNotifications(e.target.checked)}
              style={{ marginRight: '0.5rem' }}
            />
            Receive Order Notifications
          </label>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Get email notifications when new orders are placed
          </p>
        </div>

        <div className="form-actions">
          <button 
            onClick={handleSave} 
            className="btn btn-primary"
            disabled={saving || !ownerName || !businessName || !email}
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>

        {config && (
          <div style={{
            marginTop: '2rem',
            padding: '1rem',
            backgroundColor: 'var(--bg-tertiary)',
            borderRadius: '8px',
            fontSize: '0.9rem'
          }}>
            <h4 style={{ marginTop: 0 }}>Current Configuration:</h4>
            <ul style={{ marginBottom: 0, paddingLeft: '1.5rem' }}>
              <li>Owner: <strong>{ownerName}</strong></li>
              <li>Business: <strong>{businessName}</strong></li>
              <li>Email: <strong>{email}</strong></li>
              <li>Order Notifications: <strong>{receiveOrderNotifications ? 'Enabled ✓' : 'Disabled'}</strong></li>
            </ul>
          </div>
        )}
      </div>

      {/* Subscription Section */}
      {user?.studioId && subscription ? (
        <div style={{ marginTop: '2rem' }}>
          <div className="page-header">
            <h2>📋 Subscription Management</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              View and manage your subscription plan
            </p>
          </div>

          {subscription.studio.cancellation_requested ? (
            <div style={{
              backgroundColor: 'rgba(251, 191, 36, 0.12)',
              border: '2px solid rgba(251, 191, 36, 0.5)',
              borderRadius: '8px',
              padding: '20px',
              marginBottom: '20px'
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
              {user?.role === 'studio_admin' ? (
                <button
                  onClick={handleReactivateSubscription}
                  className="btn btn-success"
                  style={{ fontSize: '14px', fontWeight: 'bold' }}
                >
                  ✓ Reactivate Subscription
                </button>
              ) : null}
            </div>
          ) : null}

          <div style={{
            backgroundColor: 'var(--bg-tertiary)',
            padding: '20px',
            borderRadius: '8px',
            border: '1px solid var(--border-color)'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '20px' }}>
              <div>
                <h4>Current Plan</h4>
                <p style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                  {subscription.plan?.name || 'No Plan'}
                </p>
                {subscription.studio.is_free_subscription ? (
                  <p style={{ color: '#86efac', fontWeight: 'bold' }}>FREE (No Billing)</p>
                ) : subscription.plan ? (
                  <p style={{ color: 'var(--text-secondary)' }}>
                    ${subscription.studio.billing_cycle === 'yearly' 
                      ? (subscription.plan.yearlyPrice || subscription.plan.monthlyPrice * 10)
                      : subscription.plan.monthlyPrice}
                    /{subscription.studio.billing_cycle === 'yearly' ? 'year' : 'month'}
                  </p>
                ) : (
                  <p style={{ color: 'var(--text-secondary)' }}>Plan info not available</p>
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
                    : 'Not set'}
                </p>
              </div>
            </div>

            <div style={{ paddingTop: '20px', borderTop: '1px solid var(--border-color)' }}>
              <h4>Actions</h4>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {user?.role === 'studio_admin' ? (
                  <>
                    <button
                      onClick={openEditSubscriptionModal}
                      className="btn btn-primary"
                      style={{ fontSize: '14px', fontWeight: 'bold' }}
                    >
                      {subscription.studio.subscription_status === 'active' && !subscription.studio.is_free_subscription ? 'Edit Subscription' : 'Subscribe'}
                    </button>
                    {subscription.studio.subscription_status === 'active' && !subscription.studio.is_free_subscription && !subscription.studio.cancellation_requested ? (
                      <button
                        onClick={handleCancelSubscription}
                        className="btn btn-danger"
                        style={{ fontSize: '14px', fontWeight: 'bold' }}
                      >
                        Cancel Subscription
                      </button>
                    ) : null}
                  </>
                ) : null}
                {user?.role !== 'studio_admin' ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '8px' }}>
                    Only studio admins can manage subscription settings
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="modal-overlay">
          <div className="modal-content admin-modal-content" style={{ padding: '30px', maxWidth: '500px' }}>
            <h2>Select Your Plan</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Choose a plan and billing cycle for your subscription
            </p>

            <div style={{ marginBottom: '20px', display: 'grid', gap: '15px' }}>
              {Object.entries(SUBSCRIPTION_PLANS).map(([id, plan]) => (
                <div
                  key={id}
                  onClick={() => setSelectedUpgradePlan(id)}
                  style={{
                    padding: '15px',
                    border: selectedUpgradePlan === id ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    backgroundColor: selectedUpgradePlan === id ? 'rgba(124, 92, 255, 0.12)' : 'var(--bg-primary)',
                    transition: 'all 0.2s'
                  }}
                >
                  <h4 style={{ margin: '0 0 8px 0' }}>{plan.name}</h4>
                  <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', color: 'var(--primary-color)', fontSize: '18px' }}>
                    ${plan.monthlyPrice}/month
                  </p>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px' }}>
                    {plan.features.slice(0, 3).map((feature, idx) => (
                      <li key={idx} style={{ color: 'var(--text-secondary)' }}>{feature}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

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
                disabled={!selectedUpgradePlan || upgrading}
                className="btn btn-primary"
                style={{ flex: 1, fontWeight: 'bold', opacity: upgrading ? 0.7 : 1 }}
              >
                {upgrading ? 'Saving...' : 'Save Subscription'}
              </button>
              <button
                onClick={() => setShowUpgradeModal(false)}
                disabled={upgrading}
                className="btn btn-secondary"
                style={{ flex: 1, fontWeight: 'bold', opacity: upgrading ? 0.7 : 1 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      </>
    </AdminLayout>
  );
};

export default AdminProfile;
