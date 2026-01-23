import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Photo, Album } from '../../types';
import { photoService } from '../../services/photoService';
import { albumService } from '../../services/albumService';
import { adminMockApi } from '../../services/adminMockApi';

const AdminPhotos: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const albumId = parseInt(searchParams.get('album') || '1');
  const [albums, setAlbums] = useState<Album[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadAlbums();
  }, []);

  useEffect(() => {
    loadPhotos();
  }, [albumId]);

  const loadAlbums = async () => {
    try {
      const data = await albumService.getAlbums();
      setAlbums(data);
    } catch (error) {
      console.error('Failed to load albums:', error);
    }
  };

  const loadPhotos = async () => {
    try {
      const data = await photoService.getPhotosByAlbum(albumId);
      setPhotos(data);
    } catch (error) {
      console.error('Failed to load photos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    try {
      await adminMockApi.photos.upload(albumId, files);
      loadPhotos();
    } catch (error) {
      console.error('Failed to upload photos:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this photo?')) {
      try {
        await adminMockApi.photos.delete(id);
        loadPhotos();
      } catch (error) {
        console.error('Failed to delete photo:', error);
      }
    }
  };

  const handleAlbumChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newAlbumId = e.target.value;
    navigate(`/admin/photos?album=${newAlbumId}`);
  };

  const currentAlbum = albums.find(a => a.id === albumId);

  if (loading) {
    return <div className="loading">Loading photos...</div>;
  }

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>Manage Photos</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label htmlFor="album-select" style={{ fontSize: '0.9rem', fontWeight: 500 }}>
              Select Album *
            </label>
            <select
              id="album-select"
              value={albumId}
              onChange={handleAlbumChange}
              className="form-select"
              style={{ minWidth: '200px' }}
            >
              {albums.map(album => (
                <option key={album.id} value={album.id}>
                  {album.name}
                </option>
              ))}
            </select>
          </div>
          <div className="upload-btn" style={{ marginTop: '1.5rem' }}>
            <input
              type="file"
              id="photo-upload"
              multiple
              accept="image/*"
              onChange={handleUpload}
              style={{ display: 'none' }}
              disabled={uploading}
            />
            <label htmlFor="photo-upload" className="btn btn-primary">
              {uploading ? 'Uploading...' : '+ Upload Photos'}
            </label>
          </div>
        </div>
      </div>

      {currentAlbum && (
        <div style={{ 
          padding: '1rem', 
          backgroundColor: '#f8f9fa', 
          borderRadius: '8px', 
          marginBottom: '1.5rem',
          border: '1px solid #e9ecef'
        }}>
          <p style={{ margin: 0, fontSize: '0.95rem', color: '#666' }}>
            <strong>Current Album:</strong> {currentAlbum.name} ({photos.length} photos)
          </p>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: '#888' }}>
            All photos must belong to an album. Select an album above to upload or manage photos.
          </p>
        </div>
      )}

      <div className="photos-grid">
        {photos.map((photo) => (
          <div key={photo.id} className="admin-photo-card">
            <img src={photo.thumbnailUrl} alt={photo.fileName} />
            <div className="photo-info">
              <p className="photo-filename">{photo.fileName}</p>
              <p className="photo-price">${photo.price.toFixed(2)}</p>
            </div>
            <button
              onClick={() => handleDelete(photo.id)}
              className="btn-delete"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminPhotos;
