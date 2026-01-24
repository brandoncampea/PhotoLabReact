import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Album } from '../types';
import { albumService } from '../services/albumService';
import { analyticsService } from '../services/analyticsService';

const Albums: React.FC = () => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [filteredAlbums, setFilteredAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [categories, setCategories] = useState<string[]>([]);
  const [shareNotification, setShareNotification] = useState('');

  useEffect(() => {
    loadAlbums();
    // Track site visit
    analyticsService.trackVisit();
  }, []);

  const loadAlbums = async () => {
    try {
      const data = await albumService.getAlbums();
      // Sort albums by most recent first
      const sortedData = [...data].sort((a, b) => 
        new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime()
      );
      setAlbums(sortedData);
      setFilteredAlbums(sortedData);
      // Extract unique categories
      const uniqueCategories = Array.from(new Set(sortedData.map(a => a.category).filter(Boolean))) as string[];
      setCategories(uniqueCategories);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load albums');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedCategory === 'all') {
      setFilteredAlbums(albums);
    } else {
      setFilteredAlbums(albums.filter(album => album.category === selectedCategory));
    }
  }, [selectedCategory, albums]);

  const handleShare = async (e: React.MouseEvent, album: Album) => {
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
      } catch (err) {
        // User cancelled or error occurred
      }
    } else {
      // Fallback to clipboard
      try {
        await navigator.clipboard.writeText(url);
        setShareNotification('Link copied to clipboard!');
        setTimeout(() => setShareNotification(''), 3000);
      } catch (err) {
        console.error('Failed to copy link:', err);
      }
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
      {shareNotification && (
        <div style={{
          position: 'fixed',
          top: '80px',
          right: '20px',
          backgroundColor: '#4169E1',
          color: 'white',
          padding: '1rem 1.5rem',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1000,
          animation: 'slideIn 0.3s ease-out'
        }}>
          ✓ {shareNotification}
        </div>
      )}
      <div className="page-header">
        <h1>Photo Albums</h1>
        <p>Browse and select photos from our collection</p>
      </div>
      
      {categories.length > 0 && (
        <div className="filter-bar" style={{ marginBottom: '2rem' }}>
          <label htmlFor="category-filter" style={{ marginRight: '0.5rem', fontWeight: 500 }}>Filter by Category:</label>
          <select
            id="category-filter"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: '1px solid #ddd',
              fontSize: '1rem',
              cursor: 'pointer'
            }}
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      )}
      
      <div className="albums-grid">
        {filteredAlbums.length === 0 ? (
          <p className="empty-state">{selectedCategory === 'all' ? 'No albums available' : `No albums in "${selectedCategory}" category`}</p>
        ) : (
          filteredAlbums.map((album) => (
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                  <span className="album-date">
                    {new Date(album.createdDate).toLocaleDateString()}
                  </span>
                  <button
                    onClick={(e) => handleShare(e, album)}
                    className="btn-icon"
                    style={{
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.9rem',
                      backgroundColor: 'transparent',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
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
    </div>
  );
};

export default Albums;
