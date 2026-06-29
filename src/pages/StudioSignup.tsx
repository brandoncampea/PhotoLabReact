import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

type Plan = {
  id: string | number;
  name: string;
  description: string | null;
  monthly_price: number;
  yearly_price: number | null;
  max_albums: number | null;
  max_storage_gb: number | null;
  features: string[];
  stripe_monthly_price_id: string | null;
  stripe_yearly_price_id: string | null;
};

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #3a3656',
  background: '#1e1c30',
  color: '#e0e0e0',
  fontSize: '1rem',
  boxSizing: 'border-box',
  outline: 'none',
  marginBottom: 0,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 5,
  fontWeight: 600,
  color: '#bdbdbd',
  fontSize: '0.92rem',
};

const sectionHeadingStyle: React.CSSProperties = {
  margin: '1.25rem 0 0.6rem 0',
  color: '#a78bfa',
  fontWeight: 700,
  fontSize: '0.82rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

const StudioSignup: React.FC = () => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [formData, setFormData] = useState({
    studioName: '',
    studioEmail: '',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const apiUrl = (import.meta as any).env?.VITE_API_URL || '/api';
    fetch(`${apiUrl}/subscription-plans`)
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        const seen = new Set<string | number>();
        const unique: Plan[] = [];
        for (const p of (Array.isArray(data) ? data : [])) {
          if (!seen.has(p.id)) {
            seen.add(p.id);
            unique.push({
              ...p,
              features: Array.isArray(p.features) ? p.features : [],
            });
          }
        }
        setPlans(unique);
        // Auto-select the middle plan (most popular) if nothing selected
        if (unique.length > 0 && !selectedPlan) {
          const midIdx = unique.length > 1 ? 1 : 0;
          setSelectedPlan(Number(unique[midIdx].id));
        }
      })
      .catch(() => setPlans([]))
      .finally(() => setPlansLoading(false));
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedPlan) {
      setError('Please select a plan to continue');
      return;
    }
    if (formData.adminPassword !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (formData.adminPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || '/api';
      const res = await fetch(`${apiUrl}/studios/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studioName: formData.studioName,
          studioEmail: formData.studioEmail,
          adminName: formData.adminName,
          adminEmail: formData.adminEmail,
          adminPassword: formData.adminPassword,
          planId: Number(selectedPlan),
          billingCycle,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create studio');
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        navigate('/login');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const selectedPlanObj = plans.find(p => Number(p.id) === selectedPlan);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(160deg, #0f0f1a 0%, #181a2a 100%)',
        padding: '3rem 1.5rem 5rem',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <h1
          style={{
            margin: '0 0 0.4rem',
            fontSize: 'clamp(2rem, 5vw, 2.8rem)',
            fontWeight: 800,
            background: 'linear-gradient(90deg, #a78bfa 0%, #6366f1 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Create Your Studio
        </h1>
        <p style={{ color: '#a1a1aa', margin: 0, fontSize: '1.05rem' }}>
          Start your 30-day free trial — no credit card required today.
        </p>
      </div>

      {/* Plan comparison */}
      <div style={{ maxWidth: 920, margin: '0 auto 2.5rem' }}>
        {/* Billing toggle */}
        {!plansLoading && plans.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
            <div style={{
              display: 'flex',
              gap: 0,
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 10,
              border: '1px solid rgba(102,102,204,0.25)',
              padding: 4,
            }}>
              {(['monthly', 'yearly'] as const).map(cycle => (
                <button
                  key={cycle}
                  type="button"
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
                    <span style={{
                      background: 'rgba(74,222,128,0.2)',
                      color: '#4ade80',
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: 10,
                    }}>
                      Save up to 20%
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {plansLoading ? (
          <div style={{ textAlign: 'center', color: '#a1a1aa', padding: '2rem 0' }}>Loading plans...</div>
        ) : plans.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#a1a1aa', padding: '2rem 0' }}>No plans available. Please contact support.</div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(plans.length, 3)}, 1fr)`,
            gap: 16,
            alignItems: 'stretch',
          }}>
            {plans.map((plan, idx) => {
              const isSelected = selectedPlan === Number(plan.id);
              const isPopular = plans.length === 3 && idx === 1;
              const showYearly = billingCycle === 'yearly' && plan.yearly_price != null;
              const displayPrice = showYearly ? plan.yearly_price! / 12 : plan.monthly_price;
              const savings = plan.yearly_price != null && plan.monthly_price > 0
                ? Math.round(((plan.monthly_price * 12 - plan.yearly_price) / (plan.monthly_price * 12)) * 100)
                : 0;
              const hasYearlyOption = plan.stripe_yearly_price_id != null || plan.yearly_price != null;

              return (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlan(Number(plan.id))}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: isPopular ? '28px 20px 20px' : '20px 20px',
                    border: isSelected
                      ? '2px solid #7c5cff'
                      : isPopular
                      ? '2px solid rgba(124,92,255,0.45)'
                      : '2px solid #2e2c42',
                    borderRadius: 14,
                    cursor: 'pointer',
                    background: isSelected
                      ? 'rgba(124,92,255,0.12)'
                      : isPopular
                      ? 'rgba(124,92,255,0.05)'
                      : 'rgba(255,255,255,0.03)',
                    transition: 'border-color 0.18s, background 0.18s, box-shadow 0.18s',
                    boxShadow: isSelected
                      ? '0 0 0 4px rgba(124,92,255,0.2), 0 8px 32px rgba(124,92,255,0.15)'
                      : isPopular
                      ? '0 4px 20px rgba(124,92,255,0.1)'
                      : 'none',
                    marginTop: isPopular ? '-8px' : '0',
                    paddingTop: isPopular ? '28px' : '20px',
                  }}
                >
                  {isPopular && (
                    <div style={{
                      position: 'absolute',
                      top: -13,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'linear-gradient(90deg, #7c5cff, #6366f1)',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '4px 14px',
                      borderRadius: 20,
                      whiteSpace: 'nowrap',
                      boxShadow: '0 2px 8px rgba(124,92,255,0.4)',
                    }}>
                      Most Popular
                    </div>
                  )}

                  {/* Plan name */}
                  <div style={{
                    fontWeight: 800,
                    color: '#fff',
                    fontSize: '1.1rem',
                    marginBottom: plan.description ? 4 : 12,
                  }}>
                    {plan.name}
                  </div>

                  {/* Description */}
                  {plan.description && (
                    <div style={{
                      fontSize: 12,
                      color: '#71717a',
                      marginBottom: 14,
                      lineHeight: 1.5,
                    }}>
                      {plan.description}
                    </div>
                  )}

                  {/* Price */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ fontWeight: 800, fontSize: '2rem', color: '#a78bfa', lineHeight: 1 }}>
                        ${displayPrice.toFixed(2)}
                      </span>
                      <span style={{ fontSize: 13, color: '#71717a' }}>/mo</span>
                    </div>
                    {showYearly && plan.yearly_price != null && (
                      <div style={{ fontSize: 12, color: '#a1a1aa', marginTop: 3 }}>
                        ${plan.yearly_price.toFixed(2)}/yr
                        {savings > 0 && (
                          <span style={{ marginLeft: 6, color: '#4ade80', fontWeight: 700 }}>
                            Save {savings}%
                          </span>
                        )}
                      </div>
                    )}
                    {!showYearly && hasYearlyOption && savings > 0 && (
                      <div style={{ fontSize: 11, color: '#52525b', marginTop: 3 }}>
                        or ${(plan.yearly_price! / 12).toFixed(2)}/mo billed annually
                      </div>
                    )}
                  </div>

                  {/* Limits */}
                  <div style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    marginBottom: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 5,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#71717a' }}>Albums</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#e4e4e7' }}>
                        {plan.max_albums == null ? 'Unlimited' : plan.max_albums.toLocaleString()}
                      </span>
                    </div>
                    {plan.max_storage_gb != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#71717a' }}>Storage</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#e4e4e7' }}>
                          {plan.max_storage_gb >= 1000
                            ? `${(plan.max_storage_gb / 1000).toFixed(plan.max_storage_gb % 1000 === 0 ? 0 : 1)} TB`
                            : `${plan.max_storage_gb} GB`}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Features */}
                  {plan.features.length > 0 && (
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', flex: 1 }}>
                      {plan.features.map((f, i) => (
                        <li key={i} style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 7,
                          marginBottom: 6,
                          fontSize: 12,
                          color: '#a1a1aa',
                          lineHeight: 1.45,
                        }}>
                          <span style={{ color: '#4ade80', flexShrink: 0, fontWeight: 700, fontSize: 13 }}>✓</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Trial + select state */}
                  <div style={{ marginTop: 16, textAlign: 'center' }}>
                    <div style={{
                      display: 'inline-block',
                      background: 'rgba(74,222,128,0.15)',
                      color: '#4ade80',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 10,
                      marginBottom: isSelected ? 8 : 0,
                    }}>
                      30-Day Free Trial
                    </div>
                    {isSelected && (
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa' }}>
                        ✓ Selected
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Form card */}
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          margin: '0 auto',
          background: '#23232a',
          border: '1px solid #3a3656',
          borderRadius: 18,
          boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
          padding: '2rem 2rem',
          boxSizing: 'border-box',
        }}
      >
        {selectedPlanObj && (
          <div style={{
            background: 'rgba(124,92,255,0.1)',
            border: '1px solid rgba(124,92,255,0.3)',
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              <span style={{ color: '#a78bfa', fontWeight: 700, fontSize: 14 }}>
                {selectedPlanObj.name}
              </span>
              <span style={{ color: '#71717a', fontSize: 13 }}> · {billingCycle === 'yearly' ? 'Annual' : 'Monthly'}</span>
            </div>
            <div style={{ fontWeight: 700, color: '#a78bfa', fontSize: 14 }}>
              {billingCycle === 'yearly' && selectedPlanObj.yearly_price != null
                ? `$${(selectedPlanObj.yearly_price / 12).toFixed(2)}/mo`
                : `$${selectedPlanObj.monthly_price.toFixed(2)}/mo`}
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: '#2d1a1a', color: '#ffb3b3', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.95rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <p style={sectionHeadingStyle}>Studio Information</p>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Studio Name</label>
            <input
              style={inputStyle}
              type="text"
              name="studioName"
              value={formData.studioName}
              onChange={handleInputChange}
              placeholder="e.g., John Smith Photography"
              required
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Studio Email</label>
            <input
              style={inputStyle}
              type="email"
              name="studioEmail"
              value={formData.studioEmail}
              onChange={handleInputChange}
              placeholder="studio@example.com"
              required
            />
          </div>

          <p style={sectionHeadingStyle}>Admin Account</p>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Admin Name</label>
            <input
              style={inputStyle}
              type="text"
              name="adminName"
              value={formData.adminName}
              onChange={handleInputChange}
              placeholder="Your full name"
              required
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Admin Email</label>
            <input
              style={inputStyle}
              type="email"
              name="adminEmail"
              value={formData.adminEmail}
              onChange={handleInputChange}
              placeholder="your@example.com"
              required
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Password</label>
            <input
              style={inputStyle}
              type="password"
              name="adminPassword"
              value={formData.adminPassword}
              onChange={handleInputChange}
              placeholder="At least 8 characters"
              required
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Confirm Password</label>
            <input
              style={inputStyle}
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleInputChange}
              placeholder="Confirm your password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading || !selectedPlan}
            style={{
              display: 'block',
              width: '100%',
              padding: '12px 24px',
              fontSize: '1.08rem',
              fontWeight: 700,
              borderRadius: 12,
              background: loading || !selectedPlan ? '#5a3cff99' : '#7c5cff',
              color: '#fff',
              border: 'none',
              cursor: loading || !selectedPlan ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 12px rgba(124,92,255,0.3)',
              transition: 'background 0.2s',
            }}
          >
            {loading ? 'Creating Studio...' : 'Start 30-Day Free Trial'}
          </button>
        </form>

        <p style={{ marginTop: 16, textAlign: 'center', color: '#a1a1aa', fontSize: '0.95rem' }}>
          Already have an account?{' '}
          <a href="/login" style={{ color: '#a78bfa', fontWeight: 600, textDecoration: 'none' }}>
            Log in here
          </a>
        </p>
      </div>
    </div>
  );
};

export default StudioSignup;
