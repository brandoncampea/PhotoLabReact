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

interface LandingStudioResult {
  id: number;
  name: string;
  initials?: string;
  publicSlug: string;
  url: string;
}

interface LandingAlbumResult {
  id: number;
  name: string;
  description?: string;
  photoCount: number;
  studioName: string;
  studioSlug: string;
  coverImageUrl?: string | null;
  url: string;
}

interface LandingPhotoResult {
  id: number;
  fileName: string;
  description?: string;
  thumbnailUrl?: string;
  albumId: number;
  albumName: string;
  studioName: string;
  studioSlug: string;
  url: string;
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [plans, setPlans] = React.useState<LandingSubscriptionPlan[]>([]);
  const [plansLoading, setPlansLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [searchError, setSearchError] = React.useState('');
  const [studioResults, setStudioResults] = React.useState<LandingStudioResult[]>([]);
  const [albumResults, setAlbumResults] = React.useState<LandingAlbumResult[]>([]);
  const [photoResults, setPhotoResults] = React.useState<LandingPhotoResult[]>([]);

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

  React.useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setStudioResults([]);
      setAlbumResults([]);
      setPhotoResults([]);
      setSearchError('');
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        setSearchLoading(true);
        setSearchError('');
        const response = await fetch(`/api/public-search?q=${encodeURIComponent(trimmed)}`);
        if (!response.ok) {
          throw new Error('Search failed');
        }

        const data = await response.json();
        if (cancelled) return;

        setStudioResults(Array.isArray(data?.studios) ? data.studios : []);
        setAlbumResults(Array.isArray(data?.albums) ? data.albums : []);
        setPhotoResults(Array.isArray(data?.photos) ? data.photos : []);
      } catch (error) {
        if (!cancelled) {
          setSearchError('Could not search right now');
          setStudioResults([]);
          setAlbumResults([]);
          setPhotoResults([]);
        }
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [searchQuery]);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f1115 0%, #1a1d24 50%, #0f1115 100%)',
      color: '#fff',
      paddingTop: '4rem'
    }}>
      {/* Hero Section */}
            {/* Info for Customers and Studios */}
            <section style={{
              maxWidth: '1200px',
              margin: '0 auto',
              padding: '2rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
              gap: '2rem',
              marginBottom: '2rem',
            }}>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '2rem', boxShadow: '0 2px 16px rgba(124,92,255,0.08)' }}>
                <h2 style={{ color: '#7c5cff', fontWeight: 700, fontSize: '2rem', marginBottom: '1rem' }}>For Customers</h2>
                <ul style={{ color: '#fff', fontSize: '1.1rem', lineHeight: '1.7', paddingLeft: '1.2rem' }}>
                  <li>Browse and view your photo galleries online</li>
                  <li>Order prints, packages, and digital downloads</li>
                  <li>Secure checkout and fast fulfillment</li>
                  <li>Access albums from any device, anytime</li>
                  <li>Receive order updates and shipping notifications</li>
                </ul>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '2rem', boxShadow: '0 2px 16px rgba(124,92,255,0.08)' }}>
                <h2 style={{ color: '#7c5cff', fontWeight: 700, fontSize: '2rem', marginBottom: '1rem' }}>For Studios</h2>
                <ul style={{ color: '#fff', fontSize: '1.1rem', lineHeight: '1.7', paddingLeft: '1.2rem' }}>
                  <li>Easy album creation and client management</li>
                  <li>Custom pricing, packages, and discounts</li>
                  <li>Integrated lab fulfillment (WHCC, Mpix, etc.)</li>
                  <li>Batch shipping and order tracking</li>
                  <li>Business analytics and reporting</li>
                  <li>Secure payments with Stripe</li>
                </ul>
              </div>
            </section>
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

      {/* Public Search Section */}
      <section
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '0 2rem 2rem',
        }}
      >
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            padding: '1.25rem',
          }}
        >
          <h3 style={{ margin: '0 0 0.75rem 0' }}>Find a studio, album, or photo</h3>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by studio name, album name, or photo filename"
            style={{
              width: '100%',
              padding: '0.9rem 1rem',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: 'rgba(15, 17, 21, 0.8)',
              color: '#fff',
              fontSize: '1rem',
            }}
          />
          <div style={{ marginTop: '0.5rem', color: '#a0a0a0', fontSize: '0.9rem' }}>
            Type at least 2 characters.
          </div>

          {searchLoading && <div style={{ marginTop: '1rem', color: '#a0a0a0' }}>Searching…</div>}
          {searchError && <div style={{ marginTop: '1rem', color: '#fca5a5' }}>{searchError}</div>}

          {!searchLoading && searchQuery.trim().length >= 2 && !searchError && (
            <div style={{ marginTop: '1rem', display: 'grid', gap: '1rem' }}>
              <SearchResultGroup
                title="Studios"
                emptyLabel="No studios found"
                items={studioResults.map((studio) => ({
                  key: `studio-${studio.id}`,
                  title: studio.name,
                  subtitle: `/s/${studio.publicSlug}`,
                  badge: studio.initials || 'S',
                  onClick: () => navigate(studio.url),
                }))}
              />

              <SearchResultGroup
                title="Albums"
                emptyLabel="No albums found"
                items={albumResults.map((album) => ({
                  key: `album-${album.id}`,
                  title: album.name,
                  subtitle: `${album.studioName} • ${album.photoCount} photos`,
                  imageUrl: album.coverImageUrl || undefined,
                  onClick: () => navigate(album.url),
                }))}
              />

              <SearchResultGroup
                title="Photos"
                emptyLabel="No photos found"
                items={photoResults.map((photo) => ({
                  key: `photo-${photo.id}`,
                  title: photo.fileName,
                  subtitle: `${photo.studioName} • ${photo.albumName}`,
                  imageUrl: photo.thumbnailUrl,
                  onClick: () => navigate(photo.url),
                }))}
              />
            </div>
          )}
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
          <FeatureCard
            icon="🖼️"
            title="Photo Watermarking"
            description="Protect your work with automatic watermarks on preview images until orders are fulfilled"
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

function SearchResultGroup({
  title,
  emptyLabel,
  items,
}: {
  title: string;
  emptyLabel: string;
  items: Array<{ key: string; title: string; subtitle: string; onClick: () => void; imageUrl?: string; badge?: string }>;
}) {
  return (
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '10px',
        padding: '0.9rem',
      }}
    >
      <h4 style={{ margin: '0 0 0.75rem 0', color: '#e5e7eb' }}>{title}</h4>
      {items.length === 0 ? (
        <div style={{ color: '#9ca3af', fontSize: '0.9rem' }}>{emptyLabel}</div>
      ) : (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {items.slice(0, 6).map((item) => (
            <button
              key={item.key}
              onClick={item.onClick}
              style={{
                textAlign: 'left',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '8px',
                background: 'rgba(15, 17, 21, 0.7)',
                color: '#fff',
                padding: '0.65rem 0.75rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
              }}
            >
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '8px',
                    objectFit: 'cover',
                    border: '1px solid rgba(255,255,255,0.15)',
                    flexShrink: 0,
                  }}
                />
              ) : item.badge ? (
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '999px',
                    background: 'linear-gradient(135deg, #7c5cff 0%, #a78bfa 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    color: '#fff',
                    flexShrink: 0,
                  }}
                >
                  {item.badge}
                </div>
              ) : null}
              <div>
                <div style={{ fontWeight: 600 }}>{item.title}</div>
                <div style={{ fontSize: '0.85rem', color: '#a0a0a0' }}>{item.subtitle}</div>
              </div>
            </button>
          ))}
        </div>
      )}
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
