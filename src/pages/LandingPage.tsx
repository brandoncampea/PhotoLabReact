import React from 'react';

type Photo = any;
import { useNavigate } from 'react-router-dom';

export default function LandingPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = React.useState('');
  const [studioSuggestions, setStudioSuggestions] = React.useState<any[]>([]);
  const [albumSuggestions, setAlbumSuggestions] = React.useState<any[]>([]);
  const [photoSuggestions, setPhotoSuggestions] = React.useState<Photo[]>([]);
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = React.useState(false);
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
    setShowDropdown(false);
  };

  React.useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setStudioSuggestions([]);
      setAlbumSuggestions([]);
      setPhotoSuggestions([]);
      setShowDropdown(false);
      return;
    }
    setLoadingSuggestions(true);
    fetch(`/api/public-search?q=${encodeURIComponent(searchQuery.trim())}`)
      .then(res => res.json())
      .then(data => {
        setStudioSuggestions(data.studios || []);
        setAlbumSuggestions(data.albums || []);
        setPhotoSuggestions(data.photos || []);
        setShowDropdown(true);
      })
      .catch(() => {
        setStudioSuggestions([]);
        setAlbumSuggestions([]);
        setPhotoSuggestions([]);
      })
      .finally(() => setLoadingSuggestions(false));
  }, [searchQuery]);
  const [plans, setPlans] = React.useState<any[]>([]);
  const [plansLoading, setPlansLoading] = React.useState(true);
  const [plansError, setPlansError] = React.useState('');

  React.useEffect(() => {
    async function fetchPlans() {
      setPlansLoading(true);
      setPlansError('');
      try {
        const apiUrl = import.meta.env.VITE_API_URL || '/api';
        // Fetch both monthly and yearly plans
        const monthlyRes = await fetch(`${apiUrl}/subscription-plans?frequency=monthly`);
        const yearlyRes = await fetch(`${apiUrl}/subscription-plans?frequency=yearly`);
        if (!monthlyRes.ok && !yearlyRes.ok) throw new Error('Failed to fetch subscription plans');
        const monthlyData = monthlyRes.ok ? await monthlyRes.json() : [];
        const yearlyData = yearlyRes.ok ? await yearlyRes.json() : [];
        setPlans([...monthlyData, ...yearlyData]);
      } catch (err) {
        setPlansError('Failed to load plans');
      } finally {
        setPlansLoading(false);
      }
    }
    fetchPlans();
  }, []);

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
        <form className="search-filter-bar landing-search-form" onSubmit={handleSearchSubmit} autoComplete="off">
          <div className="search-box landing-search-box" style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search photos by filename, camera, player, etc..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="search-input landing-search-input"
              onFocus={() => setShowDropdown((studioSuggestions.length + albumSuggestions.length + photoSuggestions.length) > 0)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            />
            {showDropdown && (studioSuggestions.length > 0 || albumSuggestions.length > 0 || photoSuggestions.length > 0) && (
              <div className="autocomplete-dropdown" style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                width: '100%',
                background: '#222',
                color: '#fff',
                borderRadius: '0.75rem',
                boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                zIndex: 10,
                maxHeight: '320px',
                overflowY: 'auto',
                marginTop: '0.5rem',
                border: '1px solid #333',
              }}>
                {loadingSuggestions && <div style={{ padding: '1rem', textAlign: 'center', color: '#aaa' }}>Loading...</div>}
                {!loadingSuggestions && studioSuggestions.length === 0 && albumSuggestions.length === 0 && photoSuggestions.length === 0 && <div style={{ padding: '1rem', textAlign: 'center', color: '#aaa' }}>No results found</div>}
                {!loadingSuggestions && studioSuggestions.length > 0 && (
                  <div style={{ padding: '0.5rem 1rem', fontWeight: 700, color: '#fff', fontSize: '1rem' }}>Studios</div>
                )}
                {!loadingSuggestions && studioSuggestions.map(studio => (
                  <div
                    key={studio.id}
                    className="autocomplete-item"
                    style={{ display: 'flex', alignItems: 'center', padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: '1px solid #333' }}
                    onMouseDown={() => {
                      setSearchQuery(studio.name);
                      setShowDropdown(false);
                      navigate(studio.url);
                    }}
                  >
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#4169E1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.2rem', marginRight: 12 }}>{studio.initials}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '1rem', color: '#fff' }}>{studio.name}</div>
                      <div style={{ fontSize: '0.85rem', color: '#aaa' }}>{studio.publicSlug}</div>
                    </div>
                  </div>
                ))}
                {!loadingSuggestions && albumSuggestions.length > 0 && (
                  <div style={{ padding: '0.5rem 1rem', fontWeight: 700, color: '#fff', fontSize: '1rem' }}>Albums</div>
                )}
                {!loadingSuggestions && albumSuggestions.map(album => (
                  <div
                    key={album.id}
                    className="autocomplete-item"
                    style={{ display: 'flex', alignItems: 'center', padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: '1px solid #333' }}
                    onMouseDown={() => {
                      setSearchQuery(album.name);
                      setShowDropdown(false);
                      navigate(album.url);
                    }}
                  >
                    {album.coverImageUrl && <img src={album.coverImageUrl} alt={album.name} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: '0.5rem', marginRight: 12, border: '1px solid #444' }} />}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '1rem', color: '#fff' }}>{album.name}</div>
                      <div style={{ fontSize: '0.85rem', color: '#aaa' }}>{album.studioName}</div>
                      <div style={{ fontSize: '0.8rem', color: '#4169E1' }}>Photos: {album.photoCount}</div>
                    </div>
                  </div>
                ))}
                {!loadingSuggestions && photoSuggestions.length > 0 && (
                  <div style={{ padding: '0.5rem 1rem', fontWeight: 700, color: '#fff', fontSize: '1rem' }}>Photos</div>
                )}
                {!loadingSuggestions && photoSuggestions.map(photo => (
                  <div
                    key={photo.id}
                    className="autocomplete-item"
                    style={{ display: 'flex', alignItems: 'center', padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: '1px solid #333' }}
                    onMouseDown={() => {
                      setSearchQuery(photo.fileName);
                      setShowDropdown(false);
                      navigate(`/search?q=${encodeURIComponent(photo.fileName)}`);
                    }}
                  >
                    <img src={photo.thumbnailUrl} alt={photo.fileName} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: '0.5rem', marginRight: 12, border: '1px solid #444' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '1rem', color: '#fff' }}>{photo.fileName}</div>
                      <div style={{ fontSize: '0.85rem', color: '#aaa' }}>{photo.albumName} {photo.studioName}</div>
                      {photo.playerNames && <div style={{ fontSize: '0.8rem', color: '#4169E1' }}>Players: {photo.playerNames}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="btn btn-primary landing-search-btn" type="submit">Search</button>
        </form>
        <div className="landing-btn-row">
          <button className="btn btn-primary" onClick={() => navigate('/studio-signup')}>
            🚀 Start Your Studio Free Trial
          </button>
          <button className="btn btn-outline-primary" onClick={() => navigate('/login')}>
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
            plans.map((plan, idx) => {
              // Compose a unique key for each plan
              const uniqueKey = `${plan.id || ''}-${plan.name || ''}`;

              // Use monthly_price and yearly_price directly from API
              const monthlyPrice = plan.monthly_price ? `$${plan.monthly_price.toFixed(2)}` : '';
              const yearlyPrice = plan.yearly_price ? `$${plan.yearly_price.toFixed(2)}` : '';
              let yearlyDiscount = '';
              if (plan.monthly_price && plan.yearly_price) {
                const normalYear = plan.monthly_price * 12;
                if (plan.yearly_price < normalYear) {
                  yearlyDiscount = `Save $${(normalYear - plan.yearly_price).toFixed(2)} yearly`;
                }
              }

              // Only render one card per plan id
              if (idx === plans.findIndex(p => p.id === plan.id)) {
                return (
                  <PricingCard
                    key={uniqueKey}
                    name={plan.name || plan.nickname || 'Plan'}
                    price={monthlyPrice}
                    yearlyPrice={yearlyPrice}
                    yearlyDiscount={yearlyDiscount}
                    features={plan.features || plan.metadata?.features || []}
                    highlighted={plan.metadata?.highlighted || false}
                  />
                );
              }
              return null;
            })
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
        <p className="landing-footer-desc">
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

function PricingCard({ name, price, yearlyPrice, yearlyDiscount, features, highlighted }: {
  name: string;
  price: string;
  yearlyPrice?: string;
  yearlyDiscount?: string;
  features: string[];
  highlighted?: boolean;
}) {
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
      {yearlyPrice && (
        <div className="pricing-card-yearly">
          <span className="pricing-card-yearly-label">Yearly:</span> {yearlyPrice} <span className="pricing-card-yearly-unit">/yr</span>
          {yearlyDiscount && <span className="pricing-card-yearly-discount">{yearlyDiscount}</span>}
        </div>
      )}
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