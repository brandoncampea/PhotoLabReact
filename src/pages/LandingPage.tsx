import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import '../App.css';

interface LandingSubscriptionPlan {
  id: string | number;
  name: string;
  monthly_price: number;
  yearly_price?: number;
  features: string[];
  is_active?: boolean;
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [plans, setPlans] = React.useState<LandingSubscriptionPlan[]>([]);
  const [plansLoading, setPlansLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;

    const loadPlans = async () => {
      try {
        const response = await fetch('/api/subscription-plans');
        if (!response.ok) {
          throw new Error('Failed to load plans');
        }

        const data = await response.json();
        if (!mounted) return;

        const activePlans = (Array.isArray(data) ? data : [])
          .filter((plan) => plan && (plan.is_active === undefined || plan.is_active === true))
          .sort((a, b) => (Number(a.monthly_price) || 0) - (Number(b.monthly_price) || 0));

        setPlans(activePlans);
      } catch (error) {
        console.error('Failed to load landing subscription plans:', error);
      } finally {
        if (mounted) setPlansLoading(false);
      }
    };

    loadPlans();
    return () => {
      mounted = false;
    };
  }, []);

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
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f1115 0%, #1a1d24 50%, #0f1115 100%)',
      color: '#fff',
      paddingTop: '4rem'
    }}>
      {/* Hero Section */}
      <section style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '4rem 2rem',
        textAlign: 'center'
      }}>
        <h1 style={{
          fontSize: '3.5rem',
          fontWeight: '700',
          marginBottom: '1.5rem',
          background: 'linear-gradient(135deg, #7c5cff 0%, #a78bfa 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          lineHeight: '1.2'
        }}>
          Professional Photo Lab Platform
        </h1>
        <p style={{
          fontSize: '1.5rem',
          color: '#a0a0a0',
          maxWidth: '800px',
          margin: '0 auto 3rem',
          lineHeight: '1.8'
        }}>
          Empower your photography business with a complete client portal, online ordering, and professional lab integration
        </p>
        <div style={{
          display: 'flex',
          gap: '1.5rem',
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={() => navigate('/studio-signup')}
            style={{
              padding: '1rem 2.5rem',
              fontSize: '1.2rem',
              fontWeight: '600',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              background: 'linear-gradient(135deg, #7c5cff 0%, #a78bfa 100%)',
              color: '#fff',
              boxShadow: '0 8px 20px rgba(124, 92, 255, 0.4)',
              transition: 'all 0.3s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 12px 28px rgba(124, 92, 255, 0.5)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 8px 20px rgba(124, 92, 255, 0.4)';
            }}
          >
            🚀 Start Your Studio Free Trial
          </button>
          <button
            onClick={() => navigate('/login')}
            style={{
              padding: '1rem 2.5rem',
              fontSize: '1.2rem',
              fontWeight: '600',
              border: '2px solid #7c5cff',
              borderRadius: '8px',
              cursor: 'pointer',
              background: 'transparent',
              color: '#7c5cff',
              transition: 'all 0.3s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(124, 92, 255, 0.1)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            🔑 Studio Login
          </button>
        </div>
      </section>

      {/* Features Section */}
      <section style={{
        maxWidth: '1200px',
        margin: '4rem auto',
        padding: '2rem',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '2rem',
          marginTop: '3rem'
        }}>
          <FeatureCard
            icon="📸"
            title="Client Photo Galleries"
            description="Upload and organize client photos in beautiful, password-protected albums"
          />
          <FeatureCard
            icon="🛒"
            title="Online Ordering"
            description="Let clients order prints, packages, and digital downloads directly from their gallery"
          />
          <FeatureCard
            icon="🚚"
            title="Batch Shipping"
            description="Queue multiple orders and submit them together to the lab to reduce fulfillment and shipping costs"
          />
          <FeatureCard
            icon="💰"
            title="Custom Pricing"
            description="Set your own prices with flexible pricing lists and package options"
          />
          <FeatureCard
            icon="🏢"
            title="Professional Labs"
            description="Integrated with WHCC, Mpix, and other major photo labs for seamless fulfillment"
          />
          <FeatureCard
            icon="💳"
            title="Secure Payments"
            description="Built-in Stripe integration for safe and reliable payment processing"
          />
          <FeatureCard
            icon="📊"
            title="Business Analytics"
            description="Track sales, popular products, and client engagement with detailed reports"
          />
        </div>
      </section>

      {/* Pricing Preview Section */}
      <section style={{
        maxWidth: '1200px',
        margin: '4rem auto',
        padding: '2rem',
        textAlign: 'center'
      }}>
        <h2 style={{
          fontSize: '2.5rem',
          fontWeight: '700',
          marginBottom: '1rem',
          color: '#fff'
        }}>
          Plans for Every Studio Size
        </h2>
        <p style={{
          fontSize: '1.2rem',
          color: '#a0a0a0',
          marginBottom: '3rem'
        }}>
          Start with a free trial, no credit card required
        </p>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '2rem',
          maxWidth: '1000px',
          margin: '0 auto'
        }}>
          {plansLoading ? (
            <div style={{ gridColumn: '1 / -1', color: '#a0a0a0' }}>Loading plans…</div>
          ) : plans.length > 0 ? (
            plans.map((plan, index) => (
              <PricingCard
                key={String(plan.id)}
                name={plan.name}
                price={`$${Number(plan.monthly_price || 0).toFixed(0)}`}
                features={Array.isArray(plan.features) ? plan.features : []}
                highlighted={index === 1 || /professional/i.test(String(plan.name || ''))}
              />
            ))
          ) : (
            <div style={{ gridColumn: '1 / -1', color: '#a0a0a0' }}>
              Subscription plans are being configured. Please check back shortly.
            </div>
          )}
        </div>
        <button
          onClick={() => navigate('/studio-signup')}
          style={{
            marginTop: '3rem',
            padding: '1rem 2.5rem',
            fontSize: '1.1rem',
            fontWeight: '600',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            background: 'linear-gradient(135deg, #7c5cff 0%, #a78bfa 100%)',
            color: '#fff',
            boxShadow: '0 8px 20px rgba(124, 92, 255, 0.4)',
          }}
        >
          Get Started Free
        </button>
      </section>

      {/* Footer CTA */}
      <section style={{
        background: 'rgba(124, 92, 255, 0.1)',
        borderTop: '1px solid rgba(124, 92, 255, 0.2)',
        padding: '3rem 2rem',
        marginTop: '4rem',
        textAlign: 'center'
      }}>
        <h2 style={{
          fontSize: '2rem',
          fontWeight: '700',
          marginBottom: '1rem',
          color: '#fff'
        }}>
          Ready to Transform Your Photography Business?
        </h2>
        <p style={{
          fontSize: '1.2rem',
          color: '#a0a0a0',
          marginBottom: '2rem'
        }}>
          Join hundreds of photographers already using our platform
        </p>
        <button
          onClick={() => navigate('/studio-signup')}
          style={{
            padding: '1rem 2.5rem',
            fontSize: '1.2rem',
            fontWeight: '600',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            background: 'linear-gradient(135deg, #7c5cff 0%, #a78bfa 100%)',
            color: '#fff',
            boxShadow: '0 8px 20px rgba(124, 92, 255, 0.4)',
          }}
        >
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
