import React from 'react';
import { Photo } from '../types';

interface PhotoCardProps {
  photo: Photo;
  onClick: () => void;
}

const PhotoCard: React.FC<PhotoCardProps> = ({ photo, onClick }) => {
  return (
    <div className="photo-card" onClick={onClick}>
      <div className="photo-image">
        <img src={photo.thumbnailUrl} alt={photo.fileName} />
        <div className="photo-overlay">
          <button className="btn-view">View & Order</button>
        </div>
      </div>
      <div className="photo-info">
        <p className="photo-filename">{photo.fileName}</p>
        <p className="photo-price">${photo.price.toFixed(2)}</p>
      </div>
    </div>
  );
};

export default PhotoCard;
