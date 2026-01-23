import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Album, Photo } from '../types';
import { albumService } from '../services/albumService';
import { photoService } from '../services/photoService';
import PhotoCard from '../components/PhotoCard';
import CropperModal from '../components/CropperModal';

const AlbumDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [album, setAlbum] = useState<Album | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (id) {
      loadAlbumDetails(parseInt(id));
    }
  }, [id]);

  const loadAlbumDetails = async (albumId: number) => {
    try {
      const [albumData, photosData] = await Promise.all([
        albumService.getAlbum(albumId),
        photoService.getPhotosByAlbum(albumId),
      ]);
      setAlbum(albumData);
      setPhotos(photosData);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load album details');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoClick = (photo: Photo) => {
    setSelectedPhoto(photo);
  };

  const handleCloseCropper = () => {
    setSelectedPhoto(null);
  };

  if (loading) {
    return <div className="loading">Loading album...</div>;
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  if (!album) {
    return <div className="error-message">Album not found</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <button onClick={() => navigate('/albums')} className="btn-back">
          ← Back to Albums
        </button>
        <h1>{album.name}</h1>
        <p>{album.description}</p>
      </div>
      
      <div className="photos-grid">
        {photos.length === 0 ? (
          <p className="empty-state">No photos in this album</p>
        ) : (
          photos.map((photo) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              onClick={() => handlePhotoClick(photo)}
            />
          ))
        )}
      </div>

      {selectedPhoto && (
        <CropperModal
          photo={selectedPhoto}
          onClose={handleCloseCropper}
        />
      )}
    </div>
  );
};

export default AlbumDetails;
