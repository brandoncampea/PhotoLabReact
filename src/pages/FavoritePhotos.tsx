import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../services/api';
import WatermarkedImage from '../components/WatermarkedImage';
import PhotoOrderPanel from '../components/PhotoOrderPanel';
import type { Product, Photo } from '../types';

interface FavPhoto {
  photoId: number;
  albumId: number;
  albumName: string;
  studioId: number;
  fileName: string;
  playerNames?: string;
  playerNumbers?: string;
  width?: number;
  height?: number;
}

const toPhoto = (fav: FavPhoto): Photo => ({
  id: fav.photoId,
  albumId: fav.albumId,
  fileName: fav.fileName,
  thumbnailUrl: `/api/photos/${fav.photoId}/asset?variant=thumbnail`,
  fullImageUrl: `/api/photos/${fav.photoId}/asset`,
  playerNames: fav.playerNames,
  playerNumbers: fav.playerNumbers,
  width: fav.width,
  height: fav.height,
});

const FavoritePhotos: React.FC = () => {
  const [searchParams] = useSearchParams();

  const favToken = useRef<string>('');

  const [photos, setPhotos] = useState<FavPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhotoId, setSelectedPhotoId] = useState<number | null>(null);
  const [albumProducts, setAlbumProducts] = useState<Map<number, Product[]>>(new Map());
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [favTogglingId, setFavTogglingId] = useState<number | null>(null);

  useEffect(() => {
    const fromUrl = searchParams.get('favToken');
    if (fromUrl) {
      localStorage.setItem('favToken', fromUrl);
      favToken.current = fromUrl;
    } else {
      favToken.current = localStorage.getItem('favToken') || '';
    }
  }, [searchParams]);

  const loadFavorites = useCallback(async () => {
    const token = favToken.current || localStorage.getItem('favToken') || '';
    if (!token) { setLoading(false); return; }
    try {
      const res = await api.get(`/albums/favorites/all?token=${encodeURIComponent(token)}`);
      setPhotos(res.data.photos || []);
    } catch {
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => loadFavorites(), 50);
    return () => clearTimeout(t);
  }, [loadFavorites]);

  const loadProductsForAlbum = useCallback(async (albumId: number) => {
    if (albumProducts.has(albumId)) return;
    setLoadingProducts(true);
    try {
      const res = await api.get(`/products/active?albumId=${albumId}`);
      const products: Product[] = Array.isArray(res.data) ? res.data : (res.data?.products || []);
      setAlbumProducts(prev => new Map(prev).set(albumId, products));
    } catch {
      setAlbumProducts(prev => new Map(prev).set(albumId, []));
    } finally {
      setLoadingProducts(false);
    }
  }, [albumProducts]);

  const handleSelectPhoto = (photo: FavPhoto) => {
    const next = selectedPhotoId === photo.photoId ? null : photo.photoId;
    setSelectedPhotoId(next);
    if (next !== null) loadProductsForAlbum(photo.albumId);
  };

  const handleUnfavorite = async (photo: FavPhoto) => {
    const token = favToken.current || localStorage.getItem('favToken') || '';
    if (!token || favTogglingId === photo.photoId) return;
    setFavTogglingId(photo.photoId);
    try {
      await api.post(`/albums/${photo.albumId}/favorites`, { token, photoId: photo.photoId });
      setPhotos(prev => prev.filter(p => p.photoId !== photo.photoId));
      if (selectedPhotoId === photo.photoId) setSelectedPhotoId(null);
    } catch { /* non-fatal */ } finally {
      setFavTogglingId(null);
    }
  };

  const selectedFav = photos.find(p => p.photoId === selectedPhotoId) ?? null;

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>
        Loading saved photos…
      </div>
    );
  }

  const token = favToken.current || localStorage.getItem('favToken') || '';

  if (!token || photos.length === 0) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: '#aaa', textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 48 }}>♡</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#ddd' }}>No saved photos yet</div>
        <div style={{ fontSize: 14, maxWidth: 360 }}>
          Browse your albums and tap the heart icon on any photo to save it here.
        </div>
        <Link to="/albums" style={{ marginTop: 8, padding: '10px 24px', background: '#7b61ff', color: '#fff', borderRadius: 8, fontWeight: 700, textDecoration: 'none', fontSize: 15 }}>
          Browse Albums
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#fff' }}>Saved Photos</h1>
          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>{photos.length} photo{photos.length !== 1 ? 's' : ''} saved</div>
        </div>
        <Link to="/account" style={{ fontSize: 13, color: '#7b61ff', textDecoration: 'none' }}>← My Account</Link>
      </div>

      <div className="albums-grid">
        {photos.map((photo) => {
          const playerNames = (photo.playerNames || '').split(',').filter(p => p.trim());
          const playerNumbers = (photo.playerNumbers || '').split(',').filter(p => p.trim());
          const hasPlayers = playerNames.length > 0 || playerNumbers.length > 0;
          const isSelected = selectedPhotoId === photo.photoId;

          return (
            <React.Fragment key={photo.photoId}>
              <div
                className="album-card"
                style={{ padding: 0, overflow: 'hidden', border: isSelected ? '2px solid #7b61ff' : undefined, position: 'relative', cursor: 'pointer' }}
                onClick={() => handleSelectPhoto(photo)}
                role="button"
                tabIndex={0}
                aria-label={`Select photo ${photo.fileName}`}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleSelectPhoto(photo); }}
              >
                <WatermarkedImage
                  src={`/api/photos/${photo.photoId}/asset?variant=thumbnail`}
                  alt={photo.fileName}
                  style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block' }}
                  studioId={photo.studioId}
                />

                {/* Unfavorite button */}
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); handleUnfavorite(photo); }}
                  disabled={favTogglingId === photo.photoId}
                  style={{
                    position: 'absolute', bottom: 6, right: 6, zIndex: 10,
                    width: 28, height: 28, borderRadius: '50%', border: 'none',
                    background: 'rgba(244,114,182,0.9)', color: '#fff',
                    fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.15s',
                  }}
                  aria-label="Remove from favorites"
                  title="Remove from saved"
                >
                  ♥
                </button>

                {/* Album label */}
                <div style={{ position: 'absolute', bottom: 6, left: 6, zIndex: 10, background: 'rgba(0,0,0,0.6)', borderRadius: 4, padding: '2px 7px', fontSize: 11, color: '#ddd', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {photo.albumName}
                </div>

                {hasPlayers && (
                  <div
                    className="player-hover-overlay"
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(20,19,32,0.9)', display: 'none', alignItems: 'center', justifyContent: 'center', padding: 12 }}
                  >
                    <div style={{ textAlign: 'center', color: '#fff' }}>
                      {playerNames.length > 0 && (
                        <div style={{ marginBottom: playerNumbers.length > 0 ? 8 : 0 }}>
                          <div style={{ fontSize: '0.85rem', color: '#a8a8b8', marginBottom: 4 }}>Players</div>
                          <div style={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.4 }}>
                            {playerNames.map((name, idx) => <div key={idx}>{name.trim()}</div>)}
                          </div>
                        </div>
                      )}
                      {playerNumbers.length > 0 && (
                        <div>
                          <div style={{ fontSize: '0.85rem', color: '#a8a8b8', marginBottom: 4 }}>Numbers</div>
                          <div style={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.4 }}>
                            {playerNumbers.map((num, idx) => <div key={idx}>#{num.trim()}</div>)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Full order panel — same as album view */}
              {isSelected && selectedFav && (
                <PhotoOrderPanel
                  photo={toPhoto(selectedFav)}
                  albumId={selectedFav.albumId}
                  albumName={selectedFav.albumName}
                  studioId={selectedFav.studioId}
                  products={albumProducts.get(selectedFav.albumId) || []}
                  productsLoading={loadingProducts && !albumProducts.has(selectedFav.albumId)}
                  onClose={() => setSelectedPhotoId(null)}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default FavoritePhotos;
