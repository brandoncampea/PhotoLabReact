
import React, { useState, useEffect } from 'react';
import { ProfileConfig, LandingPage } from '../../types';
import { profileService } from '../../services/profileService';
import { watermarkService } from '../../services/watermarkService';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { getAvailableTimezones, getBrowserTimezone, setStudioTimezone, formatDateInStudioTimezone } from '../../utils/studioDateTime';
import AdminLayout from '../../components/AdminLayout';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

const card: React.CSSProperties = {
  background: '#23232a',
  border: '1px solid #3a3656',
  borderRadius: 18,
  boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
  padding: '2rem',
  marginBottom: '1.5rem',
};

const sectionTitle: React.CSSProperties = {
  margin: '0 0 0.25rem 0',
  fontSize: '1.5rem',
  fontWeight: 800,
  background: 'linear-gradient(90deg, #a78bfa 0%, #6366f1 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
};

const sectionSubtitle: React.CSSProperties = {
  color: '#a1a1aa',
  fontSize: '0.92rem',
  margin: '0 0 1.5rem 0',
};

const fieldGroup: React.CSSProperties = {
  marginBottom: '1.1rem',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 5,
  fontWeight: 600,
  color: '#bdbdbd',
  fontSize: '0.9rem',
};

const helpText: React.CSSProperties = {
  fontSize: '0.82rem',
  color: '#6b6b80',
  marginTop: '0.25rem',
};

const divider: React.CSSProperties = {
  borderTop: '1px solid #3a3656',
  margin: '1.5rem 0',
};

const statLabel: React.CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  color: '#6b6b80',
  marginBottom: 4,
};

interface DbPlan {
  id: number;
  name: string;
  monthly_price: number;
  yearly_price: number | null;
  stripe_monthly_price_id: string | null;
  stripe_yearly_price_id: string | null;
  features: string[];
}

interface StripeStatus {
  hasStripeCustomer: boolean;
  hasStripeSubscription: boolean;
  subscriptionStatus: string;
}

function planSavingsPct(monthly: number, yearly: number): number {
  const annualAtMonthly = monthly * 12;
  if (annualAtMonthly === 0) return 0;
  return Math.round(((annualAtMonthly - yearly) / annualAtMonthly) * 100);
}

const AdminProfile: React.FC = () => {
  const { user } = useAuth();
  const viewAsStudioId = Number(localStorage.getItem('viewAsStudioId') || '0');
  const effectiveStudioId = (user?.role === 'super_admin' && viewAsStudioId > 0) ? viewAsStudioId : user?.studioId;
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
  const [instagramUrl, setInstagramUrl] = useState('');
  const [facebookUrl, setFacebookUrl] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [timezone, setTimezoneValue] = useState(getBrowserTimezone());
  const [subscription, setSubscription] = useState<any>(null);
  const [watermarkUrl, setWatermarkUrl] = useState<string>('');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedUpgradePlan, setSelectedUpgradePlan] = useState<number | null>(null);
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [upgrading, setUpgrading] = useState(false);
  const [landingPage, setLandingPage] = useState<LandingPage | null>(null);
  const [landingPageHtml, setLandingPageHtml] = useState('');
  const [showLandingPageEditor, setShowLandingPageEditor] = useState(false);
  const [savingLandingPage, setSavingLandingPage] = useState(false);
  const [brandColor, setBrandColor] = useState('#7b61ff');
  const [customEmailMessage, setCustomEmailMessage] = useState('');
  const [studioPublicSlug, setStudioPublicSlug] = useState('');
  const [dbPlans, setDbPlans] = useState<DbPlan[]>([]);
  const [stripeStatus, setStripeStatus] = useState<StripeStatus | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    loadConfig();
    if (effectiveStudioId) {
      fetchSubscriptionInfo();
      fetchWatermark(effectiveStudioId);
      fetchLandingPage();
      fetchStudioPublicSlug(effectiveStudioId);
      fetchDbPlans();
      fetchStripeStatus();
    }
  }, [user]);

  const fetchStudioPublicSlug = async (studioId: number | undefined) => {
    if (!studioId) return;
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `/api/studios/${studioId}/public-link`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (!response.ok) return;
      const data = await response.json();
      setStudioPublicSlug(data?.slug || '');
    } catch (error) {
      console.error('Failed to load studio public slug:', error);
    }
  };

  const fetchWatermark = async (studioId: number | undefined) => {
    if (!studioId) return;
    try {
      const watermark = await watermarkService.getDefaultWatermark(studioId);
      setWatermarkUrl(watermark?.imageUrl || '');
    } catch (e) {
      setWatermarkUrl('');
    }
  };

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
      setInstagramUrl(data.instagramUrl || '');
      setFacebookUrl(data.facebookUrl || '');
      setBrandColor((data as any).brandColor || '#7b61ff');
      setCustomEmailMessage((data as any).customEmailMessage || '');
      setCustomDomain(data.customDomain || '');
      setTimezoneValue(data.timezone || getBrowserTimezone());
      setStudioTimezone(data.timezone || getBrowserTimezone());
    } catch (error) {
      console.error('Failed to load profile config:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDbPlans = async () => {
    try {
      const res = await api.get('/subscription-plans');
      const plans = (res.data || []) as DbPlan[];
      setDbPlans(plans.filter(p => p.stripe_monthly_price_id || p.stripe_yearly_price_id));
    } catch { /* non-critical */ }
  };

  const fetchStripeStatus = async () => {
    try {
      const res = await api.get('/stripe/subscription-status');
      setStripeStatus({
        hasStripeCustomer: res.data.hasStripeCustomer,
        hasStripeSubscription: res.data.hasStripeSubscription,
        subscriptionStatus: res.data.subscriptionStatus,
      });
    } catch { /* non-critical */ }
  };

  const fetchSubscriptionInfo = async () => {
    if (!effectiveStudioId) return;
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `/api/studios/${effectiveStudioId}/subscription`,
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

  const fetchLandingPage = async () => {
    try {
      const data = await profileService.getLandingPage();
      setLandingPage(data);
      setLandingPageHtml(data.htmlContent || '');
    } catch (error) {
      console.error('Failed to load landing page:', error);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm('Cancel subscription? You keep access until the renewal date.')) return;
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `/api/studios/${effectiveStudioId}/subscription/cancel`,
        { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (response.ok) await fetchSubscriptionInfo();
    } catch (err: any) {
      alert('Failed to cancel subscription');
    }
  };

  const handleReactivateSubscription = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `/api/studios/${effectiveStudioId}/subscription/reactivate`,
        { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (response.ok) await fetchSubscriptionInfo();
    } catch (err: any) {
      alert('Failed to reactivate subscription');
    }
  };

  const handleUpgrade = async () => {
    if (!selectedUpgradePlan) { alert('Please select a plan'); return; }
    try {
      setUpgrading(true);
      // Paid Stripe subscribers: send to portal to manage plan & billing changes
      if (stripeStatus?.hasStripeCustomer && stripeStatus?.hasStripeSubscription) {
        await handleOpenPortal();
        return;
      }
      // New subscription or free → Stripe checkout
      const res = await api.post('/stripe/create-subscription-checkout', {
        planId: selectedUpgradePlan,
        billingCycle: selectedBillingCycle,
      });
      window.location.href = res.data.url;
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to start checkout');
    } finally {
      setUpgrading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let finalLogoUrl = logoUrl;
      if (logoFile) {
        try {
          const uploadResult = await profileService.uploadLogo(logoFile, effectiveStudioId);
          finalLogoUrl = uploadResult.logoUrl;
          setLogoFile(null);
        } catch (uploadError) {
          console.error('Logo upload failed:', uploadError);
          alert('Failed to upload logo');
          setSaving(false);
          return;
        }
      }
      const updatedConfig = await profileService.updateConfig({
        ownerName, businessName, email, receiveOrderNotifications,
        logoUrl: finalLogoUrl, instagramUrl, facebookUrl, customDomain, timezone,
        brandColor, customEmailMessage,
      } as any);
      setConfig(updatedConfig);
      setLogoUrl(finalLogoUrl);
      setLogoPreview(finalLogoUrl);
      setTimezoneValue(updatedConfig?.timezone || timezone);
      setStudioTimezone(updatedConfig?.timezone || timezone);
      window.dispatchEvent(new Event('studio-brand-updated'));
      alert('Profile saved successfully!');
    } catch (error) {
      console.error('Failed to save profile:', error);
      alert('Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const openEditSubscriptionModal = () => {
    const currentPlanName = subscription?.studio?.subscription_plan;
    const currentCycle = subscription?.studio?.billing_cycle;
    const match = dbPlans.find(p => p.name.toLowerCase() === (currentPlanName || '').toLowerCase());
    setSelectedUpgradePlan(match ? match.id : null);
    setSelectedBillingCycle(currentCycle === 'monthly' || currentCycle === 'yearly' ? currentCycle : 'monthly');
    setShowUpgradeModal(true);
  };

  const handleOpenPortal = async () => {
    try {
      setPortalLoading(true);
      const res = await api.post('/stripe/billing-portal', {});
      window.location.href = res.data.url;
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to open billing portal');
      setPortalLoading(false);
    }
  };

  const handleSaveLandingPage = async () => {
    setSavingLandingPage(true);
    try {
      const updated = await profileService.updateLandingPage(landingPageHtml);
      setLandingPage(updated);
      setShowLandingPageEditor(false);
      alert('Landing page saved successfully!');
    } catch (error) {
      console.error('Failed to save landing page:', error);
      alert('Failed to save landing page');
    } finally {
      setSavingLandingPage(false);
    }
  };

  const handleResetLandingPage = async () => {
    if (!confirm('Reset landing page to default? This cannot be undone.')) return;
    setSavingLandingPage(true);
    try {
      const reset = await profileService.resetLandingPage();
      setLandingPage(reset);
      setLandingPageHtml(reset.htmlContent || '');
      setShowLandingPageEditor(false);
      alert('Landing page reset to default!');
    } catch (error) {
      console.error('Failed to reset landing page:', error);
      alert('Failed to reset landing page');
    } finally {
      setSavingLandingPage(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div style={{ minHeight: '100vh', background: '#181a1b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a1a1aa' }}>
          Loading profile...
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div style={{ minHeight: '100vh', background: '#181a1b', padding: '2.5rem 1.5rem 4rem' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>

          {/* Page heading */}
          <div style={{ marginBottom: '2rem' }}>
            <h1 style={sectionTitle}>Profile Settings</h1>
            <p style={sectionSubtitle}>Manage your business profile and notification preferences</p>
          </div>

          {/* Branding card */}
          <div style={card}>
            <h2 style={{ ...sectionTitle, fontSize: '1.15rem', marginBottom: '0.2rem' }}>Branding</h2>
            <p style={{ ...sectionSubtitle, marginBottom: '1.25rem' }}>Your logo and watermark shown to customers</p>

            <div style={fieldGroup}>
              <label style={labelStyle}>Watermark</label>
              {watermarkUrl ? (
                <img
                  src={watermarkUrl}
                  alt="Watermark preview"
                  style={{ maxWidth: 200, maxHeight: 60, objectFit: 'contain', border: '1px solid #3a3656', borderRadius: 6, background: '#fff', padding: 4 }}
                />
              ) : (
                <span style={{ color: '#6b6b80', fontSize: '0.9rem' }}>No watermark saved</span>
              )}
            </div>

            <div style={divider} />

            <div style={fieldGroup}>
              <label style={labelStyle}>Site Logo</label>
              {logoPreview && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem', padding: '0.75rem 1rem', background: '#29293a', borderRadius: 10, border: '1px solid #3a3656' }}>
                  <img src={logoPreview} alt="Logo preview" style={{ maxWidth: 200, maxHeight: 60, objectFit: 'contain' }} />
                  <button
                    type="button"
                    onClick={() => { setLogoFile(null); setLogoPreview(''); setLogoUrl(''); }}
                    className="btn btn-danger btn-sm"
                  >
                    Remove
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
                    reader.onloadend = () => setLogoPreview(reader.result as string);
                    reader.readAsDataURL(file);
                  }
                }}
              />
              <p style={helpText}>Transparent PNG recommended, max height 60px. Replaces the "Photo Lab" text in the header.</p>
            </div>
          </div>

          {/* Business info card */}
          <div style={card}>
            <h2 style={{ ...sectionTitle, fontSize: '1.15rem', marginBottom: '0.2rem' }}>Business Info</h2>
            <p style={{ ...sectionSubtitle, marginBottom: '1.25rem' }}>Your studio's public-facing details</p>

            <div style={fieldGroup}>
              <label htmlFor="ownerName" style={labelStyle}>
                Owner Name <span style={{ color: '#ff6b6b' }}>*</span>
              </label>
              <input type="text" id="ownerName" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="John Smith" required />
            </div>

            <div style={fieldGroup}>
              <label htmlFor="businessName" style={labelStyle}>
                Business Name <span style={{ color: '#ff6b6b' }}>*</span>
              </label>
              <input type="text" id="businessName" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="PhotoLab Studio" required />
            </div>

            <div style={fieldGroup}>
              <label htmlFor="email" style={labelStyle}>
                Email Address <span style={{ color: '#ff6b6b' }}>*</span>
              </label>
              <input type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@photolab.com" required />
              <p style={helpText}>Primary contact email for your business</p>
            </div>

            <div style={fieldGroup}>
              <label htmlFor="timezone" style={labelStyle}>Timezone</label>
              <select id="timezone" value={timezone} onChange={(e) => setTimezoneValue(e.target.value)}>
                {getAvailableTimezones().map((zone) => (
                  <option key={zone} value={zone}>{zone}</option>
                ))}
              </select>
              <p style={helpText}>All date/time values are displayed in this timezone</p>
            </div>

            <div style={{ ...fieldGroup, display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <input
                type="checkbox"
                id="receiveOrderNotifications"
                checked={receiveOrderNotifications}
                onChange={(e) => setReceiveOrderNotifications(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: '#7c5cff', flexShrink: 0 }}
              />
              <div>
                <label htmlFor="receiveOrderNotifications" style={{ ...labelStyle, marginBottom: 2, cursor: 'pointer' }}>
                  Receive Order Notifications
                </label>
                <p style={{ ...helpText, marginTop: 0 }}>Get email notifications when new orders are placed</p>
              </div>
            </div>

            <div style={divider} />
            <h3 style={{ ...sectionTitle, fontSize: '1rem', marginBottom: '0.15rem' }}>Order Confirmation Emails</h3>
            <p style={{ ...sectionSubtitle, marginBottom: '1rem' }}>Customize how your studio appears to customers in order receipts</p>

            <div style={fieldGroup}>
              <label htmlFor="brandColor" style={labelStyle}>Brand Accent Color</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="color"
                  id="brandColor"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  style={{ width: 44, height: 36, padding: 2, borderRadius: 6, border: '1px solid #3a3656', background: 'none', cursor: 'pointer' }}
                />
                <input
                  type="text"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  placeholder="#7b61ff"
                  style={{ flex: 1 }}
                />
              </div>
              <p style={helpText}>Used as the accent color in customer order confirmation emails</p>
            </div>

            <div style={fieldGroup}>
              <label htmlFor="customEmailMessage" style={labelStyle}>Custom Message in Receipt Email</label>
              <textarea
                id="customEmailMessage"
                value={customEmailMessage}
                onChange={(e) => setCustomEmailMessage(e.target.value)}
                placeholder="Thank you for your order! We'll have it ready shortly. — Smith Photography"
                rows={3}
                style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid #3a3656', borderRadius: 8, color: '#e4e4e7', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
              />
              <p style={helpText}>Shown in the customer's order confirmation email below the order status</p>
            </div>
          </div>

          {/* Social & Domain card */}
          <div style={card}>
            <h2 style={{ ...sectionTitle, fontSize: '1.15rem', marginBottom: '0.2rem' }}>Social & Domain</h2>
            <p style={{ ...sectionSubtitle, marginBottom: '1.25rem' }}>Links and custom domain configuration</p>

            <div style={fieldGroup}>
              <label htmlFor="instagramUrl" style={labelStyle}>Instagram URL</label>
              <input type="url" id="instagramUrl" value={instagramUrl} onChange={(e) => setInstagramUrl(e.target.value)} placeholder="https://www.instagram.com/yourstudio" />
              <p style={helpText}>Shown as an icon next to your studio name</p>
            </div>

            <div style={fieldGroup}>
              <label htmlFor="facebookUrl" style={labelStyle}>Facebook URL</label>
              <input type="url" id="facebookUrl" value={facebookUrl} onChange={(e) => setFacebookUrl(e.target.value)} placeholder="https://www.facebook.com/yourstudio" />
              <p style={helpText}>Shown as an icon next to your studio name</p>
            </div>

            <div style={divider} />

            <div style={fieldGroup}>
              <label htmlFor="customDomain" style={labelStyle}>
                Custom Domain <span style={{ color: '#6b6b80', fontWeight: 400 }}>(optional)</span>
              </label>
              <input type="text" id="customDomain" value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} placeholder="labs.example.com" />
              <p style={helpText}>
                Point your custom domain to redirect to your albums. Example:{' '}
                <code style={{ background: '#29293a', padding: '1px 5px', borderRadius: 4 }}>labs.yourstudio.com</code>
              </p>
              <div style={{ background: '#1e1c30', border: '1px solid #3a3656', borderRadius: 10, padding: '14px 16px', marginTop: '0.75rem', fontSize: '0.82rem', color: '#bdbdbd' }}>
                <strong style={{ display: 'block', marginBottom: 8, color: '#e0e0e0' }}>DNS Configuration</strong>
                <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
                  <li>Go to your domain registrar (GoDaddy, Namecheap, etc.)</li>
                  <li>Find the DNS settings for your domain</li>
                  <li>Add a CNAME record pointing to:{' '}
                    <code style={{ background: '#29293a', padding: '1px 5px', borderRadius: 4 }}>labs.campeaphotography.com</code>
                  </li>
                  <li>Wait 24–48 hours for DNS propagation</li>
                  <li>Your custom domain will redirect to your albums</li>
                </ol>
                <p style={{ margin: '8px 0 0 0', color: '#7c6faa', fontStyle: 'italic' }}>
                  Tip: Use a subdomain like <code style={{ background: '#29293a', padding: '1px 5px', borderRadius: 4 }}>photos.yourdomain.com</code> to keep your main site separate.
                </p>
              </div>
            </div>
          </div>

          {/* Save button */}
          <div style={{ marginBottom: '1.5rem' }}>
            <button
              onClick={handleSave}
              disabled={saving || !ownerName || !businessName || !email}
              style={{
                display: 'block',
                width: '100%',
                padding: '13px 24px',
                fontSize: '1.05rem',
                fontWeight: 700,
                borderRadius: 12,
                background: saving || !ownerName || !businessName || !email ? '#5a3cff66' : '#7c5cff',
                color: '#fff',
                border: 'none',
                cursor: saving || !ownerName || !businessName || !email ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 12px rgba(124,92,255,0.25)',
                transition: 'background 0.2s',
              }}
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>

          {/* Current config summary */}
          {config && (
            <div style={{ ...card, background: '#1e1c30', border: '1px solid #3a3656' }}>
              <p style={{ ...statLabel, marginBottom: 12 }}>Current Configuration</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
                {[
                  ['Owner', ownerName],
                  ['Business', businessName],
                  ['Email', email],
                  ['Timezone', timezone],
                  ['Notifications', receiveOrderNotifications ? 'Enabled' : 'Disabled'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div style={statLabel}>{k}</div>
                    <div style={{ color: '#e0e0e0', fontWeight: 600, fontSize: '0.95rem' }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Subscription section */}
          {effectiveStudioId && subscription ? (
            <>
              <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                <h2 style={sectionTitle}>Subscription</h2>
                <p style={sectionSubtitle}>View and manage your subscription plan</p>
              </div>

              {subscription.studio.cancellation_requested && (
                <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.35)', borderRadius: 12, padding: '16px 20px', marginBottom: '1.25rem' }}>
                  <p style={{ color: '#fde68a', fontWeight: 700, margin: '0 0 6px 0' }}>Cancellation Scheduled</p>
                  <p style={{ color: '#fde68a', margin: '0 0 12px 0', fontSize: '0.9rem' }}>
                    Your subscription ends on{' '}
                    {subscription.studio.subscription_end
                      ? formatDateInStudioTimezone(subscription.studio.subscription_end, timezone)
                      : 'the renewal date'}.
                    You'll have full access until then.
                  </p>
                  {user?.role === 'studio_admin' && (
                    <button onClick={handleReactivateSubscription} className="btn btn-success" style={{ fontSize: 14, fontWeight: 700 }}>
                      Reactivate Subscription
                    </button>
                  )}
                </div>
              )}

              <div style={card}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                  <div>
                    <div style={statLabel}>Current Plan</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#a78bfa' }}>
                      {subscription.plan?.name || subscription.studio.subscription_plan || 'No Plan'}
                    </div>
                    {subscription.studio.is_free_subscription ? (
                      <div style={{ color: '#a3ffb3', fontWeight: 600, fontSize: '0.88rem' }}>FREE</div>
                    ) : subscription.plan ? (
                      <div style={{ color: '#6b6b80', fontSize: '0.88rem' }}>
                        ${subscription.studio.billing_cycle === 'yearly'
                          ? ((subscription.plan.yearlyPrice ?? subscription.plan.monthlyPrice * 10) / 12).toFixed(2)
                          : (subscription.plan.monthlyPrice ?? 0).toFixed(2)}
                        /mo
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <div style={statLabel}>Status</div>
                    <div style={{
                      fontSize: '1.1rem',
                      fontWeight: 700,
                      color: subscription.studio.cancellation_requested
                        ? '#fde68a'
                        : subscription.studio.subscription_status === 'active' ? '#a3ffb3' : '#ff6b6b',
                    }}>
                      {subscription.studio.cancellation_requested
                        ? 'Cancelling'
                        : subscription.studio.subscription_status}
                    </div>
                  </div>

                  <div>
                    <div style={statLabel}>Billing</div>
                    <div style={{ color: '#e0e0e0', fontWeight: 600, fontSize: '0.95rem' }}>
                      {subscription.studio.billing_cycle === 'yearly' ? 'Annual' : 'Monthly'}
                    </div>
                  </div>

                  <div>
                    <div style={statLabel}>Renewal Date</div>
                    <div style={{ color: '#e0e0e0', fontWeight: 600, fontSize: '0.95rem' }}>
                      {subscription.studio.subscription_end
                        ? formatDateInStudioTimezone(subscription.studio.subscription_end, timezone)
                        : 'Not set'}
                    </div>
                  </div>
                </div>

                <div style={divider} />

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {user?.role === 'studio_admin' ? (
                    <>
                      <button onClick={openEditSubscriptionModal} className="btn btn-primary" style={{ fontSize: 14, fontWeight: 700 }}>
                        {subscription.studio.subscription_status === 'active'
                          ? 'Change Plan / Billing'
                          : 'Subscribe'}
                      </button>
                      {stripeStatus?.hasStripeCustomer && (
                        <button
                          onClick={handleOpenPortal}
                          disabled={portalLoading}
                          className="btn btn-secondary"
                          style={{ fontSize: 14, fontWeight: 700 }}
                        >
                          {portalLoading ? 'Opening...' : 'View Payment History'}
                        </button>
                      )}
                      {subscription.studio.subscription_status === 'active' &&
                        !subscription.studio.is_free_subscription &&
                        !subscription.studio.cancellation_requested && (
                          <button onClick={handleCancelSubscription} className="btn btn-danger" style={{ fontSize: 14, fontWeight: 700 }}>
                            Cancel Subscription
                          </button>
                        )}
                    </>
                  ) : (
                    <p style={{ color: '#6b6b80', fontSize: '0.88rem' }}>Only studio admins can manage subscriptions</p>
                  )}
                </div>
              </div>
            </>
          ) : null}

          {/* Landing Page section */}
          <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
            <h2 style={sectionTitle}>Landing Page</h2>
            <p style={sectionSubtitle}>Customize the page visitors see when they use your custom domain</p>
          </div>

          <div style={card}>
            {!showLandingPageEditor ? (
              <>
                <p style={{ margin: '0 0 6px 0', color: '#e0e0e0', fontSize: '0.95rem' }}>
                  Your current landing page is displayed when visitors access your custom domain.
                </p>
                {landingPage && (
                  <p style={{ margin: '0 0 1.25rem 0', color: '#6b6b80', fontSize: '0.85rem' }}>
                    Last updated: <strong style={{ color: '#bdbdbd' }}>{new Date(landingPage.updatedAt || '').toLocaleString()}</strong>
                  </p>
                )}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => { setShowLandingPageEditor(true); setLandingPageHtml(landingPage?.htmlContent || ''); }}
                    className="btn btn-primary"
                  >
                    Edit Landing Page
                  </button>
                  <button
                    type="button"
                    onClick={() => window.open(`/studio/${encodeURIComponent(studioPublicSlug)}/landing`, '_blank', 'noopener,noreferrer')}
                    disabled={!studioPublicSlug}
                    className="btn btn-secondary"
                    style={{ opacity: studioPublicSlug ? 1 : 0.5, cursor: studioPublicSlug ? 'pointer' : 'not-allowed' }}
                  >
                    Preview
                  </button>
                </div>
                {!studioPublicSlug && (
                  <p style={{ marginTop: 10, marginBottom: 0, fontSize: '0.82rem', color: '#6b6b80' }}>
                    Preview will be available once your studio public link is ready.
                  </p>
                )}
              </>
            ) : (
              <>
                <h3 style={{ margin: '0 0 0.75rem 0', color: '#e0e0e0', fontSize: '1rem', fontWeight: 700 }}>Edit Landing Page</h3>
                <p style={{ fontSize: '0.85rem', color: '#6b6b80', marginBottom: '1rem' }}>
                  Customize your landing page with text, images, links, and formatting.
                </p>
                <ReactQuill
                  value={landingPageHtml}
                  onChange={setLandingPageHtml}
                  theme="snow"
                  modules={{
                    toolbar: [
                      [{ 'header': [1, 2, 3, false] }],
                      ['bold', 'italic', 'underline', 'strike'],
                      ['blockquote', 'code-block'],
                      [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                      [{ 'script': 'sub' }, { 'script': 'super' }],
                      [{ 'indent': '-1' }, { 'indent': '+1' }],
                      [{ 'size': ['small', false, 'large', 'huge'] }],
                      [{ 'color': [] }, { 'background': [] }],
                      [{ 'font': [] }],
                      [{ 'align': [] }],
                      ['link', 'image', 'video'],
                      ['clean'],
                    ],
                  }}
                  style={{ backgroundColor: 'white', borderRadius: 6, minHeight: 400, marginBottom: 16 }}
                />
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button onClick={handleSaveLandingPage} disabled={savingLandingPage} className="btn btn-primary">
                    {savingLandingPage ? 'Saving...' : 'Save Landing Page'}
                  </button>
                  <button
                    onClick={handleResetLandingPage}
                    disabled={savingLandingPage}
                    style={{ background: '#fbbf24', color: '#1f2937', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 700, cursor: savingLandingPage ? 'not-allowed' : 'pointer', opacity: savingLandingPage ? 0.7 : 1 }}
                  >
                    Reset to Default
                  </button>
                  <button onClick={() => setShowLandingPageEditor(false)} disabled={savingLandingPage} className="btn btn-secondary">
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>

        </div>
      </div>

      {/* Subscription Modal */}
      {showUpgradeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#23232a', border: '1px solid #3a3656', borderRadius: 18, boxShadow: '0 8px 40px rgba(0,0,0,0.5)', padding: '2rem', width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ ...sectionTitle, fontSize: '1.4rem', marginBottom: '0.3rem' }}>
              {subscription?.studio?.subscription_status === 'active' ? 'Change Plan & Billing' : 'Choose a Plan'}
            </h2>
            <p style={{ color: '#a1a1aa', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
              Select a plan and billing cycle. You'll be taken to Stripe to complete payment.
            </p>

            {/* Billing cycle toggle */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 20, background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid rgba(102,102,204,0.2)', padding: 4, width: 'fit-content' }}>
              {(['monthly', 'yearly'] as const).map(cycle => (
                <button
                  key={cycle}
                  onClick={() => setSelectedBillingCycle(cycle)}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 7,
                    border: 'none',
                    background: selectedBillingCycle === cycle ? '#7c5cff' : 'transparent',
                    color: selectedBillingCycle === cycle ? '#fff' : '#a1a1aa',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'pointer',
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

            {/* Plan cards */}
            <div style={{ display: 'grid', gap: 10, marginBottom: '1.25rem' }}>
              {dbPlans.map(plan => {
                const isSelected = selectedUpgradePlan === plan.id;
                const hasPrice = selectedBillingCycle === 'yearly' ? !!plan.stripe_yearly_price_id : !!plan.stripe_monthly_price_id;
                const displayPrice = selectedBillingCycle === 'yearly' && plan.yearly_price != null
                  ? plan.yearly_price / 12
                  : plan.monthly_price;
                const savings = plan.yearly_price != null ? planSavingsPct(plan.monthly_price, plan.yearly_price) : 0;

                return (
                  <div
                    key={plan.id}
                    onClick={() => hasPrice && setSelectedUpgradePlan(plan.id)}
                    style={{
                      padding: '14px 16px',
                      border: isSelected ? '2px solid #7c5cff' : '1px solid #3a3656',
                      borderRadius: 10,
                      cursor: hasPrice ? 'pointer' : 'default',
                      opacity: hasPrice ? 1 : 0.45,
                      background: isSelected ? 'rgba(124,92,255,0.12)' : '#29293a',
                      transition: 'all 0.18s',
                      boxShadow: isSelected ? '0 0 0 3px rgba(124,92,255,0.15)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, color: '#e0e0e0', fontSize: '1rem' }}>{plan.name}</span>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontWeight: 800, color: '#a78bfa', fontSize: '1.1rem' }}>
                          ${displayPrice.toFixed(2)}/mo
                        </span>
                        {selectedBillingCycle === 'yearly' && plan.yearly_price != null && (
                          <div style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>
                            ${plan.yearly_price.toFixed(2)}/yr
                            {savings > 0 && <span style={{ marginLeft: 4, color: '#4ade80', fontWeight: 700 }}>Save {savings}%</span>}
                          </div>
                        )}
                      </div>
                    </div>
                    {!hasPrice && (
                      <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 4 }}>Not available for {selectedBillingCycle} billing</div>
                    )}
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.82rem', color: '#6b6b80' }}>
                      {(plan.features || []).slice(0, 3).map((feature, idx) => (
                        <li key={idx}>{feature}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              {dbPlans.length === 0 && (
                <p style={{ color: '#6b6b80', fontSize: '0.9rem' }}>No plans available. Contact support.</p>
              )}
            </div>

            {stripeStatus?.hasStripeSubscription && (
              <div style={{ background: 'rgba(124,92,255,0.1)', border: '1px solid rgba(124,92,255,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#c4b5fd' }}>
                You have an active Stripe subscription. Selecting a plan will open the Stripe portal where you can change your plan and billing cycle.
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleUpgrade}
                disabled={!selectedUpgradePlan || upgrading}
                style={{
                  flex: 1,
                  padding: '12px',
                  fontWeight: 700,
                  fontSize: '1rem',
                  borderRadius: 10,
                  background: !selectedUpgradePlan || upgrading ? '#5a3cff66' : '#7c5cff',
                  color: '#fff',
                  border: 'none',
                  cursor: !selectedUpgradePlan || upgrading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 12px rgba(124,92,255,0.25)',
                }}
              >
                {upgrading
                  ? 'Redirecting...'
                  : stripeStatus?.hasStripeSubscription
                    ? 'Manage in Stripe Portal'
                    : 'Subscribe Now'}
              </button>
              <button
                onClick={() => setShowUpgradeModal(false)}
                disabled={upgrading}
                className="btn btn-secondary"
                style={{ flex: 1, fontWeight: 700, fontSize: '1rem' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminProfile;
