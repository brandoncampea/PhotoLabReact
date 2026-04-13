// All code after this point is removed to ensure only the valid component and export remain.

import React from 'react';
import { useSasUrl } from '../../hooks/useSasUrl';

function PhotoSasThumbnail({ src, alt }: { src: string, alt: string }) {
  const sasUrl = useSasUrl(src);
  return (
    <img
      src={sasUrl || ''}
      alt={alt}
      style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border-color)' }}
    />
  );
}

interface Photo {
  id: string | number;
  fileName: string;
  thumbnailUrl: string;
  fullImageUrl?: string;
}

interface AdminPhotosProps {
  photos?: Photo[];
}

const AdminPhotos: React.FC<AdminPhotosProps> = ({ photos = [] }) => {
  return (
    <div className="admin-photos-page">
      <div className="admin-photo-list">
        {Array.isArray(photos) && photos.map((photo) => (
          <div key={photo.id} className="admin-photo-card">
            <div
              style={{ cursor: 'pointer' }}
              onClick={() => window.open(photo.fullImageUrl || photo.thumbnailUrl, '_blank')}
              title="Click to view full size"
            >
              <PhotoSasThumbnail src={photo.thumbnailUrl} alt={photo.fileName} />
            </div>
            <div className="photo-info">
              <p className="photo-filename" style={{ margin: 0 }}>{photo.fileName}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
  


export default AdminPhotos;

