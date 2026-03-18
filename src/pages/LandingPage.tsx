import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import '../PhotoLabStyles.css';

export default function LandingPage() {
      const [searchQuery, setSearchQuery] = React.useState('');
      const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
          navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
        }
      };
    const [plans, setPlans] = React.useState<any[]>([]);
    const [plansLoading, setPlansLoading] = React.useState(true);
    const [plansError, setPlansError] = React.useState('');

    React.useEffect(() => {
      async function fetchPlans() {
        setPlansLoading(true);
        setPlansError('');
        try {
          const apiUrl = import.meta.env.VITE_API_URL || '/api';
          const res = await fetch(`${apiUrl}/subscription-plans/stripe-products`);
          if (!res.ok) throw new Error('Failed to fetch subscription plans');
          const data = await res.json();
          setPlans(Array.isArray(data) ? data : []);
        } catch (err) {
          setPlansError('Unable to load plans.');
        } finally {
          setPlansLoading(false);
        }
      }
      fetchPlans();
    }, []);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Redirect authenticated users
  React.useEffect(() => {
    if (user) {
      if (user.role === 'super_admin' || user.role === 'admin' || user.role === 'studio_admin') {
        navigate('/admin/dashboard');
      } else {
        navigate('/albums');
      }
    }
  }, [user, navigate]);

  return (
    <div className="main-content dark-bg" style={{ minHeight: '100vh' }}>
      {/* Hero Section */}
      <section style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 className="landing-title gradient-text" style={{ marginBottom: '1.5rem' }}>
          Professional Photo Lab Platform
        </h1>
        <p className="landing-desc" style={{ maxWidth: '800px', margin: '0 auto 2rem', color: '#bdbdbd', fontSize: '1.3rem' }}>
          Empower your photography business with a complete client portal, online ordering, and professional lab integration
        </p>
        <form className="search-filter-bar" style={{ justifyContent: 'center', margin: '2rem 0' }} onSubmit={handleSearchSubmit}>
          <div className="search-box" style={{ minWidth: '250px', maxWidth: '400px' }}>
            <input
              type="text"
              placeholder="Search photos by filename, camera, player, etc..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="search-input"
              style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '0.75rem', fontSize: '1rem', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
            />
          </div>
          <button className="btn btn-primary" type="submit" style={{ marginLeft: '1rem', minWidth: '120px' }}>Search</button>
        </form>
        <div className="landing-btn-row" style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '2rem' }}>
          <button className="btn btn-primary" onClick={() => navigate('/studio-signup')}>
            🚀 Start Your Studio Free Trial
          </button>
          <button className="btn" style={{ border: '2px solid var(--color-primary)', color: 'var(--color-primary)', background: 'transparent' }} onClick={() => navigate('/login')}>
            🔑 Studio Login
          </button>
        </div>
      </section>

      {/* Features Section */}
      <section style={{ margin: '2rem 0' }}>
        <div className="features-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', marginTop: '2rem' }}>
          <FeatureCard icon="📸" title="Client Photo Galleries" description="Upload and organize client photos in beautiful, password-protected albums" />
          <FeatureCard icon="🛒" title="Online Ordering" description="Let clients order prints, packages, and digital downloads directly from their gallery" />
          <FeatureCard icon="💰" title="Custom Pricing" description="Set your own prices with flexible pricing lists and package options" />
          <FeatureCard icon="🏢" title="Professional Labs" description="Integrated with WHCC, Mpix, and other major photo labs for seamless fulfillment" />
          <FeatureCard icon="💳" title="Secure Payments" description="Built-in Stripe integration for safe and reliable payment processing" />
          <FeatureCard icon="📊" title="Business Analytics" description="Track sales, popular products, and client engagement with detailed reports" />
          <FeatureCard icon="📦" title="Batch Shipping" description="Easily ship multiple orders together for efficiency and cost savings." />
          <FeatureCard icon="🏷️" title="Player Recognition" description="Automatically identify and tag players in photos for fast search and personalized albums." />
        </div>
      </section>

      {/* Pricing Preview Section */}
      <section style={{ textAlign: 'center', margin: '3rem 0' }}>
        <h2 className="gradient-text" style={{ fontSize: '2.2rem', fontWeight: '700', marginBottom: '1rem' }}>
          Plans for Every Studio Size
        </h2>
        <p style={{ fontSize: '1.1rem', color: '#bdbdbd', marginBottom: '2rem' }}>
          Start with a free trial, no credit card required
        </p>
        <div className="pricing-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
          {plansLoading ? (
            <div style={{ color: '#7c5cff', fontSize: '1.2rem', gridColumn: '1/-1' }}>Loading plans...</div>
          ) : plansError ? (
            <div style={{ color: '#ff6b35', fontSize: '1.2rem', gridColumn: '1/-1' }}>{plansError}</div>
          ) : plans.length === 0 ? (
            <div style={{ color: '#bdbdbd', fontSize: '1.2rem', gridColumn: '1/-1' }}>No plans available.</div>
          ) : (
            plans.map((plan, idx) => (
              <PricingCard
                key={plan.id || idx}
                name={plan.name || plan.nickname || 'Plan'}
                price={plan.price ? `$${plan.price}` : (plan.amount ? `$${(plan.amount/100).toFixed(0)}` : '')}
                features={plan.features || plan.metadata?.features || []}
                highlighted={plan.metadata?.highlighted || false}
              />
            ))
          )}
        </div>
        <button className="btn btn-primary" style={{ marginTop: '2rem' }} onClick={() => navigate('/studio-signup')}>
          Get Started Free
        </button>
      </section>

      {/* Footer CTA */}
      <section className="dark-card" style={{ background: 'rgba(124, 92, 255, 0.1)', borderTop: '1px solid rgba(124, 92, 255, 0.2)', padding: '2.5rem 2rem', marginTop: '3rem', textAlign: 'center' }}>
        <h2 className="gradient-text" style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '1rem' }}>
          Ready to Transform Your Photography Business?
        </h2>
        <p style={{ fontSize: '1.1rem', color: '#bdbdbd', marginBottom: '2rem' }}>
          Join hundreds of photographers already using our platform
        </p>
        <button className="btn btn-primary" onClick={() => navigate('/studio-signup')}>
          Start Free Trial
        </button>
      </section>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div style={{
      background: 'rgba(255, 255, 255, 0.05)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '12px',
      padding: '2rem',
      textAlign: 'center',
      transition: 'all 0.3s ease',
    }}
    onMouseOver={(e) => {
      e.currentTarget.style.background = 'rgba(124, 92, 255, 0.1)';
      e.currentTarget.style.borderColor = 'rgba(124, 92, 255, 0.3)';
      e.currentTarget.style.transform = 'translateY(-5px)';
    }}
    onMouseOut={(e) => {
      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
      e.currentTarget.style.transform = 'translateY(0)';
    }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{icon}</div>
      <h3 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '0.5rem', color: '#fff' }}>{title}</h3>
      <p style={{ color: '#a0a0a0', lineHeight: '1.6' }}>{description}</p>
    </div>
  );
}

function PricingCard({ name, price, features, highlighted }: { name: string; price: string; features: string[]; highlighted?: boolean }) {
  return (
    <div style={{
      background: highlighted ? 'linear-gradient(135deg, rgba(124, 92, 255, 0.2) 0%, rgba(167, 139, 250, 0.1) 100%)' : 'rgba(255, 255, 255, 0.05)',
      border: highlighted ? '2px solid #7c5cff' : '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '12px',
      padding: '2rem',
      textAlign: 'center',
      position: 'relative',
      transition: 'all 0.3s ease',
    }}
    onMouseOver={(e) => {
      e.currentTarget.style.transform = 'translateY(-5px)';
    }}
    onMouseOut={(e) => {
      e.currentTarget.style.transform = 'translateY(0)';
    }}>
      {highlighted && (
        <div style={{
          position: 'absolute',
          top: '-12px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#7c5cff',
          color: '#fff',
          padding: '0.3rem 1rem',
          borderRadius: '20px',
          fontSize: '0.9rem',
          fontWeight: '600'
        }}>
          Most Popular
        </div>
      )}
      <h3 style={{ fontSize: '1.8rem', fontWeight: '700', marginBottom: '0.5rem', color: '#fff' }}>{name}</h3>
      <div style={{ fontSize: '3rem', fontWeight: '700', color: '#7c5cff', marginBottom: '0.5rem' }}>
        {price}
        <span style={{ fontSize: '1.2rem', color: '#a0a0a0' }}>/mo</span>
      </div>
      <ul style={{
        listStyle: 'none',
        padding: '1.5rem 0',
        margin: 0,
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
      }}>
        {features.map((feature, index) => (
          <li key={index} style={{
            padding: '0.5rem 0',
            color: '#d0d0d0',
            fontSize: '1rem'
          }}>
            ✓ {feature}
          </li>
        ))}
      </ul>
    </div>
  );
}