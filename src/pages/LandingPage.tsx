import React from 'react';
import './LandingPage.css';
import { Photo } from '../types';
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
    if (searchQuery.trim()) navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    setShowDropdown(false);
  };

  React.useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setStudioSuggestions([]); setAlbumSuggestions([]); setPhotoSuggestions([]); setShowDropdown(false); return;
    }
    setLoadingSuggestions(true);
    fetch(`/api/public-search?q=${encodeURIComponent(searchQuery.trim())}`)
      .then(r => r.json())
      .then(data => { setStudioSuggestions(data.studios || []); setAlbumSuggestions(data.albums || []); setPhotoSuggestions(data.photos || []); setShowDropdown(true); })
      .catch(() => { setStudioSuggestions([]); setAlbumSuggestions([]); setPhotoSuggestions([]); })
      .finally(() => setLoadingSuggestions(false));
  }, [searchQuery]);

  const [plans, setPlans] = React.useState<any[]>([]);
  const [plansLoading, setPlansLoading] = React.useState(true);
  const [plansError, setPlansError] = React.useState('');
  const [pricingCycle, setPricingCycle] = React.useState<'monthly' | 'yearly'>('monthly');

  React.useEffect(() => {
    async function fetchPlans() {
      setPlansLoading(true); setPlansError('');
      try {
        const base = import.meta.env.VITE_API_URL || '/api';
        const [mRes, yRes] = await Promise.all([fetch(`${base}/subscription-plans?frequency=monthly`), fetch(`${base}/subscription-plans?frequency=yearly`)]);
        const mData = mRes.ok ? await mRes.json() : [];
        const yData = yRes.ok ? await yRes.json() : [];
        setPlans([...mData, ...yData]);
      } catch { setPlansError('Failed to load plans'); }
      finally { setPlansLoading(false); }
    }
    fetchPlans();
  }, []);

  const hasDropdown = showDropdown && (studioSuggestions.length > 0 || albumSuggestions.length > 0 || photoSuggestions.length > 0);

  return (
    <div className="main-content dark-bg landing-main">

      {/* ── HERO ── */}
      <section className="landing-hero-section">
        <div style={{ display: 'inline-block', background: 'rgba(124,92,255,0.15)', border: '1px solid rgba(124,92,255,0.35)', borderRadius: 20, padding: '5px 16px', fontSize: '0.82rem', fontWeight: 700, color: '#a78bfa', marginBottom: '1.25rem', letterSpacing: '0.04em' }}>
          THE ALL-IN-ONE PLATFORM FOR PHOTOGRAPHY STUDIOS
        </div>
        <h1 className="landing-title gradient-text">
          Book More Sessions.<br />Sell More Photos.<br />Grow Your Studio.
        </h1>
        <p className="landing-desc">
          Everything you need to run a professional photography studio — online booking with deposits, photo sales, player tagging, lab ordering, and a branded storefront your clients will love.
        </p>

        {/* Search */}
        <form onSubmit={handleSearchSubmit} style={{ position: 'relative', maxWidth: 520, margin: '1.5rem auto 0 auto', width: '100%' }} autoComplete="off">
          <input
            type="text"
            className="form-control landing-search-input"
            placeholder="Search studios, albums, players, photos..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => { if (searchQuery.trim().length >= 2 && hasDropdown) setShowDropdown(true); }}
            style={{ paddingRight: 44 }}
          />
          {hasDropdown && (
            <div className="autocomplete-dropdown" style={{ position: 'absolute', top: '100%', left: 0, width: '100%', background: '#222', color: '#fff', borderRadius: '0.75rem', boxShadow: '0 4px 16px rgba(0,0,0,0.25)', zIndex: 10, maxHeight: '320px', overflowY: 'auto', marginTop: '0.5rem', border: '1px solid #333' }}>
              {loadingSuggestions && <div style={{ padding: '1rem', textAlign: 'center', color: '#aaa' }}>Loading...</div>}
              {!loadingSuggestions && studioSuggestions.length === 0 && albumSuggestions.length === 0 && photoSuggestions.length === 0 && <div style={{ padding: '1rem', textAlign: 'center', color: '#aaa' }}>No results found</div>}
              {!loadingSuggestions && studioSuggestions.length > 0 && <div style={{ padding: '0.5rem 1rem', fontWeight: 700, color: '#fff', fontSize: '1rem' }}>Studios</div>}
              {!loadingSuggestions && studioSuggestions.map(s => (
                <div key={s.id} className="autocomplete-item" style={{ display: 'flex', alignItems: 'center', padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: '1px solid #333' }} onMouseDown={() => { setSearchQuery(s.name); setShowDropdown(false); navigate(s.url); }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#4169E1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.2rem', marginRight: 12 }}>{s.initials}</div>
                  <div><div style={{ fontWeight: 600, fontSize: '1rem', color: '#fff' }}>{s.name}</div><div style={{ fontSize: '0.85rem', color: '#aaa' }}>{s.publicSlug}</div></div>
                </div>
              ))}
              {!loadingSuggestions && albumSuggestions.length > 0 && <div style={{ padding: '0.5rem 1rem', fontWeight: 700, color: '#fff', fontSize: '1rem' }}>Albums</div>}
              {!loadingSuggestions && albumSuggestions.map(a => (
                <div key={`album-${a.id}`} className="autocomplete-item" style={{ display: 'flex', alignItems: 'flex-start', padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: '1px solid #333', gap: 12 }} onMouseDown={() => { setSearchQuery(a.name); setShowDropdown(false); navigate(a.url); }}>
                  <div style={{ width: 48, height: 48, borderRadius: 10, background: a.coverImageUrl ? `center/cover no-repeat url(${a.coverImageUrl})` : '#312e81', flex: '0 0 48px', border: '1px solid rgba(255,255,255,0.12)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: '#fff' }}>{a.name}</div>
                    <div style={{ fontSize: '0.85rem', color: '#aaa', marginTop: 2 }}>{a.studioName}{a.photoCount ? ` • ${a.photoCount} photos` : ''}</div>
                  </div>
                </div>
              ))}
              {!loadingSuggestions && photoSuggestions.length > 0 && <div style={{ padding: '0.5rem 1rem', fontWeight: 700, color: '#fff', fontSize: '1rem' }}>Photos</div>}
              {!loadingSuggestions && photoSuggestions.map(p => (
                <div key={`photo-${p.id}`} className="autocomplete-item" style={{ display: 'flex', alignItems: 'center', padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: '1px solid #333', gap: 12 }} onMouseDown={() => { setSearchQuery(p.fileName); setShowDropdown(false); navigate(`/albums/${p.albumId}?photo=${p.id}&studioSlug=${encodeURIComponent((p as any).studioSlug || '')}`); }}>
                  <img src={p.thumbnailUrl} alt={p.fileName} style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', marginRight: 12, background: '#312e81', border: '1px solid rgba(255,255,255,0.12)' }} />
                  <div><div style={{ fontWeight: 600, color: '#fff', wordBreak: 'break-all' }}>{p.fileName}</div><div style={{ fontSize: '0.85rem', color: '#aaa', marginTop: 2 }}>{(p as any).albumName} &bull; {(p as any).studioName}</div></div>
                </div>
              ))}
            </div>
          )}
          <button className="btn btn-primary landing-search-btn" type="submit">Search</button>
        </form>

        <div className="landing-btn-row">
          <button className="btn btn-primary" style={{ fontSize: '1rem', padding: '0.75rem 2rem' }} onClick={() => navigate('/studio-signup')}>
            Start Free Trial
          </button>
          <button className="btn btn-outline-primary" style={{ fontSize: '1rem', padding: '0.75rem 2rem' }} onClick={() => navigate('/login')}>
            Studio Login
          </button>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section style={{ maxWidth: 900, margin: '0 auto 4rem', padding: '0 1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 1, background: 'rgba(124,92,255,0.15)', borderRadius: 16, border: '1px solid rgba(124,92,255,0.2)', overflow: 'hidden' }}>
          {[
            { value: 'Booking + Sales', label: 'All-in-one platform' },
            { value: 'Retainer Deposits', label: 'Secure sessions upfront' },
            { value: 'Instant Search', label: 'By name or player tag' },
            { value: 'You Set Your Prices', label: 'Full control over your rates' },
          ].map((stat, i) => (
            <div key={i} style={{ padding: '1.25rem 1.5rem', textAlign: 'center', background: i % 2 === 0 ? 'rgba(0,0,0,0.15)' : 'transparent' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#a78bfa', marginBottom: 4 }}>{stat.value}</div>
              <div style={{ fontSize: '0.82rem', color: '#6b6b80', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURE: BOOKING & SCHEDULING ── */}
      <section style={{ maxWidth: 1100, margin: '0 auto 5rem', padding: '0 1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'inline-block', background: 'rgba(124,92,255,0.15)', border: '1px solid rgba(124,92,255,0.3)', borderRadius: 20, padding: '4px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#a78bfa', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>New Feature</div>
            <h2 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 800, color: '#fff', lineHeight: 1.25, marginBottom: '1rem' }}>
              Online Booking That<br />Works While You Shoot
            </h2>
            <p style={{ color: '#9ca3af', fontSize: '1rem', lineHeight: 1.75, marginBottom: '1.5rem' }}>
              Customers browse your session types, pick a time, and book — you approve and collect a deposit automatically. No back-and-forth emails, no no-shows.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[
                ['Retainer / deposit payments', 'Collect a deposit at approval via Stripe — customers only lock in a date when they pay.'],
                ['Approval workflow', 'Review every request before confirming. Reject with a reason, edit details, or cancel any time.'],
                ['Session type photo cards', 'Show your work. Each session type gets a cover photo, description, duration, and price — just like Pixieset.'],
                ['Balance collection', 'Send a Stripe payment link for the remaining balance or mark it paid cash/check — no platform fee.'],
                ['Email notifications', 'Customers get booking confirmation, approval, and payment request emails automatically.'],
              ].map(([title, detail]) => (
                <li key={title} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: 'rgba(124,92,255,0.2)', border: '1px solid rgba(124,92,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2, fontSize: '0.7rem', color: '#a78bfa', fontWeight: 900 }}>✓</span>
                  <div><span style={{ color: '#e0e0e0', fontWeight: 700 }}>{title} — </span><span style={{ color: '#9ca3af', fontSize: '0.93rem' }}>{detail}</span></div>
                </li>
              ))}
            </ul>
            <button className="btn btn-primary" onClick={() => navigate('/studio-signup')} style={{ fontSize: '0.95rem', padding: '0.7rem 1.75rem' }}>Set Up Booking Free</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {[
              { icon: '📸', title: 'Media Day', price: '$250', duration: '2 hrs', retainer: '$100 deposit', color: 'rgba(124,92,255,0.12)', border: 'rgba(124,92,255,0.3)' },
              { icon: '🏆', title: 'Team Package', price: '$180', duration: '1 hr', retainer: '$75 deposit', color: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.25)' },
              { icon: '👶', title: 'Mini Session', price: '$95', duration: '30 min', retainer: '$50 deposit', color: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)' },
              { icon: '🎓', title: 'Senior Portrait', price: '$350', duration: '3 hrs', retainer: '$150 deposit', color: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)' },
            ].map(card => (
              <div key={card.title} style={{ background: card.color, border: `1px solid ${card.border}`, borderRadius: 14, padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div style={{ fontSize: '1.8rem' }}>{card.icon}</div>
                <div style={{ fontWeight: 800, color: '#e0e0e0', fontSize: '0.95rem' }}>{card.title}</div>
                <div style={{ color: '#6b6b80', fontSize: '0.78rem' }}>{card.duration}</div>
                <div style={{ color: '#a78bfa', fontWeight: 700, fontSize: '1rem' }}>{card.price}</div>
                <div style={{ display: 'inline-block', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 20, padding: '2px 8px', fontSize: '0.72rem', color: '#22c55e', fontWeight: 700 }}>{card.retainer}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURE: PHOTO SALES ── */}
      <section style={{ maxWidth: 1100, margin: '0 auto 5rem', padding: '0 1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {/* Mock photo gallery */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.6rem' }}>
              <div style={{ background: 'linear-gradient(135deg, #1e1e2e, #2d1f4e)', borderRadius: 12, aspectRatio: '16/10', border: '1px solid rgba(124,92,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' }}>📷</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <div style={{ background: 'linear-gradient(135deg, #1e2a1e, #1a3d2a)', borderRadius: 10, flex: 1, border: '1px solid rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>🖼️</div>
                <div style={{ background: 'linear-gradient(135deg, #1e2535, #1a2a3d)', borderRadius: 10, flex: 1, border: '1px solid rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>🏅</div>
              </div>
            </div>
            <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.25rem' }}>🛒</span>
              <div>
                <div style={{ color: '#22c55e', fontWeight: 700, fontSize: '0.88rem' }}>New Order — Alex Johnson</div>
                <div style={{ color: '#6b6b80', fontSize: '0.78rem' }}>5×7 print + digital download · $34.99</div>
              </div>
              <div style={{ marginLeft: 'auto', color: '#22c55e', fontWeight: 800, fontSize: '1rem' }}>+$34.99</div>
            </div>
          </div>
          <div>
            <h2 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 800, color: '#fff', lineHeight: 1.25, marginBottom: '1rem' }}>
              Turn Every Session Into<br />Passive Photo Revenue
            </h2>
            <p style={{ color: '#9ca3af', fontSize: '1rem', lineHeight: 1.75, marginBottom: '1.5rem' }}>
              Upload your gallery after a session and let customers find and buy their own photos — without you lifting a finger. Prints, digitals, and lab products all in one storefront.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[
                ['Branded album storefront', 'Your own URL (/studio/your-name) with your branding — not a generic marketplace.'],
                ['Print & digital products', 'Offer 4×6 prints, canvas, digital downloads, or custom lab products at your prices.'],
                ['Secure image delivery', 'High-res images stored on Azure — fast, secure, and always available to customers.'],
                ['SmugMug import', 'Already on SmugMug? Import your entire catalog in one click — albums, photos, and all.'],
              ].map(([title, detail]) => (
                <li key={title} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2, fontSize: '0.7rem', color: '#22c55e', fontWeight: 900 }}>✓</span>
                  <div><span style={{ color: '#e0e0e0', fontWeight: 700 }}>{title} — </span><span style={{ color: '#9ca3af', fontSize: '0.93rem' }}>{detail}</span></div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── FEATURE: PLAYER TAGGING ── */}
      <section style={{ background: 'linear-gradient(135deg, rgba(124,92,255,0.07) 0%, rgba(59,130,246,0.07) 100%)', border: '1px solid rgba(124,92,255,0.12)', borderRadius: 20, maxWidth: 1100, margin: '0 auto 5rem', padding: '3rem 2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'inline-block', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 20, padding: '4px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#60a5fa', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sports Photography</div>
            <h2 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 800, color: '#fff', lineHeight: 1.25, marginBottom: '1rem' }}>
              Parents Find Their Kid's<br />Photos in Seconds
            </h2>
            <p style={{ color: '#9ca3af', fontSize: '1rem', lineHeight: 1.75, marginBottom: '1.5rem' }}>
              Tag players by name in photos. Parents search the name and see every photo of their child instantly — no scrolling through hundreds of images. More findability = more sales.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[
                ['Name-based photo search', 'Customers type a player\'s name and get their photos immediately — works across all your albums.'],
                ['Watchlist & notifications', 'Customers can watchlist a player and get notified when new photos are uploaded — drives repeat purchases.'],
                ['Bulk tagging tools', 'Tag multiple players in team photos at once, and suggest tags based on existing players.'],
                ['School & team organization', 'Organize albums by school, sport, or season — easy to browse for coaches and parents alike.'],
              ].map(([title, detail]) => (
                <li key={title} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2, fontSize: '0.7rem', color: '#60a5fa', fontWeight: 900 }}>✓</span>
                  <div><span style={{ color: '#e0e0e0', fontWeight: 700 }}>{title} — </span><span style={{ color: '#9ca3af', fontSize: '0.93rem' }}>{detail}</span></div>
                </li>
              ))}
            </ul>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ background: '#13131c', border: '1px solid #2e2e3e', borderRadius: 12, padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #7c5cff, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: '0.9rem', flexShrink: 0 }}>MJ</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#e0e0e0', fontWeight: 700, fontSize: '0.9rem' }}>Michael Johnson</div>
                <div style={{ color: '#6b6b80', fontSize: '0.78rem' }}>Riverside HS · Varsity Basketball</div>
              </div>
              <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 6, padding: '3px 10px', fontSize: '0.75rem', color: '#22c55e', fontWeight: 700 }}>12 photos</div>
            </div>
            {['Emma Rodriguez', 'Tyler Williams', 'Sophia Chen'].map((name, i) => (
              <div key={name} style={{ background: '#13131c', border: '1px solid #2e2e3e', borderRadius: 10, padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: ['rgba(245,158,11,0.3)', 'rgba(236,72,153,0.3)', 'rgba(34,197,94,0.3)'][i], display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: '0.75rem', flexShrink: 0 }}>{name.split(' ').map(n => n[0]).join('')}</div>
                <div style={{ flex: 1, color: '#bdbdbd', fontSize: '0.85rem', fontWeight: 600 }}>{name}</div>
                <div style={{ color: '#6b6b80', fontSize: '0.75rem' }}>{[8, 14, 6][i]} photos</div>
              </div>
            ))}
            <div style={{ background: 'rgba(124,92,255,0.08)', border: '1px solid rgba(124,92,255,0.2)', borderRadius: 10, padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1rem' }}>🔔</span>
              <div style={{ color: '#a78bfa', fontSize: '0.82rem', fontWeight: 600 }}>3 customers watching this album</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURE: FAVORITES & ORDERING ── */}
      <section style={{ maxWidth: 1100, margin: '0 auto 5rem', padding: '0 1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', alignItems: 'center' }}>
          {/* Visual */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Gallery strip with hearts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              {[
                { hearted: true,  label: '#24' },
                { hearted: false, label: '#25' },
                { hearted: true,  label: '#26' },
                { hearted: true,  label: '#27' },
                { hearted: false, label: '#28' },
                { hearted: true,  label: '#29' },
              ].map((p, i) => (
                <div key={i} style={{ position: 'relative', aspectRatio: '4/3', background: `linear-gradient(135deg, ${['#1a1a2e','#1e2a1e','#1e1a2e','#2a1e1e','#1a2028','#2a1e28'][i]}, ${['#2d1f4e','#1a3d2a','#2e2d50','#4e1f1f','#1a2535','#3d1a2a'][i]})`, borderRadius: 10, border: p.hearted ? '1.5px solid rgba(244,114,182,0.45)' : '1px solid rgba(255,255,255,0.07)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
                  {['📸','🏅','🖼️','🎓','📷','🏆'][i]}
                  <div style={{ position: 'absolute', top: 5, right: 6, fontSize: '1rem', color: p.hearted ? '#f472b6' : 'rgba(255,255,255,0.25)', textShadow: p.hearted ? '0 0 8px rgba(244,114,182,0.6)' : 'none' }}>
                    {p.hearted ? '♥' : '♡'}
                  </div>
                  <div style={{ position: 'absolute', bottom: 4, left: 6, fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>{p.label}</div>
                </div>
              ))}
            </div>

            {/* Favorites bar */}
            <div style={{ background: 'rgba(244,114,182,0.08)', border: '1px solid rgba(244,114,182,0.25)', borderRadius: 12, padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.1rem' }}>♥</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#f472b6', fontWeight: 700, fontSize: '0.88rem' }}>4 photos saved</div>
                <div style={{ color: '#6b6b80', fontSize: '0.75rem' }}>Tap to share this list with family</div>
              </div>
              <div style={{ background: 'rgba(244,114,182,0.15)', border: '1px solid rgba(244,114,182,0.3)', borderRadius: 8, padding: '4px 12px', fontSize: '0.75rem', color: '#f472b6', fontWeight: 700, cursor: 'pointer' }}>Save & Share</div>
            </div>

            {/* Email save prompt */}
            <div style={{ background: 'rgba(124,92,255,0.07)', border: '1px solid rgba(124,92,255,0.2)', borderRadius: 12, padding: '0.85rem 1rem' }}>
              <div style={{ color: '#e0e0e0', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.5rem' }}>Save your favorites</div>
              <div style={{ color: '#6b6b80', fontSize: '0.78rem', marginBottom: '0.6rem' }}>Enter your email and we'll send you a link so you can come back to your saved photos anytime.</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '6px 10px', fontSize: '0.78rem', color: '#6b6b80' }}>your@email.com</div>
                <div style={{ background: '#7c5cff', borderRadius: 7, padding: '6px 14px', fontSize: '0.78rem', color: '#fff', fontWeight: 700 }}>Send Link</div>
              </div>
            </div>

            {/* Order ready state */}
            <div style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12, padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.1rem' }}>🛒</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#4ade80', fontWeight: 700, fontSize: '0.88rem' }}>Ready to order your 4 favorites</div>
                <div style={{ color: '#6b6b80', fontSize: '0.75rem' }}>Everything you saved is still right here</div>
              </div>
              <div style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, padding: '4px 12px', fontSize: '0.75rem', color: '#4ade80', fontWeight: 700 }}>Order Now</div>
            </div>
          </div>

          {/* Copy */}
          <div>
            <div style={{ display: 'inline-block', background: 'rgba(244,114,182,0.12)', border: '1px solid rgba(244,114,182,0.3)', borderRadius: 20, padding: '4px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#f472b6', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customer Experience</div>
            <h2 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 800, color: '#fff', lineHeight: 1.25, marginBottom: '1rem' }}>
              Let Them Browse First.<br />They'll Order When<br />They're Sure.
            </h2>
            <p style={{ color: '#9ca3af', fontSize: '1rem', lineHeight: 1.8, marginBottom: '1.5rem' }}>
              Buying photos isn't an impulse decision. Customers want to browse, loop in grandma, sleep on it. Our favorites system is built for exactly that — they heart photos as they go, save the list to their email, share it with family, and come back when they're ready. No account required. No lost picks. No starting over.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[
                ['No account needed', 'Customers heart photos as they browse — no sign-up, no friction, nothing between them and your photos.'],
                ['Save the link, come back anytime', 'Enter an email and get a permanent link to your saved picks — it works for weeks and survives closing the tab.'],
                ['Share with family before ordering', 'One link, everyone votes. Grandparents can see the shortlist before anyone opens their wallet.'],
                ['Order everything in one shot', 'Filter to favorites, pick sizes and products for each, and check out — all without losing track of a single photo.'],
              ].map(([title, detail]) => (
                <li key={title} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: 'rgba(244,114,182,0.15)', border: '1px solid rgba(244,114,182,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2, fontSize: '0.65rem', color: '#f472b6', fontWeight: 900 }}>✓</span>
                  <div><span style={{ color: '#e0e0e0', fontWeight: 700 }}>{title} — </span><span style={{ color: '#9ca3af', fontSize: '0.93rem' }}>{detail}</span></div>
                </li>
              ))}
            </ul>
            <button className="btn btn-primary" onClick={() => navigate('/studio-signup')} style={{ fontSize: '0.95rem', padding: '0.7rem 1.75rem' }}>See It in Action</button>
          </div>
        </div>
      </section>

      {/* ── FEATURE: FOLLOW / REPEAT CUSTOMERS ── */}
      <section style={{ background: 'linear-gradient(135deg, rgba(16,24,40,0.98) 0%, rgba(10,20,35,0.98) 100%)', border: '1px solid rgba(59,130,246,0.14)', borderRadius: 24, maxWidth: 1100, margin: '0 auto 5rem', padding: '3.5rem 2.5rem', position: 'relative', overflow: 'hidden' }}>
        {/* Ambient glow */}
        <div style={{ position: 'absolute', bottom: -100, left: -80, width: 360, height: 360, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3.5rem', alignItems: 'center' }}>
          {/* Copy */}
          <div>
            <div style={{ display: 'inline-block', background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.32)', borderRadius: 20, padding: '4px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#60a5fa', marginBottom: '1.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Built-in Repeat Business
            </div>
            <h2 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 800, color: '#fff', lineHeight: 1.25, marginBottom: '1.1rem' }}>
              Every Upload is a<br />Sales Email to People<br />Who Already Want to Buy
            </h2>
            <p style={{ color: '#9ca3af', fontSize: '1rem', lineHeight: 1.8, marginBottom: '1.75rem' }}>
              Most photography businesses make one sale per event and hope the same families remember to come back next season. Follows change that math entirely. Parents follow their child, grandparents follow the team, coaches share the link with the whole roster — and every time you upload new photos, every one of them gets an email and lands right back in your storefront, ready to buy. Zero outreach. Zero marketing spend. Your past customers become your most reliable future revenue.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {[
                ['Follow any player by name', 'Fans and family search the player\'s name, hit follow, and they\'re done — no account required to get notified.'],
                ['Follow whole schools and teams', 'Customers can subscribe to an entire school or sport category and catch every event you shoot there, automatically.'],
                ['Instant email when new photos land', 'The moment you upload a new album, followers get a direct link. They\'re back in your store before you\'ve finished the upload.'],
                ['Turns a one-time buyer into a season-long customer', 'A parent who buys once in October follows their kid\'s whole season — fall sports, winter leagues, spring tournaments, all of it.'],
              ].map(([title, detail]) => (
                <li key={title} style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 3, fontSize: '0.65rem', color: '#60a5fa', fontWeight: 900 }}>✓</span>
                  <div><span style={{ color: '#e0e0e0', fontWeight: 700 }}>{title} — </span><span style={{ color: '#9ca3af', fontSize: '0.93rem' }}>{detail}</span></div>
                </li>
              ))}
            </ul>
            <button className="btn btn-primary" onClick={() => navigate('/studio-signup')} style={{ fontSize: '0.95rem', padding: '0.7rem 1.75rem' }}>Start Building Your Audience</button>
          </div>

          {/* Visual */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Following cards */}
            <div style={{ background: 'rgba(14,20,32,0.9)', border: '1px solid rgba(59,130,246,0.18)', borderRadius: 14, padding: '1rem 1.1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.65rem' }}>Following</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {[
                  { initials: 'MJ', name: 'Marcus Johnson', detail: 'Riverside HS · Varsity Basketball', color: 'rgba(124,92,255,0.35)', new: true },
                  { initials: 'EL', name: 'Emma Liu', detail: 'Westfield Academy · Gymnastics', color: 'rgba(244,114,182,0.3)', new: false },
                  { initials: 'RV', name: 'Rivera, Tyler', detail: 'Lincoln HS · Baseball', color: 'rgba(34,197,94,0.3)', new: false },
                ].map(p => (
                  <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', background: 'rgba(255,255,255,0.03)', borderRadius: 9, padding: '7px 10px' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: '0.72rem', flexShrink: 0 }}>{p.initials}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#e0e0e0', fontWeight: 700, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {p.name}
                        {p.new && <span style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, padding: '1px 7px', fontSize: '0.65rem', color: '#4ade80', fontWeight: 700 }}>New photos!</span>}
                      </div>
                      <div style={{ color: '#4a5568', fontSize: '0.72rem' }}>{p.detail}</div>
                    </div>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.new ? '#4ade80' : '#2d3748', flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            </div>

            {/* School / team follow */}
            <div style={{ background: 'rgba(14,20,32,0.9)', border: '1px solid rgba(59,130,246,0.18)', borderRadius: 14, padding: '1rem 1.1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.65rem' }}>Teams & Schools</div>
              {[
                { name: 'Riverside HS', sports: ['Basketball', 'Soccer', 'Track'], followers: 47 },
                { name: 'Westfield Academy', sports: ['Gymnastics', 'Swim'], followers: 23 },
              ].map(school => (
                <div key={school.name} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', background: 'rgba(255,255,255,0.03)', borderRadius: 9, padding: '7px 10px', marginBottom: '0.5rem' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>🏫</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#e0e0e0', fontWeight: 700, fontSize: '0.82rem' }}>{school.name}</div>
                    <div style={{ color: '#4a5568', fontSize: '0.72rem' }}>{school.sports.join(' · ')}</div>
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#4a5568', fontWeight: 600, flexShrink: 0 }}>{school.followers} followers</div>
                </div>
              ))}
            </div>

            {/* Notification email mockup */}
            <div style={{ background: 'rgba(30,34,50,0.95)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 14, padding: '1rem 1.1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.6rem' }}>
                <span style={{ fontSize: '1rem' }}>📬</span>
                <div>
                  <div style={{ color: '#e0e0e0', fontWeight: 700, fontSize: '0.82rem' }}>New photos of Marcus Johnson</div>
                  <div style={{ color: '#4a5568', fontSize: '0.7rem' }}>from Riverside Studio · just now</div>
                </div>
              </div>
              <div style={{ color: '#9ca3af', fontSize: '0.75rem', lineHeight: 1.6, marginBottom: '0.65rem' }}>
                12 new photos were just added to <span style={{ color: '#a78bfa' }}>Varsity Basketball — Spring Playoffs</span>. Come see them before everyone else.
              </div>
              <div style={{ display: 'inline-block', background: '#3b82f6', borderRadius: 7, padding: '5px 14px', fontSize: '0.75rem', color: '#fff', fontWeight: 700 }}>View Photos →</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{ maxWidth: 900, margin: '0 auto 5rem', padding: '0 1.5rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 800, color: '#fff', marginBottom: '0.75rem' }}>Your Studio, Live in Minutes</h2>
        <p style={{ color: '#9ca3af', marginBottom: '3rem', fontSize: '1rem' }}>Three steps from signup to taking bookings and selling photos.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
          {[
            { step: '01', icon: '🏗️', title: 'Set Up Your Studio', body: 'Create your branded storefront, upload session types with cover photos, set your prices, and configure your availability — takes about 10 minutes.' },
            { step: '02', icon: '📅', title: 'Take Bookings Online', body: 'Share your booking link. Customers choose a session type, pick a time, and submit a request. You approve, they pay the deposit — it\'s done.' },
            { step: '03', icon: '💰', title: 'Upload & Sell Photos', body: 'After the session, upload the gallery. Tag players, set print prices, and your storefront does the rest. Customers find and buy their photos on their own.' },
          ].map(item => (
            <div key={item.step} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '2rem 1.5rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: -10, right: 12, fontSize: '4rem', fontWeight: 900, color: 'rgba(124,92,255,0.08)', lineHeight: 1, userSelect: 'none' }}>{item.step}</div>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>{item.icon}</div>
              <div style={{ fontWeight: 800, color: '#fff', fontSize: '1.05rem', marginBottom: '0.5rem' }}>{item.title}</div>
              <div style={{ color: '#9ca3af', fontSize: '0.92rem', lineHeight: 1.65 }}>{item.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURE GRID ── */}
      <section className="landing-features-section">
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 800, color: '#fff', marginBottom: '0.5rem' }}>Everything Your Studio Needs</h2>
          <p style={{ color: '#9ca3af', fontSize: '1rem' }}>Built for photographers who want to focus on shooting, not admin.</p>
        </div>
        <div className="landing-studio-widgets">
          {[
            {
              icon: '💳',
              title: 'Integrated Stripe Payments',
              bullets: ['Collect deposits and full payments online', 'Cash/check mark-paid with no platform fees', 'Revenue dashboard with payout breakdown', 'Transparent fee breakdown per session type'],
            },
            {
              icon: '📊',
              title: 'Revenue & Order Dashboard',
              bullets: ['See total revenue, pending orders, and bookings', 'Track studio payout vs. fees at a glance', 'Upcoming sessions list on your dashboard', 'Filter bookings by status — pending, approved, cancelled'],
            },
            {
              icon: '🎨',
              title: 'Branded Client Experience',
              bullets: ['Your own /studio/your-name URL', 'Custom cover photos per session type', 'Professional dark-mode booking page', 'Clients only see your studio — no marketplace noise'],
            },
            {
              icon: '🔒',
              title: 'Studio Control & Security',
              bullets: ['You approve every booking before it\'s confirmed', 'Edit bookings, reschedule, or cancel anytime', 'Password-protected and rate-limited admin', 'Role-based access for staff'],
            },
            {
              icon: '📦',
              title: 'Lab & Print Ordering',
              bullets: ['Connect your pro lab — no markup required', 'Offer prints, canvas, digital downloads', 'Order fulfillment tracking per customer', 'Custom product catalog per studio'],
            },
            {
              icon: '📱',
              title: 'Mobile-First Design',
              bullets: ['Booking page works perfectly on any phone', 'Customers search and buy from mobile', 'Admin panel fully responsive', 'Fast load times with Azure CDN delivery'],
            },
          ].map(w => (
            <div key={w.title} className="landing-studio-widget">
              <div className="landing-studio-widget-title">{w.icon} {w.title}</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {w.bullets.map(b => (
                  <li key={b} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', color: '#bdbdbd', fontSize: '0.88rem', lineHeight: 1.5 }}>
                    <span style={{ color: '#a78bfa', fontWeight: 900, flexShrink: 0, marginTop: 1 }}>›</span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── TESTIMONIAL ── */}
      <section style={{ maxWidth: 720, margin: '0 auto 5rem', padding: '0 1.5rem', textAlign: 'center' }}>
        <div style={{ background: 'linear-gradient(135deg, rgba(124,92,255,0.1), rgba(59,130,246,0.07))', border: '1px solid rgba(124,92,255,0.2)', borderRadius: 20, padding: '2.5rem 2rem' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>"</div>
          <p style={{ color: '#e0e0e0', fontSize: '1.1rem', lineHeight: 1.75, fontStyle: 'italic', marginBottom: '1.5rem' }}>
            Before this platform I was losing bookings to DMs that got buried. Now parents can book, pay a deposit, and get their photos all in one place. My revenue from sports events doubled in the first season.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, #7c5cff, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff' }}>RC</div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ color: '#fff', fontWeight: 700 }}>Rachel C.</div>
              <div style={{ color: '#6b6b80', fontSize: '0.82rem' }}>Sports & Portrait Photography Studio</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── MIGRATION / SWITCHING ── */}
      <section style={{ maxWidth: 1100, margin: '0 auto 5rem', padding: '0 1.5rem' }}>
        <div style={{ background: 'linear-gradient(135deg, rgba(14,14,28,0.95) 0%, rgba(20,14,40,0.95) 100%)', border: '1px solid rgba(124,92,255,0.22)', borderRadius: 24, padding: '3.5rem 3rem', position: 'relative', overflow: 'hidden' }}>
          {/* Background glow */}
          <div style={{ position: 'absolute', top: -80, right: -80, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,92,255,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3.5rem', alignItems: 'center' }}>
            {/* Left: copy */}
            <div>
              <div style={{ display: 'inline-block', background: 'rgba(124,92,255,0.15)', border: '1px solid rgba(124,92,255,0.35)', borderRadius: 20, padding: '4px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#a78bfa', marginBottom: '1.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Switching Platforms
              </div>
              <h2 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 800, color: '#fff', lineHeight: 1.25, marginBottom: '1.1rem' }}>
                Already on SmugMug<br />or Pixieset? Good News.
              </h2>
              <p style={{ color: '#9ca3af', fontSize: '1rem', lineHeight: 1.8, marginBottom: '1.75rem' }}>
                Switching platforms shouldn't mean starting from scratch. Every album, every photo, every folder you've built up over the years moves over automatically — organized exactly the way you left it. You don't re-upload a thing. You're live and selling the same day you sign up.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {[
                  ['Your full catalog transfers automatically', 'Connect your SmugMug account and every album imports in one click — no manual uploads, no zip files, no starting over.'],
                  ['Full resolution, zero compression', 'Your images arrive exactly as you delivered them. No quality loss, no metadata stripped, no surprises.'],
                  ['Albums land organized and ready to sell', 'Your folder structure comes with them. Publish, set prices, and your storefront is live — often before lunch.'],
                  ['Your clients never notice a thing', 'Share links keep working. Photos are still where customers expect them. The switch is invisible to everyone but you.'],
                ].map(([title, detail]) => (
                  <li key={title} style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
                    <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: 'rgba(124,92,255,0.2)', border: '1px solid rgba(124,92,255,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 3, fontSize: '0.65rem', color: '#a78bfa', fontWeight: 900 }}>✓</span>
                    <div><span style={{ color: '#e0e0e0', fontWeight: 700 }}>{title} — </span><span style={{ color: '#9ca3af', fontSize: '0.93rem' }}>{detail}</span></div>
                  </li>
                ))}
              </ul>
              <button className="btn btn-primary" onClick={() => navigate('/studio-signup')} style={{ fontSize: '0.95rem', padding: '0.75rem 1.9rem' }}>
                Switch for Free
              </button>
            </div>

            {/* Right: visual migration flow */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* From platforms */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {[
                  { name: 'SmugMug', color: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.25)', dot: '#22c55e', albums: ['Fall Portraits 2023', 'Soccer — Westfield HS', 'Senior Portraits'] },
                  { name: 'Pixieset', color: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.25)', dot: '#60a5fa', albums: ['Spring Minis', 'Family Sessions', 'Weddings 2024'] },
                ].map(platform => (
                  <div key={platform.name} style={{ background: platform.color, border: `1px solid ${platform.border}`, borderRadius: 14, padding: '1rem 1.1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: '0.75rem' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: platform.dot, display: 'inline-block' }} />
                      <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#e0e0e0' }}>{platform.name}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {platform.albums.map(album => (
                        <div key={album} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '4px 8px' }}>
                          <span style={{ fontSize: '0.7rem' }}>🖼️</span>
                          <span style={{ fontSize: '0.72rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{album}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Arrow + status */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', padding: '0.5rem 0' }}>
                <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, rgba(124,92,255,0.4))' }} />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ background: 'rgba(124,92,255,0.15)', border: '1px solid rgba(124,92,255,0.4)', borderRadius: 20, padding: '5px 14px', fontSize: '0.75rem', fontWeight: 700, color: '#a78bfa' }}>
                    ⟱ Importing…
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#4a4a6a', fontWeight: 600 }}>6 albums · 1,240 photos</div>
                </div>
                <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(124,92,255,0.4), transparent)' }} />
              </div>

              {/* Destination */}
              <div style={{ background: 'rgba(124,92,255,0.1)', border: '1px solid rgba(124,92,255,0.35)', borderRadius: 14, padding: '1.1rem 1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.75rem' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#a78bfa', display: 'inline-block' }} />
                  <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#e0e0e0' }}>Your New Studio</span>
                  <span style={{ marginLeft: 'auto', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, padding: '2px 8px', fontSize: '0.68rem', color: '#4ade80', fontWeight: 700 }}>Live & selling</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem' }}>
                  {['Fall Portraits 2023', 'Soccer — Westfield HS', 'Senior Portraits', 'Spring Minis', 'Family Sessions', 'Weddings 2024'].map(album => (
                    <div key={album} style={{ background: 'rgba(124,92,255,0.1)', borderRadius: 6, padding: '4px 7px', fontSize: '0.67rem', color: '#c4b5fd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {album}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className="landing-pricing-section">
        <h2 className="gradient-text landing-pricing-title">Plans for Every Studio Size</h2>
        <p className="landing-pricing-desc">Start with a free trial — no credit card required</p>

        {/* Billing cycle toggle */}
        {!plansLoading && !plansError && plans.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.75rem' }}>
            <div style={{ display: 'flex', gap: 0, background: 'rgba(255,255,255,0.05)', borderRadius: 10, border: '1px solid rgba(124,92,255,0.2)', padding: 4 }}>
              {(['monthly', 'yearly'] as const).map(cycle => (
                <button
                  key={cycle}
                  onClick={() => setPricingCycle(cycle)}
                  style={{
                    padding: '8px 22px',
                    borderRadius: 7,
                    border: 'none',
                    background: pricingCycle === cycle ? '#7c5cff' : 'transparent',
                    color: pricingCycle === cycle ? '#fff' : '#a1a1aa',
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: 'pointer',
                    transition: 'background 0.15s, color 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  {cycle === 'monthly' ? 'Monthly' : 'Annual'}
                  {cycle === 'yearly' && (
                    <span style={{ background: 'rgba(74,222,128,0.2)', color: '#4ade80', fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>
                      Save up to 20%
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="pricing-row">
          {plansLoading ? <div className="pricing-loading">Loading plans...</div>
            : plansError ? <div className="pricing-error">{plansError}</div>
            : plans.length === 0 ? <div className="pricing-empty">No plans available.</div>
            : plans.map((plan, idx) => {
              if (idx !== plans.findIndex((p: any) => p.id === plan.id)) return null;
              const mp = plan.monthly_price ?? 0;
              const yp = plan.yearly_price ?? null;
              const savings = yp != null && mp > 0 ? Math.round(((mp * 12 - yp) / (mp * 12)) * 100) : 0;
              return (
                <PricingCard
                  key={`${plan.id}-${plan.name}`}
                  name={plan.name || plan.nickname || 'Plan'}
                  monthlyPrice={mp}
                  yearlyPrice={yp}
                  savingsPct={savings}
                  billingCycle={pricingCycle}
                  features={plan.features || plan.metadata?.features || []}
                  highlighted={plan.metadata?.highlighted || false}
                />
              );
            })}
        </div>
        <button className="btn btn-primary landing-pricing-btn" onClick={() => navigate('/studio-signup')}>Get Started Free</button>
      </section>

      {/* ── FOOTER CTA ── */}
      <section className="dark-card landing-footer-cta">
        <h2 className="gradient-text landing-footer-title">Ready to Fill Your Calendar and Sell More Photos?</h2>
        <p className="landing-footer-desc">Set up your studio in minutes. Take your first online booking today.</p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" style={{ fontSize: '1rem', padding: '0.75rem 2rem' }} onClick={() => navigate('/studio-signup')}>Start Free Trial</button>
          <button className="btn btn-outline-primary" style={{ fontSize: '1rem', padding: '0.75rem 2rem' }} onClick={() => navigate('/login')}>Sign In</button>
        </div>
      </section>

    </div>
  );
}

function PricingCard({ name, monthlyPrice, yearlyPrice, savingsPct, billingCycle, features, highlighted }: {
  name: string;
  monthlyPrice: number;
  yearlyPrice: number | null;
  savingsPct: number;
  billingCycle: 'monthly' | 'yearly';
  features: string[];
  highlighted?: boolean;
}) {
  const showAnnual = billingCycle === 'yearly' && yearlyPrice != null;
  const displayMonthlyEquiv = showAnnual ? yearlyPrice! / 12 : monthlyPrice;

  return (
    <div className={`pricing-card${highlighted ? ' pricing-card-highlighted' : ''}`}>
      {highlighted && <div className="pricing-card-popular">Most Popular</div>}
      <h3 className="pricing-card-title">{name}</h3>
      <div className="pricing-card-price">
        ${displayMonthlyEquiv.toFixed(2)}<span className="pricing-card-price-unit">/mo</span>
      </div>
      {showAnnual && yearlyPrice != null ? (
        <div className="pricing-card-yearly">
          <span style={{ color: '#a1a1aa' }}>${yearlyPrice.toFixed(2)}/yr billed annually</span>
          {savingsPct > 0 && <span className="pricing-card-yearly-discount"> · Save {savingsPct}%</span>}
        </div>
      ) : (
        yearlyPrice != null && savingsPct > 0 && (
          <div className="pricing-card-yearly">
            <span style={{ color: '#52525b', fontSize: '0.8em' }}>
              or ${(yearlyPrice / 12).toFixed(2)}/mo billed annually
            </span>
            <span className="pricing-card-yearly-discount"> · Save {savingsPct}%</span>
          </div>
        )
      )}
      <ul className="pricing-card-features">
        {features.map((f, i) => <li key={i} className="pricing-card-feature">✓ {f}</li>)}
      </ul>
    </div>
  );
}
