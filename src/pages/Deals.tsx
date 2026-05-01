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
    case 'shipping':
      return 'Applies to shipping';
    case 'specific-products':
      return 'Applies to selected products';
    case 'specific-categories':
      return 'Applies to selected categories';
    case 'specific-albums':
      return 'Applies to selected albums';
    default:
      return 'Applies to entire order';
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

  useEffect(() => {
    if (!selectedStudio) {
      fetchStudios();
    }
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
    if (!selectedStudio) {
      setDeals([]);
      return;
    }
    fetchDeals(selectedStudio.publicSlug);
    fetch(`/api/studios/public/${encodeURIComponent(selectedStudio.publicSlug)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((studio) => {
        if (studio?.timezone) {
          setStudioTimezone(studio.timezone);
        }
      })
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

  const sortedDeals = useMemo(() => {
    return [...deals].sort((a, b) => {
      const aTime = a.expirationDate ? new Date(a.expirationDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.expirationDate ? new Date(b.expirationDate).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
  }, [deals]);

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (error && !selectedStudio) {
    return <div className="albums-error-message">{error}</div>;
  }

  return (
    <div className="main-content dark-bg albums-full-height">
      <div className="page-header">
        <h1 className="gradient-text">Studio Deals</h1>
        <p className="albums-description">Current promotions and discount codes</p>
      </div>

      {!selectedStudio ? (
        <div className="studios-list-container">
          <h2 className="studios-list-title">Select a Studio</h2>
          <div className="studios-list-grid">
            {studios.length === 0 ? (
              <p className="empty-state">No studios available</p>
            ) : (
              studios.map((studio) => (
                <button
                  key={studio.id}
                  className={studioCardStyles.studioCard}
                  onClick={() => {
                    navigate(`/studio/${encodeURIComponent(studio.publicSlug)}/deals`);
                  }}
                >
                  {studio.name}
                </button>
              ))
            )}
          </div>
        </div>
      ) : (
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary"
              onClick={() => {
                if (routeStudioSlug) {
                  navigate('/deals');
                } else {
                  setSelectedStudio(null);
                  setSearchParams({});
                }
              }}
            >
              ← Back to Studios
            </button>
            <Link to={`/albums?studioSlug=${encodeURIComponent(selectedStudio.publicSlug)}`} className="btn btn-outline">
              View Albums
            </Link>
            <h2 style={{ margin: 0, color: 'var(--primary-color)' }}>{selectedStudio.name} Deals</h2>
          </div>

          {error && <div className="albums-error-message">{error}</div>}

          {loadingDeals ? (
            <div className="loading">Loading deals...</div>
          ) : sortedDeals.length === 0 ? (
            <p className="empty-state">No active deals right now. Please check back soon.</p>
          ) : (
            <div style={{ display: 'grid', gap: 14 }}>
              {sortedDeals.map((deal) => (
                <div
                  key={deal.id}
                  style={{
                    border: '1px solid rgba(139, 92, 246, 0.4)',
                    borderRadius: 12,
                    background: 'rgba(27, 23, 45, 0.8)',
                    padding: 14,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ color: '#ddd6fe', fontWeight: 700, marginBottom: 4 }}>{formatDealHeadline(deal)}</div>
                      <div style={{ color: '#f5f3ff', fontSize: '0.95rem' }}>{deal.description || 'Limited-time studio deal.'}</div>
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: '#a78bfa', fontSize: '0.8rem', letterSpacing: '0.02em' }}>CODE</span>
                      <span style={{
                        background: '#312e81',
                        color: '#ede9fe',
                        border: '1px solid rgba(167, 139, 250, 0.4)',
                        borderRadius: 8,
                        padding: '4px 8px',
                        fontWeight: 700,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      }}>{deal.code}</span>
                    </div>
                  </div>

                  <div style={{ marginTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap', color: '#c4b5fd', fontSize: '0.85rem' }}>
                    <span>{formatApplication(deal.applicationType)}</span>
                    {deal.minSubtotal != null && <span>Min. subtotal ${Number(deal.minSubtotal).toFixed(2)}</span>}
                    {deal.firstOrderOnly && <span>First order only</span>}
                    {deal.expirationDate && <span>Ends {formatDateInStudioTimezone(deal.expirationDate)}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Deals;
