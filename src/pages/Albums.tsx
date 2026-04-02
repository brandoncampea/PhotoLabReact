
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
};


const Albums: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [studios, setStudios] = useState<PublicStudio[]>([]);
  const [selectedStudio, setSelectedStudio] = useState<PublicStudio | null>(null);
  const [albums, setAlbums] = useState<PublicAlbum[]>([]);
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

  const handleShare = async (e: React.MouseEvent, album: PublicAlbum) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}/albums/${album.id}`;
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
          <div className="albums-grid">
            {albums.length === 0 ? (
              <p className="empty-state">No albums available for this studio</p>
            ) : (
              albums.map((album) => (
                <Link to={`/albums/${album.id}?studioSlug=${encodeURIComponent(selectedStudio.publicSlug)}`} key={album.id} className="album-card">
                  <div className="album-cover">
                    <AlbumCoverCarousel
                      albumId={album.id}
                      albumName={album.name}
                      coverImageUrl={album.coverImageUrl}
                      previewImageUrls={album.previewImageUrls}
                    />
                    <div className="album-overlay">
                      <span className="photo-count">{album.photoCount} photos</span>
                    </div>
                  </div>
                  <div className="album-info">
                    <h3>{album.name}</h3>
                    <p>{album.description}</p>
                    <div className="album-info-row">
                      <span className="album-date">
                        {new Date(album.createdDate).toLocaleDateString()}
                      </span>
                      <button
                        onClick={(e) => handleShare(e, album)}
                        className="btn-icon"
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        title="Share album"
                      >
                        🔗 Share
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
};

export default Albums;
