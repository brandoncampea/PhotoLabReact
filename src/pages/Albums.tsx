import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Album } from '../types';
import { albumService } from '../services/albumService';
import { analyticsService } from '../services/analyticsService';

const Albums: React.FC = () => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAlbums();
    // Track site visit
    analyticsService.trackVisit();
  }, []);

  const loadAlbums = async () => {
    try {
      const data = await albumService.getAlbums();
      setAlbums(data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load albums');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading albums...</div>;
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Photo Albums</h1>
        <p>Browse and select photos from our collection</p>
      </div>
      
      <div className="albums-grid">
        {albums.length === 0 ? (
          <p className="empty-state">No albums available</p>
        ) : (
          albums.map((album) => (
            <Link to={`/albums/${album.id}`} key={album.id} className="album-card">
              <div className="album-cover">
                <img src={album.coverImageUrl} alt={album.name} />
                <div className="album-overlay">
                  <span className="photo-count">{album.photoCount} photos</span>
                </div>
              </div>
              <div className="album-info">
                <h3>{album.name}</h3>
                <p>{album.description}</p>
                <span className="album-date">
                  {new Date(album.createdDate).toLocaleDateString()}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
};

export default Albums;
