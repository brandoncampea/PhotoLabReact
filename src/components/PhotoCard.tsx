import React from 'react';
import { Photo } from '../types';
import WatermarkedImage from './WatermarkedImage';

interface PhotoCardProps {
  photo: Photo;
  onClick: () => void;
  onShare?: (e: React.MouseEvent) => void;
}

const PhotoCard: React.FC<PhotoCardProps> = ({ photo, onClick, onShare }) => {
  const metadata = photo.metadata;
  
  return (
    <div className="photo-card" onClick={onClick}>
      <div className="photo-image">
        <WatermarkedImage src={photo.thumbnailUrl} alt={photo.fileName} />
        <div className="photo-overlay">
          <button className="btn-view">View & Order</button>
          {onShare && (
            <button
              className="btn-share"
              onClick={onShare}
              style={{
                position: 'absolute',
                top: '0.5rem',
                right: '0.5rem',
                padding: '0.4rem 0.6rem',
                fontSize: '0.85rem',
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'white';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
              title="Share photo"
            >
              🔗
            </button>
          )}
        </div>
      </div>
      <div className="photo-info">
        <p className="photo-filename">{photo.fileName}</p>
        {photo.playerNames && (
          <p style={{ color: '#ff6b35', fontWeight: '500', margin: '0.25rem 0' }}>
            👤 {photo.playerNames}
          </p>
        )}
        {metadata && (
          <div className="photo-metadata">
            {metadata.cameraMake && (
              <p className="metadata-text">📷 {metadata.cameraMake} {metadata.cameraModel}</p>
            )}
            {metadata.dateTaken && (
              <p className="metadata-text">📅 {new Date(metadata.dateTaken).toLocaleDateString()}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PhotoCard;
