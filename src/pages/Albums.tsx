
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AlbumCoverCarousel from '../components/AlbumCoverCarousel';
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
  coverImageUrl?: string;
  previewImageUrls?: string[];
  photoCount: number;
  createdDate: string;
  batchShippingActive?: boolean;
  batchDeadline?: string;
  category?: string;
};


const Albums: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [studios, setStudios] = useState<PublicStudio[]>([]);
  const [selectedStudio, setSelectedStudio] = useState<PublicStudio | null>(null);
  const [albums, setAlbums] = useState<PublicAlbum[]>([]);
  const [albumQuery, setAlbumQuery] = useState('');
  const [albumSort, setAlbumSort] = useState<'recent' | 'oldest'>('recent');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shareNotification, setShareNotification] = useState('');

  useEffect(() => {
    if (!selectedStudio) {
      fetchStudios();
    }
  }, [selectedStudio]);

  useEffect(() => {
    if (!studios.length || selectedStudio) return;
    const studioSlug = searchParams.get('studioSlug');
    if (!studioSlug) return;
    const match = studios.find((s) => s.publicSlug === studioSlug);
    if (match) {
      setSelectedStudio(match);
    }
  }, [studios, selectedStudio, searchParams]);

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

  useEffect(() => {
    if (selectedStudio) {
      fetchAlbums(selectedStudio.publicSlug);
    }
  }, [selectedStudio]);

  const fetchAlbums = async (studioSlug: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/albums/public?studioSlug=${encodeURIComponent(studioSlug)}`);
      if (!res.ok) throw new Error('Failed to load albums');
      const data = await res.json();
      setAlbums(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load albums');
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async (e: React.MouseEvent, album: Album) => {
    e.stopPropagation();
    // Try to get the studio slug from context or localStorage
    let studioSlug = (user && user.studioSlug) || localStorage.getItem('studioSlug') || '';
    if (!studioSlug && user && user.studioId) {
      studioSlug = `studio${user.studioId}`;
    }
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


  // Extract unique categories from albums
  const albumCategories = React.useMemo(() => {
    const cats = albums.map(a => a.category).filter(Boolean) as string[];
    return Array.from(new Set(cats));
  }, [albums]);

  // Filtering and sorting for albums
  const filteredAlbums = React.useMemo(() => {
    let filtered = albums;
    const query = albumQuery.trim().toLowerCase();
    if (query) {
      filtered = filtered.filter((album) =>
        album.name.toLowerCase().includes(query) ||
        (album.description || '').toLowerCase().includes(query)
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
  }, [albums, albumQuery, albumSort, selectedCategory]);

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
        <p className="albums-description">Browse and select photos from our collection</p>
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
          <div className={styles.albumsFlexRow}>
            <button
              className={`btn btn-secondary ${styles.albumsMr16}`}
              onClick={() => {
                setSelectedStudio(null);
                setSearchParams({});
              }}
            >
              ← Back to Studios
            </button>
            <h2 className={styles.albumsH2}>{selectedStudio.name} Albums</h2>
          </div>
          {/* Filtering and sorting UI */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 18, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={albumQuery}
              onChange={e => setAlbumQuery(e.target.value)}
              placeholder="Filter albums by name or description..."
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #3a3656', background: '#141320', color: '#fff', minWidth: 220 }}
            />
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #3a3656', background: '#141320', color: '#fff', minWidth: 140 }}
            >
              <option value="">All Categories</option>
              {albumCategories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <select
              value={albumSort}
              onChange={e => setAlbumSort(e.target.value as 'recent' | 'oldest')}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #3a3656', background: '#141320', color: '#fff', minWidth: 140 }}
            >
              <option value="recent">Most Recent First</option>
              <option value="oldest">Oldest First</option>
            </select>
            <span style={{ color: '#aaa', fontSize: 13 }}>
              Showing {filteredAlbums.length} of {albums.length} album{albums.length === 1 ? '' : 's'}
            </span>
          </div>
          {albums.some((album) => album.batchShippingActive) && (
            <div className={styles.albumsBatchNotice}>
              <strong>Batch shipping is active for this studio.</strong>
              <span>
                You can choose free batch shipping at checkout when available.
                {albums.find((album) => album.batchShippingActive)?.batchDeadline
                  ? ` Current release deadline: ${new Date(String(albums.find((album) => album.batchShippingActive)?.batchDeadline)).toLocaleString()}.`
                  : ''}
              </span>
            </div>
          )}
          <div className="albums-grid">
            {albums.length === 0 ? (
              <p className="empty-state">No albums available for this studio</p>
            ) : filteredAlbums.length === 0 ? (
              <p className="empty-state">No albums match your filter.</p>
            ) : (
              filteredAlbums.map((album) => (
                <Link to={`/albums/${album.id}?studioSlug=${encodeURIComponent(selectedStudio.publicSlug)}`} key={album.id} className="album-card">
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
                  <div className="album-info">
                    <h3>{album.name}</h3>
                    {album.batchShippingActive && (
                      <div className={styles.albumsBatchBadge}>Batch Shipping Available</div>
                    )}
                    <p>{album.description}</p>
                    <div className="album-info-row">
                      <span className="album-date">
                        {new Date(album.createdDate).toLocaleDateString()}
                      </span>
                      <button
                        onClick={(e) => handleShare(e, album)}
                        className={styles.shareButton}
                        title="Share album"
                      >
                        <span className={styles.shareIcon}>🔗</span> Share
                      </button>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </>
      )}

    </div>
  );
}

export default Albums;
