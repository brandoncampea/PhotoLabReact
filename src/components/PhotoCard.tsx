import React, { useState } from 'react';
import { Photo } from '../types';
import WatermarkedImage from './WatermarkedImage';



interface PhotoCardProps {
  photo: Photo;
  onClick: () => void;
  onShare?: (e: React.MouseEvent) => void;
  studioId?: number;
}


const PhotoCard: React.FC<PhotoCardProps> = ({ photo, onClick, onShare, studioId }) => {
  const [showOverlay, setShowOverlay] = useState(false);
  const [imgError, setImgError] = useState(false);
  // Always use SAS URL for Azure blob images (full URL or blob path)
  // Always use the asset endpoint for thumbnails
  const assetUrl = `/api/photos/${photo.id}/asset?variant=thumbnail`;

  // Hide overlay when clicking outside
  React.useEffect(() => {
    if (!showOverlay) return;
    const handle = (e: MouseEvent) => {
      if (!(e.target as HTMLElement)?.closest('.photo-card')) {
        setShowOverlay(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showOverlay]);

  return (
    <div
      className="photo-card dark-card"
      tabIndex={0}
      style={{
        cursor: 'pointer',
        position: 'relative',
        minHeight: 0,
      }}
      onClick={() => setShowOverlay(true)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setShowOverlay(true); }}
    >
      <div className="photo-image" style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
        {!imgError ? (
          <WatermarkedImage
            src={assetUrl}
            alt={photo.fileName}
            fill={false}
            style={{
              maxWidth: 220,
              maxHeight: 180,
              width: '100%',
              height: 'auto',
              borderRadius: 8,
              border: '1px solid #e0e0e0',
              background: '#f8f8f8',
              objectFit: 'cover',
              boxShadow: '0 2px 8px rgba(0,0,0,0.07)'
            }}
            // @ts-ignore
            onError={() => setImgError(true)}
            onClick={onClick}
            studioId={studioId}
          />
        ) : (
          <img
            src="/public/placeholder-photo.png"
            alt="Photo unavailable"
            style={{
              maxWidth: 220,
              maxHeight: 180,
              width: '100%',
              height: 'auto',
              objectFit: 'cover',
              borderRadius: 8,
              background: '#23273a',
              opacity: 0.7
            }}
          />
        )}
        {/* ...existing code... */}
      </div>
        {/* Add Favorite Button */}
        <button
          className="btn-favorite dark-btn favorite-abs"
          title="Add to Favorites"
          onClick={e => {
            e.stopPropagation();
            // TODO: Add favorite logic
          }}
        >
          ★
        </button>
        {showOverlay && (
          <div className="photo-overlay" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(24,28,36,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10, borderRadius: 8 }}>
            <button
              className="btn-view dark-btn"
              style={{ width: '80%', fontWeight: 700, fontSize: 18, padding: '0.7rem 0', borderRadius: 8, background: '#7c5cff', color: '#fff', boxShadow: '0 2px 8px rgba(124,92,255,0.10)' }}
              onClick={e => {
                e.stopPropagation();
                setShowOverlay(false);
                onClick();
              }}
            >
              View & Order
            </button>
            {onShare && (
              <button
                className="btn-share dark-btn share-abs"
                onClick={e => { e.stopPropagation(); onShare(e); }}
                title="Share photo"
                style={{ marginLeft: 8, marginTop: 12 }}
              >
                <span role="img" aria-label="Share">🔗</span>
              </button>
            )}
            <button
              className="btn dark-btn"
              style={{ marginTop: 16, background: 'transparent', color: '#fff', border: '1px solid #fff', width: '60%' }}
              onClick={e => { e.stopPropagation(); setShowOverlay(false); }}
            >
              Close
            </button>
        </div>
      )}
      {/* Add Favorite Button */}
      <button
        className="btn-favorite dark-btn favorite-abs"
        title="Add to Favorites"
        onClick={e => {
          e.stopPropagation();
          // TODO: Add favorite logic
        }}
      >
        ★
      </button>
      {showOverlay && (
        <div className="photo-overlay" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(24,28,36,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10, borderRadius: 8 }}>
          <button
            className="btn-view dark-btn"
            style={{ width: '80%', fontWeight: 700, fontSize: 18, padding: '0.7rem 0', borderRadius: 8, background: '#7c5cff', color: '#fff', boxShadow: '0 2px 8px rgba(124,92,255,0.10)' }}
            onClick={e => {
              e.stopPropagation();
              setShowOverlay(false);
              onClick();
            }}
          >
            View & Order
          </button>
          {onShare && (
            <button
              className="btn-share dark-btn share-abs"
              onClick={e => { e.stopPropagation(); onShare(e); }}
              title="Share photo"
              style={{ marginLeft: 8, marginTop: 12 }}
            >
              <span role="img" aria-label="Share">🔗</span>
            </button>
          )}
          <button
            className="btn dark-btn"
            style={{ marginTop: 16, background: 'transparent', color: '#fff', border: '1px solid #fff', width: '60%' }}
            onClick={e => { e.stopPropagation(); setShowOverlay(false); }}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};

export default PhotoCard;
