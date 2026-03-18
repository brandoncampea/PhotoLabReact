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
    <div className="main-content dark-bg landing-main">
      {/* Hero Section */}
      <section className="landing-hero-section">
        <h1 className="landing-title gradient-text">
          Professional Photo Lab Platform
        </h1>
        <p className="landing-desc">
          Empower your photography business with a complete client portal, online ordering, and professional lab integration
        </p>
        <form className="search-filter-bar landing-search-form" onSubmit={handleSearchSubmit}>
          <div className="search-box landing-search-box">
            <input
              type="text"
              placeholder="Search photos by filename, camera, player, etc..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="search-input landing-search-input"
            />
          </div>
          <button className="btn btn-primary landing-search-btn" type="submit">Search</button>
        </form>
        <div className="landing-btn-row">
          <button className="btn btn-primary" onClick={() => navigate('/studio-signup')}>
            🚀 Start Your Studio Free Trial
          </button>
          <button className="btn" style={{ border: '2px solid var(--color-primary)', color: 'var(--color-primary)', background: 'transparent' }} onClick={() => navigate('/login')}>
            🔑 Studio Login
          </button>
        </div>
      </section>

      {/* Features Section */}
      <section className="landing-features-section">
        <div className="features-row">
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
      <section className="landing-pricing-section">
        <h2 className="gradient-text landing-pricing-title">
          Plans for Every Studio Size
        </h2>
        <p className="landing-pricing-desc">
          Start with a free trial, no credit card required
        </p>
        <div className="pricing-row">
          {plansLoading ? (
            <div className="pricing-loading">Loading plans...</div>
          ) : plansError ? (
            <div className="pricing-error">{plansError}</div>
          ) : plans.length === 0 ? (
            <div className="pricing-empty">No plans available.</div>
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
        <button className="btn btn-primary landing-pricing-btn" onClick={() => navigate('/studio-signup')}>
          Get Started Free
        </button>
      </section>

      {/* Footer CTA */}
      <section className="dark-card landing-footer-cta">
        <h2 className="gradient-text landing-footer-title">
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
    <div className="feature-card">
      <div className="feature-card-icon">{icon}</div>
      <h3 className="feature-card-title">{title}</h3>
      <p className="feature-card-desc">{description}</p>
    </div>
  );
}

function PricingCard({ name, price, features, highlighted }: { name: string; price: string; features: string[]; highlighted?: boolean }) {
  return (
    <div className={`pricing-card${highlighted ? ' pricing-card-highlighted' : ''}`}>
      {highlighted && (
        <div className="pricing-card-popular">Most Popular</div>
      )}
      <h3 className="pricing-card-title">{name}</h3>
      <div className="pricing-card-price">
        {price}
        <span className="pricing-card-price-unit">/mo</span>
      </div>
      <ul className="pricing-card-features">
        {features.map((feature, index) => (
          <li key={index} className="pricing-card-feature">
            ✓ {feature}
          </li>
        ))}
      </ul>
    </div>
  );
}