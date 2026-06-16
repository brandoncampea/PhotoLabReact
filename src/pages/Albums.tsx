
import React, { useEffect, useState, useRef } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import AlbumCoverCarousel from '../components/AlbumCoverCarousel';
import { analyticsService } from '../services/analyticsService';
import { formatDateInStudioTimezone, formatDateTimeInStudioTimezone, setStudioTimezone } from '../utils/studioDateTime';
import styles from './Albums.module.css';
import studioCardStyles from './StudioCard.module.css';

type PublicStudio = {
  id: number;
  name: string;
  publicSlug: string;
};

type PublicAlbum = {
  id: number;
  name: string;
  description?: string;
  schoolTags?: string[];
  coverImageUrl?: string;
  previewImageUrls?: string[];
  photoCount: number;
  createdDate: string;
  batchShippingActive?: boolean;
  studioBatchShippingActive?: boolean;
  batchDeadline?: string;
  albumPurchaseEnabled?: boolean;
  category?: string;
};

type PublicDeal = {
  id: number;
  code: string;
  description: string;
  discountType: 'percentage' | 'fixed' | 'free-shipping' | 'bundle-price';
  discountValue: number;
  bundleQuantity?: number | null;
  bundlePrice?: number | null;
  expirationDate?: string | null;
};

const formatDealHeadline = (deal: PublicDeal) => {
  if (deal.discountType === 'free-shipping') return 'Free Shipping';
  if (deal.discountType === 'bundle-price') return `${deal.bundleQuantity || 0} for $${Number(deal.bundlePrice || 0).toFixed(2)}`;
  if (deal.discountType === 'percentage') return `${deal.discountValue}% Off`;
  return `$${deal.discountValue.toFixed(2)} Off`;
};

const hasBatchDeadlinePassed = (deadline?: string) => {
  if (!deadline) return false;
  const deadlineTime = new Date(deadline).getTime();
  if (!Number.isFinite(deadlineTime)) return false;
  return deadlineTime < Date.now();
};


const Albums: React.FC = () => {
  const navigate = useNavigate();
  const [searchPlayerNames, setSearchPlayerNames] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const PAGE_SIZE = 12;
  const [page, setPage] = useState(1);
  const [studios, setStudios] = useState<PublicStudio[]>([]);
  const [selectedStudio, setSelectedStudio] = useState<PublicStudio | null>(null);
  const [albums, setAlbums] = useState<PublicAlbum[]>([]);
  const [albumQuery, setAlbumQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState(albumQuery);
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);
  const [albumSort, setAlbumSort] = useState<'recent' | 'oldest'>('recent');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shareNotification, setShareNotification] = useState('');
  const [deals, setDeals] = useState<PublicDeal[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(false);
  // Detect if a hidden album should be shown (direct link)
  const showHidden = searchParams.get('hidden') === '1';

  const isBatchEnabledForAlbum = (album: PublicAlbum) => {
    return Boolean(album.batchShippingActive) && Boolean(album.studioBatchShippingActive) && !hasBatchDeadlinePassed(album.batchDeadline);
  };

  const activeStudioBatchAlbum = React.useMemo(
    () => albums.find((album) => Boolean(album.studioBatchShippingActive) && !hasBatchDeadlinePassed(album.batchDeadline)),
    [albums]
  );

  useEffect(() => {
    if (!selectedStudio) {
      fetchStudios();
    }
  }, [selectedStudio]);

  useEffect(() => {
    if (!studios.length || selectedStudio) return;
    const studioSlug = searchParams.get('studioSlug');
    const persistedStudioSlug = localStorage.getItem('studioSlug') || '';
    const effectiveSlug = studioSlug || persistedStudioSlug;
    if (!effectiveSlug) return;
    const match = studios.find((s) => s.publicSlug === effectiveSlug);
    if (match) {
      setSelectedStudio(match);
      if (!studioSlug) {
        setSearchParams({ studioSlug: match.publicSlug });
      }
    }
  }, [studios, selectedStudio, searchParams]);

  useEffect(() => {
    if (!selectedStudio?.publicSlug) return;
    localStorage.setItem('studioSlug', selectedStudio.publicSlug);
  }, [selectedStudio?.publicSlug]);

  const fetchStudios = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/studios/public-list');
      if (!res.ok) throw new Error('Failed to load studios');
      const data = await res.json();
      setStudios(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load studios');
    } finally {
      setLoading(false);
    }
  };

  // Debounce albumQuery
  useEffect(() => {
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    debounceTimeout.current = setTimeout(() => {
      setDebouncedQuery(albumQuery);
    }, 400);
    return () => {
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    };
  }, [albumQuery]);

  useEffect(() => {
    if (selectedStudio) {
      const query = debouncedQuery.trim().toLowerCase();
      let localFiltered: PublicAlbum[] = albums;
      if (query.length > 0) {
        localFiltered = albums.filter(album =>
          album.name.toLowerCase().includes(query) ||
          (album.description || '').toLowerCase().includes(query) ||
          (Array.isArray(album.schoolTags) ? album.schoolTags.join(' ').toLowerCase().includes(query) : false)
        );
      }
      if (query.length > 0 && searchPlayerNames) {
        fetchAlbums(selectedStudio.publicSlug, debouncedQuery.trim(), localFiltered);
      } else if (query.length > 0) {
        // Only local filter
        setAlbums(localFiltered);
      } else {
        // On initial load or when query is empty, fetch all albums for the studio
        fetchAlbums(selectedStudio.publicSlug);
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
    } else {
      setDeals([]);
    }
  }, [selectedStudio, debouncedQuery, searchPlayerNames]);

  // Fetch backend player search and merge with local filter
  const fetchAlbums = async (studioSlug: string, player?: string, localFiltered?: PublicAlbum[]) => {
    setLoading(true);
    setError('');
    try {
      let url = `/api/albums/public?studioSlug=${encodeURIComponent(studioSlug)}`;
      if (player && player.trim().length > 0) {
        url += `&player=${encodeURIComponent(player.trim())}`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load albums');
      const backendAlbums = await res.json();
      let merged = backendAlbums;
      if (localFiltered) {
        // Merge and dedupe by album id
        const map = new Map();
        for (const a of [...localFiltered, ...backendAlbums]) {
          map.set(a.id, a);
        }
        merged = Array.from(map.values());
      }
      setAlbums(merged);
    } catch (err: any) {
      setError(err.message || 'Failed to load albums');
    } finally {
      setLoading(false);
    }
  };

  const fetchDeals = async (studioSlug: string) => {
    setLoadingDeals(true);
    try {
      const res = await fetch(`/api/discount-codes/public?studioSlug=${encodeURIComponent(studioSlug)}`);
      if (!res.ok) throw new Error('Failed to load deals');
      const data = await res.json();
      setDeals(Array.isArray(data) ? data : []);
    } catch {
      setDeals([]);
    } finally {
      setLoadingDeals(false);
    }
  };

  const handleShare = async (e: React.MouseEvent, album: any) => {
    e.stopPropagation();
    // Try to get the studio slug from context or localStorage
    // user is not available in this context; fallback to localStorage only
    let studioSlug = localStorage.getItem('studioSlug') || '';
    const url = studioSlug
      ? `${window.location.origin}/albums/${album.id}?studioSlug=${encodeURIComponent(studioSlug)}`
      : `${window.location.origin}/albums/${album.id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: album.name,
          text: album.description,
          url: url,
        });
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(url);
        setShareNotification('Link copied to clipboard!');
        setTimeout(() => setShareNotification(''), 3000);
      } catch {}
    }
  };

  const handleBuyEntireAlbum = (e: React.MouseEvent, album: PublicAlbum) => {
    e.preventDefault();
    e.stopPropagation();
    const studioSlug = selectedStudio?.publicSlug || localStorage.getItem('studioSlug') || '';
    const targetUrl = studioSlug
      ? `/albums/${album.id}?studioSlug=${encodeURIComponent(studioSlug)}&buyAlbum=1`
      : `/albums/${album.id}?buyAlbum=1`;
    window.location.href = targetUrl;
  };


  // Extract unique categories from albums
  const albumCategories = React.useMemo(() => {
    const cats = albums.map(a => a.category).filter(Boolean) as string[];
    return Array.from(new Set(cats));
  }, [albums]);

  // Filtering and sorting for albums
  const filteredAlbums = React.useMemo(() => {
    let filtered = albums;
    // Hide hidden albums unless showHidden is true and only for the direct album
    if (!showHidden) {
      filtered = filtered.filter((album) => !(album as any).hidden);
    }
    const query = albumQuery.trim().toLowerCase();
    if (query) {
      filtered = filtered.filter((album) =>
        album.name.toLowerCase().includes(query) ||
        (album.description || '').toLowerCase().includes(query) ||
        (Array.isArray(album.schoolTags) ? album.schoolTags.join(' ').toLowerCase().includes(query) : false)
      );
    }
    if (selectedCategory) {
      filtered = filtered.filter(album => album.category === selectedCategory);
    }
    filtered = [...filtered].sort((a, b) => {
      const aDate = new Date(a.createdDate).getTime();
      const bDate = new Date(b.createdDate).getTime();
      return albumSort === 'recent' ? bDate - aDate : aDate - bDate;
    });
    return filtered;
  }, [albums, albumQuery, albumSort, selectedCategory, showHidden]);

  const totalPages = Math.max(1, Math.ceil(filteredAlbums.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedAlbums = filteredAlbums.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const goToAlbum = (albumId: number) => {
    analyticsService.trackAlbumCardClick(albumId, '', selectedStudio?.id ?? 0);
    navigate(`/albums/${albumId}?studioSlug=${encodeURIComponent(selectedStudio?.publicSlug ?? '')}`);
  };

  const pageBtnStyle = (active: boolean, disabled?: boolean): React.CSSProperties => ({
    padding: '5px 10px',
    borderRadius: 7,
    border: '1.5px solid rgba(124,92,255,0.25)',
    background: active ? 'rgba(124,92,255,0.25)' : 'none',
    color: disabled ? '#3a3a50' : active ? '#c4b5fd' : '#7c5cff',
    fontWeight: 700,
    fontSize: '0.8rem',
    cursor: disabled ? 'default' : 'pointer',
    minWidth: 32,
  });

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (error) {
    return <div className="albums-error-message">{error}</div>;
  }

  return (
    <div className="main-content dark-bg albums-full-height">
      {shareNotification && (
        <div className="success-message fixed-notification">✓ {shareNotification}</div>
      )}

      <div className="page-header">
        <h1 className="gradient-text">Photo Albums</h1>
        <p className="albums-description">Browse and purchase photos from your session</p>
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
                    setSelectedStudio(studio);
                    localStorage.setItem('studioSlug', studio.publicSlug);
                    setSearchParams({ studioSlug: studio.publicSlug });
                  }}
                >
                  {studio.name}
                </button>
              ))
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Deals panel */}
          {(deals.length > 0 || loadingDeals) && (
            <div className={styles.albumsDealsPanel} style={{ marginBottom: 20 }}>
              <div className={styles.albumsDealsPanelHeader}>
                <h3 className={styles.albumsDealsTitle}>🏷️ Current Deals</h3>
                <Link to={`/studio/${encodeURIComponent(selectedStudio.publicSlug)}/deals`} className="btn btn-outline">
                  View All
                </Link>
              </div>
              {loadingDeals ? (
                <p className={styles.albumsDealsMuted}>Loading deals...</p>
              ) : (
                <div className={styles.albumsDealsGrid}>
                  {deals.slice(0, 3).map((deal) => (
                    <div key={deal.id} className={styles.albumsDealCard}>
                      <div className={styles.albumsDealTopRow}>
                        <span className={styles.albumsDealHeadline}>{formatDealHeadline(deal)}</span>
                        <span className={styles.albumsDealCode}>{deal.code}</span>
                      </div>
                      <p className={styles.albumsDealDescription}>{deal.description || 'Limited-time studio promotion.'}</p>
                      {deal.expirationDate && (
                        <span className={styles.albumsDealMeta}>Ends {formatDateInStudioTimezone(deal.expirationDate)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Batch shipping notice */}
          {Boolean(activeStudioBatchAlbum) && (
            <div className={styles.albumsBatchNotice} style={{ marginBottom: 20 }}>
              <strong>📦 Batch shipping available</strong>
              <span>
                Order from any album marked with "Batch Shipping Available" to qualify.
                {activeStudioBatchAlbum?.batchDeadline
                  ? ` Deadline: ${formatDateTimeInStudioTimezone(activeStudioBatchAlbum.batchDeadline)}.`
                  : ''}
              </span>
            </div>
          )}

          {/* Filter + sort bar */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              value={albumQuery}
              onChange={e => { setAlbumQuery(e.target.value); setPage(1); }}
              placeholder="Search by name, school, or player…"
              autoComplete="off"
              style={{ flex: '1 1 220px', padding: '9px 14px', borderRadius: 9, border: '1.5px solid rgba(124,92,255,0.25)', background: 'rgba(10,10,20,0.8)', color: '#fff', fontSize: '0.9rem', outline: 'none' }}
            />
            {albumCategories.length > 0 && (
              <select
                value={selectedCategory}
                onChange={e => { setSelectedCategory(e.target.value); setPage(1); }}
                style={{ padding: '9px 12px', borderRadius: 9, border: '1.5px solid rgba(124,92,255,0.2)', background: 'rgba(10,10,20,0.8)', color: '#d4d4e8', fontSize: '0.85rem', outline: 'none' }}
              >
                <option value="">All Categories</option>
                {albumCategories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            )}
            <select
              value={albumSort}
              onChange={e => { setAlbumSort(e.target.value as 'recent' | 'oldest'); setPage(1); }}
              style={{ padding: '9px 12px', borderRadius: 9, border: '1.5px solid rgba(124,92,255,0.2)', background: 'rgba(10,10,20,0.8)', color: '#d4d4e8', fontSize: '0.85rem', outline: 'none' }}
            >
              <option value="recent">Most Recent</option>
              <option value="oldest">Oldest First</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#6b6b80', fontSize: '0.85rem', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={searchPlayerNames}
                onChange={e => setSearchPlayerNames(e.target.checked)}
                style={{ accentColor: '#7c5cff', width: 15, height: 15 }}
              />
              Include player names
            </label>
          </div>

          {/* Count + pagination top */}
          {filteredAlbums.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              <div style={{ fontSize: '0.78rem', color: '#4a4a6a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                {filteredAlbums.length} album{filteredAlbums.length !== 1 ? 's' : ''}
                {albumQuery ? ` for "${albumQuery}"` : ''}
                {totalPages > 1 && ` · page ${safePage} of ${totalPages}`}
              </div>
              {totalPages > 1 && (
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  <button onClick={() => setPage(1)} disabled={safePage === 1} style={pageBtnStyle(false, safePage === 1)}>«</button>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1} style={pageBtnStyle(false, safePage === 1)}>‹</button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                    .reduce<(number | '…')[]>((acc, p, i, arr) => {
                      if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('…');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === '…' ? (
                        <span key={`el-${i}`} style={{ color: '#3a3a50', fontSize: '0.8rem' }}>…</span>
                      ) : (
                        <button key={p} onClick={() => setPage(p as number)} style={pageBtnStyle(safePage === p)}>{p}</button>
                      )
                    )}
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} style={pageBtnStyle(false, safePage === totalPages)}>›</button>
                  <button onClick={() => setPage(totalPages)} disabled={safePage === totalPages} style={pageBtnStyle(false, safePage === totalPages)}>»</button>
                </div>
              )}
            </div>
          )}

          {/* Album grid */}
          <div className="albums-grid">
            {albums.length === 0 ? (
              <p className="empty-state">No albums available for this studio yet.</p>
            ) : filteredAlbums.length === 0 ? (
              <p className="empty-state">No albums match your search.</p>
            ) : (
              pagedAlbums.map((album) => {
                const albumUrl = `/albums/${album.id}?studioSlug=${encodeURIComponent(selectedStudio.publicSlug)}`;
                return (
                  <div
                    key={album.id}
                    className="album-card"
                    onClick={() => goToAlbum(album.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Cover image */}
                    <div className="album-cover">
                      <AlbumCoverCarousel
                        albumId={album.id}
                        albumName={album.name}
                        coverImageUrl={
                          album.coverImageUrl && String(album.coverImageUrl).match(/^\d+$/)
                            ? `/api/photos/${album.coverImageUrl}/asset?variant=thumbnail`
                            : album.coverImageUrl || undefined
                        }
                        previewImageUrls={
                          Array.isArray(album.previewImageUrls)
                            ? album.previewImageUrls
                                .filter(pid => String(pid).match(/^\d+$/))
                                .map(pid => `/api/photos/${pid}/asset?variant=thumbnail`)
                            : undefined
                        }
                        studioId={selectedStudio?.id}
                      />
                      <div className="album-overlay">
                        <span className="photo-count">{album.photoCount} photos</span>
                      </div>
                    </div>

                    {/* Card info */}
                    <div className="album-info">
                      {/* Title — own Link so keyboard/right-click still works */}
                      <h3>
                        <a
                          href={albumUrl}
                          onClick={e => e.stopPropagation()}
                          style={{ color: 'inherit', textDecoration: 'none' }}
                        >
                          {album.name}
                        </a>
                      </h3>

                      {album.category && (
                        <div style={{ fontSize: '0.75rem', color: '#7c5cff', fontWeight: 600, marginTop: -2, marginBottom: 2 }}>{album.category}</div>
                      )}

                      {isBatchEnabledForAlbum(album) && (
                        <div className={styles.albumsBatchBadge}>📦 Batch Shipping Available</div>
                      )}

                      {Array.isArray(album.schoolTags) && album.schoolTags.length > 0 && (
                        <div className={styles.albumSchoolsSection}>
                          <div className={styles.albumSchoolsList}>
                            {album.schoolTags.slice(0, 3).map((school) => (
                              <span key={school} className={styles.albumSchoolChip}>{school}</span>
                            ))}
                            {album.schoolTags.length > 3 && (
                              <span className={styles.albumSchoolChip}>+{album.schoolTags.length - 3}</span>
                            )}
                          </div>
                        </div>
                      )}

                      {album.description && (
                        <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#6b6b80', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {album.description}
                        </p>
                      )}

                      {/* Footer row */}
                      <div className="album-info-row" style={{ marginTop: 8 }}>
                        <span className="album-date" style={{ fontSize: '0.78rem' }}>
                          {formatDateInStudioTimezone(album.createdDate)}
                        </span>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {album.albumPurchaseEnabled !== false && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleBuyEntireAlbum(e, album); }}
                              className={styles.buyEntireAlbumButton}
                              title="Buy entire album"
                            >
                              Buy Album
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleShare(e, album); }}
                            className={styles.shareButton}
                            title="Share album"
                          >
                            <span className={styles.shareIcon}>🔗</span> Share
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination bottom */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 28, paddingBottom: 8 }}>
              <button onClick={() => setPage(1)} disabled={safePage === 1} style={pageBtnStyle(false, safePage === 1)}>«</button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1} style={pageBtnStyle(false, safePage === 1)}>‹</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                .reduce<(number | '…')[]>((acc, p, i, arr) => {
                  if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('…');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === '…' ? (
                    <span key={`elb-${i}`} style={{ color: '#3a3a50', fontSize: '0.8rem', padding: '5px 2px' }}>…</span>
                  ) : (
                    <button key={p} onClick={() => setPage(p as number)} style={pageBtnStyle(safePage === p)}>{p}</button>
                  )
                )}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} style={pageBtnStyle(false, safePage === totalPages)}>›</button>
              <button onClick={() => setPage(totalPages)} disabled={safePage === totalPages} style={pageBtnStyle(false, safePage === totalPages)}>»</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Albums;
