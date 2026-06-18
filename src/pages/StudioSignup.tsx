import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

type Plan = { id: string | number; name: string; monthly_price: number; yearly_price: number | null; nickname?: string };

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
    fetch(`${apiUrl}/subscription-plans?frequency=monthly`)
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        const seen = new Set<string | number>();
        const unique: Plan[] = [];
        for (const p of (Array.isArray(data) ? data : [])) {
          if (!seen.has(p.id)) { seen.add(p.id); unique.push(p); }
        }
        setPlans(unique);
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

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#181a1b',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '3rem 1rem 4rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          background: '#23232a',
          border: '1px solid #3a3656',
          borderRadius: 18,
          boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
          padding: '2.5rem 2rem',
        }}
      >
        {/* Heading */}
        <h1
          style={{
            margin: '0 0 0.25rem 0',
            fontSize: 'clamp(1.8rem, 5vw, 2.5rem)',
            fontWeight: 800,
            background: 'linear-gradient(90deg, #a78bfa 0%, #6366f1 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            textAlign: 'center',
          }}
        >
          Create Your Studio
        </h1>
        <p style={{ color: '#a1a1aa', textAlign: 'center', margin: '0 0 1.75rem 0', fontSize: '1rem' }}>
          Start managing your photos professionally
        </p>

        {error && (
          <div style={{ background: '#2d1a1a', color: '#ffb3b3', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.95rem' }}>
            {error}
          </div>
        )}

        {/* Plan selection */}
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ margin: '0 0 0.25rem 0', fontWeight: 700, color: '#e0e0e0', fontSize: '1rem' }}>
            Select Your Plan
          </p>
          <p style={{ color: '#4ade80', fontSize: '0.88rem', margin: '0 0 0.875rem 0', fontWeight: 600 }}>
            No credit card charged today
          </p>

          {/* Billing cycle toggle */}
          {!plansLoading && plans.length > 0 && (
            <div style={{ display: 'flex', gap: 0, marginBottom: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid rgba(102,102,204,0.2)', padding: 4, width: 'fit-content' }}>
              {(['monthly', 'yearly'] as const).map(cycle => (
                <button
                  key={cycle}
                  type="button"
                  onClick={() => setBillingCycle(cycle)}
                  style={{
                    padding: '7px 16px',
                    borderRadius: 7,
                    border: 'none',
                    background: billingCycle === cycle ? '#7c5cff' : 'transparent',
                    color: billingCycle === cycle ? '#fff' : '#a1a1aa',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'background 0.15s, color 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {cycle === 'monthly' ? 'Monthly' : 'Annual'}
                  {cycle === 'yearly' && (
                    <span style={{ background: 'rgba(74,222,128,0.2)', color: '#4ade80', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10 }}>
                      Save up to 20%
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {plansLoading ? (
            <div style={{ color: '#a1a1aa', fontSize: '0.9rem', padding: '8px 0' }}>Loading plans...</div>
          ) : plans.length === 0 ? (
            <div style={{ color: '#a1a1aa', fontSize: '0.9rem', padding: '8px 0' }}>No plans available. Please contact support.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(plans.length, 3)}, 1fr)`, gap: 10 }}>
              {plans.map(plan => {
                const isSelected = selectedPlan === Number(plan.id);
                const showYearly = billingCycle === 'yearly' && plan.yearly_price != null;
                const displayMonthly = showYearly
                  ? (plan.yearly_price! / 12)
                  : plan.monthly_price;
                const savings = plan.yearly_price != null && plan.monthly_price > 0
                  ? Math.round(((plan.monthly_price * 12 - plan.yearly_price) / (plan.monthly_price * 12)) * 100)
                  : 0;

                return (
                  <div
                    key={plan.id}
                    onClick={() => setSelectedPlan(Number(plan.id))}
                    style={{
                      padding: '14px 10px',
                      border: isSelected ? '2px solid #7c5cff' : '2px solid #3a3656',
                      borderRadius: 10,
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(124, 92, 255, 0.14)' : '#29293a',
                      textAlign: 'center',
                      transition: 'border-color 0.18s, background 0.18s',
                      boxShadow: isSelected ? '0 0 0 3px rgba(124,92,255,0.18)' : 'none',
                    }}
                  >
                    <div style={{ marginBottom: 6 }}>
                      <span style={{ background: 'rgba(74,222,128,0.18)', color: '#4ade80', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>
                        30-Day Free Trial
                      </span>
                    </div>
                    <div style={{ fontWeight: 700, color: '#fff', fontSize: '1rem', marginBottom: 4 }}>
                      {plan.name || plan.nickname || 'Plan'}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#a78bfa' }}>
                      {`$${displayMonthly.toFixed(2)}/mo`}
                    </div>
                    {showYearly && plan.yearly_price != null && (
                      <div style={{ fontSize: '0.75rem', color: '#a1a1aa', marginTop: 2 }}>
                        ${plan.yearly_price.toFixed(2)}/yr
                        {savings > 0 && <span style={{ marginLeft: 4, color: '#4ade80', fontWeight: 700 }}>· Save {savings}%</span>}
                      </div>
                    )}
                    {!showYearly && plan.yearly_price != null && savings > 0 && (
                      <div style={{ fontSize: '0.72rem', color: '#52525b', marginTop: 2 }}>
                        or ${(plan.yearly_price / 12).toFixed(2)}/mo billed annually
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Form */}
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
            disabled={loading}
            style={{
              display: 'block',
              width: '100%',
              padding: '12px 24px',
              fontSize: '1.08rem',
              fontWeight: 700,
              borderRadius: 12,
              background: loading ? '#5a3cff99' : '#7c5cff',
              color: '#fff',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
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
