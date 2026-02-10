import React, { useState, useEffect } from 'react';
import { ProfileConfig } from '../../types';
import { profileService } from '../../services/profileService';
import { useAuth } from '../../contexts/AuthContext';
import { SUBSCRIPTION_PLANS } from '../../services/subscriptionService';

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
        `http://localhost:3001/api/studios/${user?.studioId}/subscription`,
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
        `http://localhost:3001/api/studios/${user?.studioId}/subscription/cancel`,
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
        `http://localhost:3001/api/studios/${user?.studioId}/subscription/reactivate`,
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
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
        }
      } else {
        alert('Failed to create checkout session');
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

  if (loading) {
    return <div className="loading">Loading profile...</div>;
  }

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>👤 Profile Settings</h1>
        <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.5rem' }}>
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
                backgroundColor: '#f5f5f5',
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
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#d32f2f',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
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
          <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
            Upload a logo image to replace the "📸 Photo Lab" text in the header. Recommended: transparent PNG, max height 60px
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="ownerName">
            Owner Name <span style={{ color: '#d32f2f' }}>*</span>
          </label>
          <input
            type="text"
            id="ownerName"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            placeholder="John Smith"
            required
          />
          <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
            Your full name
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="businessName">
            Business Name <span style={{ color: '#d32f2f' }}>*</span>
          </label>
          <input
            type="text"
            id="businessName"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="PhotoLab Studio"
            required
          />
          <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
            Your business or studio name
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="email">
            Email Address <span style={{ color: '#d32f2f' }}>*</span>
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@photolab.com"
            required
          />
          <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
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
          <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
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
            backgroundColor: '#f5f5f5',
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
            <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.5rem' }}>
              View and manage your subscription plan
            </p>
          </div>

          {subscription.studio.cancellation_requested ? (
            <div style={{
              backgroundColor: '#fff3cd',
              border: '2px solid #ff9800',
              borderRadius: '8px',
              padding: '20px',
              marginBottom: '20px'
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
              {user?.role === 'studio_admin' ? (
                <button
                  onClick={handleReactivateSubscription}
                  style={{
                    backgroundColor: '#4caf50',
                    color: 'white',
                    border: 'none',
                    padding: '10px 25px',
                    fontSize: '14px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  ✓ Reactivate Subscription
                </button>
              ) : null}
            </div>
          ) : null}

          <div style={{
            backgroundColor: '#f5f5f5',
            padding: '20px',
            borderRadius: '8px',
            border: '2px solid #ddd'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '20px' }}>
              <div>
                <h4>Current Plan</h4>
                <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#007bff' }}>
                  {subscription.plan?.name || 'No Plan'}
                </p>
                {subscription.studio.is_free_subscription ? (
                  <p style={{ color: '#4caf50', fontWeight: 'bold' }}>FREE (No Billing)</p>
                ) : subscription.plan ? (
                  <p style={{ color: '#666' }}>
                    ${subscription.studio.billing_cycle === 'yearly' 
                      ? (subscription.plan.yearlyPrice || subscription.plan.monthlyPrice * 10)
                      : subscription.plan.monthlyPrice}
                    /{subscription.studio.billing_cycle === 'yearly' ? 'year' : 'month'}
                  </p>
                ) : (
                  <p style={{ color: '#999' }}>Plan info not available</p>
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
                    : 'Not set'}
                </p>
              </div>
            </div>

            <div style={{ paddingTop: '20px', borderTop: '1px solid #ddd' }}>
              <h4>Actions</h4>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {user?.role === 'studio_admin' ? (
                  <>
                    <button
                      onClick={() => setShowUpgradeModal(true)}
                      style={{
                        backgroundColor: '#007bff',
                        color: 'white',
                        border: 'none',
                        padding: '10px 20px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 'bold'
                      }}
                    >
                      {subscription.studio.subscription_status === 'active' && !subscription.studio.is_free_subscription ? 'Change Plan' : 'Subscribe'}
                    </button>
                    {subscription.studio.subscription_status === 'active' && !subscription.studio.is_free_subscription && !subscription.studio.cancellation_requested ? (
                      <button
                        onClick={handleCancelSubscription}
                        style={{
                          backgroundColor: '#f44336',
                          color: 'white',
                          border: 'none',
                          padding: '10px 20px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: 'bold'
                        }}
                      >
                        Cancel Subscription
                      </button>
                    ) : null}
                  </>
                ) : null}
                {user?.role !== 'studio_admin' ? (
                  <p style={{ color: '#999', fontSize: '14px', marginTop: '8px' }}>
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
            maxWidth: '500px',
            width: '90%',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <h2>Select Your Plan</h2>
            <p style={{ color: '#666', marginBottom: '20px' }}>
              Choose a plan to upgrade or downgrade your subscription
            </p>

            <div style={{ marginBottom: '20px', display: 'grid', gap: '15px' }}>
              {Object.entries(SUBSCRIPTION_PLANS).map(([id, plan]) => (
                <div
                  key={id}
                  onClick={() => setSelectedUpgradePlan(id)}
                  style={{
                    padding: '15px',
                    border: selectedUpgradePlan === id ? '2px solid #007bff' : '1px solid #ddd',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    backgroundColor: selectedUpgradePlan === id ? '#f0f7ff' : '#fff',
                    transition: 'all 0.2s'
                  }}
                >
                  <h4 style={{ margin: '0 0 8px 0' }}>{plan.name}</h4>
                  <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', color: '#007bff', fontSize: '18px' }}>
                    ${plan.monthlyPrice}/month
                  </p>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px' }}>
                    {plan.features.slice(0, 3).map((feature, idx) => (
                      <li key={idx} style={{ color: '#666' }}>{feature}</li>
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
                disabled={!selectedUpgradePlan || upgrading}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: selectedUpgradePlan ? '#007bff' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: selectedUpgradePlan && !upgrading ? 'pointer' : 'not-allowed',
                  fontWeight: 'bold',
                  opacity: upgrading ? 0.7 : 1
                }}
              >
                {upgrading ? 'Processing...' : 'Continue to Payment'}
              </button>
              <button
                onClick={() => setShowUpgradeModal(false)}
                disabled={upgrading}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: '#ccc',
                  color: '#333',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: upgrading ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  opacity: upgrading ? 0.7 : 1
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
};

export default AdminProfile;
