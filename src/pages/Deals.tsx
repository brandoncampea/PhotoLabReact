import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { formatDateInStudioTimezone, setStudioTimezone } from '../utils/studioDateTime';
import studioCardStyles from './StudioCard.module.css';

type PublicStudio = {
  id: number;
  name: string;
  publicSlug: string;
};

type PublicDeal = {
  id: number;
  code: string;
  description: string;
  discountType: 'percentage' | 'fixed' | 'free-shipping' | 'bundle-price';
  discountValue: number;
  bundleQuantity?: number | null;
  bundlePrice?: number | null;
  applicationType: 'entire-order' | 'specific-products' | 'specific-categories' | 'specific-albums' | 'shipping';
  startDate?: string | null;
  expirationDate?: string | null;
  minSubtotal?: number | null;
  firstOrderOnly?: boolean;
};

const formatDealHeadline = (deal: PublicDeal) => {
  if (deal.discountType === 'free-shipping') return 'Free Shipping';
  if (deal.discountType === 'bundle-price') return `${deal.bundleQuantity || 0} for $${Number(deal.bundlePrice || 0).toFixed(2)}`;
  if (deal.discountType === 'percentage') return `${deal.discountValue}% Off`;
  return `$${deal.discountValue.toFixed(2)} Off`;
};

const formatApplication = (applicationType: PublicDeal['applicationType']) => {
  switch (applicationType) {
    case 'shipping': return 'Applies to shipping';
    case 'specific-products': return 'Applies to selected products';
    case 'specific-categories': return 'Applies to selected categories';
    case 'specific-albums': return 'Applies to selected albums';
    default: return 'Applies to entire order';
  }
};

const Deals: React.FC = () => {
  const navigate = useNavigate();
  const { studioSlug: routeStudioSlug } = useParams<{ studioSlug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [studios, setStudios] = useState<PublicStudio[]>([]);
  const [selectedStudio, setSelectedStudio] = useState<PublicStudio | null>(null);
  const [deals, setDeals] = useState<PublicDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [error, setError] = useState('');

  // True when studio context came from the URL — "Back to Studios" is unnecessary
  const hasStudioInUrl = !!routeStudioSlug || !!searchParams.get('studioSlug');

  useEffect(() => {
    if (!selectedStudio) fetchStudios();
  }, [selectedStudio]);

  useEffect(() => {
    if (!studios.length || selectedStudio) return;
    const studioSlug = routeStudioSlug || searchParams.get('studioSlug');
    if (!studioSlug) return;
    const match = studios.find((s) => s.publicSlug === studioSlug);
    if (match) {
      setSelectedStudio(match);
    } else if (routeStudioSlug) {
      setError('Studio not found.');
    }
  }, [studios, selectedStudio, searchParams, routeStudioSlug]);

  useEffect(() => {
    if (!selectedStudio) { setDeals([]); return; }
    fetchDeals(selectedStudio.publicSlug);
    fetch(`/api/studios/public/${encodeURIComponent(selectedStudio.publicSlug)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((studio) => { if (studio?.timezone) setStudioTimezone(studio.timezone); })
      .catch(() => {});
  }, [selectedStudio]);

  const fetchStudios = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/studios/public-list');
      if (!res.ok) throw new Error('Failed to load studios');
      const data = await res.json();
      setStudios(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load studios');
    } finally {
      setLoading(false);
    }
  };

  const fetchDeals = async (studioSlug: string) => {
    setLoadingDeals(true);
    setError('');
    try {
      const res = await fetch(`/api/discount-codes/public?studioSlug=${encodeURIComponent(studioSlug)}`);
      if (!res.ok) throw new Error('Failed to load deals');
      const data = await res.json();
      setDeals(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load deals');
    } finally {
      setLoadingDeals(false);
    }
  };

  const sortedDeals = useMemo(() => [...deals].sort((a, b) => {
    const aTime = a.expirationDate ? new Date(a.expirationDate).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.expirationDate ? new Date(b.expirationDate).getTime() : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  }), [deals]);

  if (loading) return <div className="loading">Loading...</div>;
  if (error && !selectedStudio) return <div className="albums-error-message">{error}</div>;

  return (
    <div className="main-content dark-bg albums-full-height" style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '2rem 1rem' }}>

        {/* Page title */}
        <div style={{ marginBottom: '1.75rem' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#fff', margin: '0 0 0.35rem', letterSpacing: '-0.02em' }}>
            {selectedStudio ? `${selectedStudio.name} Deals` : 'Studio Deals'}
          </h1>
          <p style={{ color: '#6b6b80', fontSize: '0.9rem', margin: 0 }}>Current promotions and discount codes</p>
        </div>

        {!selectedStudio ? (
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#a78bfa', marginBottom: '1rem' }}>Select a Studio</h2>
            <div className="studios-list-grid">
              {studios.length === 0 ? (
                <p style={{ color: '#4a4a6a' }}>No studios available</p>
              ) : (
                studios.map((studio) => (
                  <button
                    key={studio.id}
                    className={studioCardStyles.studioCard}
                    onClick={() => navigate(`/studio/${encodeURIComponent(studio.publicSlug)}/deals`)}
                  >
                    {studio.name}
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Nav bar — "Back to Studios" hidden when studio came from the URL */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              {!hasStudioInUrl && (
                <button
                  onClick={() => { setSelectedStudio(null); setSearchParams({}); }}
                  style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid rgba(255,255,255,0.15)', background: 'none', color: '#9ca3af', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  ← Back to Studios
                </button>
              )}
              <Link
                to={`/albums?studioSlug=${encodeURIComponent(selectedStudio.publicSlug)}`}
                style={{ padding: '7px 16px', borderRadius: 8, border: '1.5px solid rgba(124,92,255,0.5)', background: 'rgba(124,92,255,0.12)', color: '#a78bfa', fontSize: '0.82rem', fontWeight: 700, textDecoration: 'none' }}
              >
                View Albums
              </Link>
            </div>

            {error && (
              <div style={{ padding: '9px 14px', borderRadius: 8, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#fca5a5', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {error}
              </div>
            )}

            {loadingDeals ? (
              <div style={{ color: '#5a5a72', padding: '2rem', textAlign: 'center' }}>Loading deals…</div>
            ) : sortedDeals.length === 0 ? (
              <div style={{ color: '#4a4a6a', textAlign: 'center', padding: '3rem', fontSize: '0.95rem' }}>
                No active deals right now. Check back soon.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {sortedDeals.map((deal) => (
                  <div
                    key={deal.id}
                    style={{
                      background: 'rgba(22,22,35,0.95)',
                      border: '1px solid rgba(124,92,255,0.2)',
                      borderRadius: 14,
                      padding: '1.1rem 1.25rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 16,
                      flexWrap: 'wrap',
                    }}
                  >
                    {/* Left: headline + description + meta */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>
                          {formatDealHeadline(deal)}
                        </span>
                        {deal.expirationDate && (
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(255,166,87,0.12)', color: '#ffa657', border: '1px solid rgba(255,166,87,0.25)' }}>
                            Ends {formatDateInStudioTimezone(deal.expirationDate)}
                          </span>
                        )}
                      </div>
                      {deal.description && (
                        <div style={{ fontSize: '0.88rem', color: '#c4b5fd', marginBottom: 7 }}>{deal.description}</div>
                      )}
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '0.75rem', color: '#5a5a72' }}>
                        <span>{formatApplication(deal.applicationType)}</span>
                        {deal.minSubtotal != null && <span>Min. ${Number(deal.minSubtotal).toFixed(2)}</span>}
                        {deal.firstOrderOnly && <span>First order only</span>}
                      </div>
                    </div>

                    {/* Right: code badge */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#6b6b80', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Promo Code</span>
                      <span style={{
                        background: 'rgba(124,92,255,0.15)',
                        color: '#e9d5ff',
                        border: '1.5px solid rgba(124,92,255,0.4)',
                        borderRadius: 8,
                        padding: '6px 14px',
                        fontWeight: 800,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontSize: '1rem',
                        letterSpacing: '0.06em',
                      }}>
                        {deal.code}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Deals;
