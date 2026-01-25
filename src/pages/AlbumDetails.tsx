import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Album, Photo } from '../types';
import { albumService } from '../services/albumService';
import { photoService } from '../services/photoService';
import { analyticsService } from '../services/analyticsService';
import { exifService } from '../services/exifService';
import PhotoCard from '../components/PhotoCard';
import CropperModal from '../components/CropperModal';

const AlbumDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [album, setAlbum] = useState<Album | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [filteredPhotos, setFilteredPhotos] = useState<Photo[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [playerFilter, setPlayerFilter] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'date'>('name');
  const [shareNotification, setShareNotification] = useState('');
  const [uploadingCsv, setUploadingCsv] = useState(false);
  const [csvMessage, setCsvMessage] = useState('');
  const [showCsvUpload, setShowCsvUpload] = useState(false);

  useEffect(() => {
    if (id) {
      loadAlbumDetails(parseInt(id));
    }
  }, [id, searchParams]);

  useEffect(() => {
    // Filter and sort photos based on search term, player filter, and sort option
    let filtered = photos.filter(photo => 
      exifService.searchInMetadata(photo, searchTerm)
    );

    // Apply player name filter
    if (playerFilter) {
      filtered = filtered.filter(photo => 
        photo.playerNames?.toLowerCase().includes(playerFilter.toLowerCase())
      );
    }

    // Sort photos
    if (sortBy === 'name') {
      filtered = [...filtered].sort((a, b) => 
        a.fileName.localeCompare(b.fileName)
      );
    } else if (sortBy === 'date') {
      filtered = [...filtered].sort((a, b) => {
        const dateA = a.metadata?.dateTaken || new Date(0).toISOString();
        const dateB = b.metadata?.dateTaken || new Date(0).toISOString();
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });
    }

    setFilteredPhotos(filtered);
  }, [photos, searchTerm, playerFilter, sortBy]);

  const loadAlbumDetails = async (albumId: number) => {
    try {
      const [albumData, photosData] = await Promise.all([
        albumService.getAlbum(albumId),
        photoService.getPhotosByAlbum(albumId),
      ]);
      setAlbum(albumData);
      setPhotos(photosData);
      
      // Track album view
      analyticsService.trackAlbumView(albumId, albumData.name);
      
      // Check if a specific photo is linked via URL parameter
      const photoId = searchParams.get('photo');
      if (photoId) {
        const linkedPhoto = photosData.find(p => p.id === parseInt(photoId));
        if (linkedPhoto) {
          setSelectedPhoto(linkedPhoto);
          analyticsService.trackPhotoView(linkedPhoto.id, linkedPhoto.fileName, albumId, albumData.name);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load album details');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoClick = (photo: Photo) => {
    // Track photo view
    if (album) {
      analyticsService.trackPhotoView(photo.id, photo.fileName, album.id, album.name);
    }
    setSelectedPhoto(photo);
  };

  const handleCloseCropper = () => {
    setSelectedPhoto(null);
  };

  const handleShareAlbum = async () => {
    if (!album) return;
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
      try {
        await navigator.clipboard.writeText(url);
        setShareNotification('Album link copied to clipboard!');
        setTimeout(() => setShareNotification(''), 3000);
      } catch (err) {
        console.error('Failed to copy link:', err);
      }
    }
  };

  const handleSharePhoto = async (e: React.MouseEvent, photo: Photo) => {
    e.stopPropagation();
    const url = `${window.location.origin}/albums/${id}?photo=${photo.id}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: photo.fileName,
          text: `Check out this photo: ${photo.fileName}`,
          url: url,
        });
      } catch (err) {
        // User cancelled or error occurred
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        setShareNotification('Photo link copied to clipboard!');
        setTimeout(() => setShareNotification(''), 3000);
      } catch (err) {
        console.error('Failed to copy link:', err);
      }
    }
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;

    setUploadingCsv(true);
    setCsvMessage('');

    try {
      const result = await photoService.uploadPlayerNamesCsv(parseInt(id), file);
      setCsvMessage(`✓ Success! Updated ${result.photosUpdated} of ${result.totalPhotos} photos with player names`);
      
      // Reload photos to show player names
      const updatedPhotos = await photoService.getPhotosByAlbum(parseInt(id));
      setPhotos(updatedPhotos);
      
      setShowCsvUpload(false);
      setTimeout(() => setCsvMessage(''), 4000);
    } catch (err: any) {
      setCsvMessage(`✗ Error: ${err.response?.data?.error || 'Failed to upload player names'}`);
    } finally {
      setUploadingCsv(false);
    }
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
          <div style={{ flex: 1 }}>
            <button onClick={() => navigate('/albums')} className="btn-back">
              ← Back to Albums
            </button>
            <h1>{album.name}</h1>
            <p>{album.description}</p>
          </div>
          <button
            onClick={handleShareAlbum}
            className="btn btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              marginTop: '1rem'
            }}
          >
            🔗 Share Album
          </button>
        </div>
      </div>

      <div className="search-filter-bar">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search photos by name or metadata..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="search-box">
          <input
            type="text"
            placeholder="Filter by player name..."
            value={playerFilter}
            onChange={(e) => setPlayerFilter(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="sort-controls">
          <label htmlFor="sort-by">Sort by:</label>
          <select
            id="sort-by"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'name' | 'date')}
            className="sort-select"
          >
            <option value="name">File Name</option>
            <option value="date">Date Taken</option>
          </select>
        </div>
        <button
          onClick={() => setShowCsvUpload(!showCsvUpload)}
          className="btn btn-secondary"
          style={{ padding: '0.5rem 1rem' }}
        >
          📋 {showCsvUpload ? 'Cancel' : 'Upload Player Names'}
        </button>
      </div>

      {showCsvUpload && (
        <div style={{
          padding: '1rem',
          backgroundColor: '#f5f5f5',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          border: '1px solid #e0e0e0'
        }}>
          <h3>Upload Player Names CSV</h3>
          <p style={{ marginBottom: '1rem', color: '#666' }}>
            CSV should have columns: <code>file_name</code> (or <code>fileName</code>) and <code>player_name</code> (or <code>playerName</code>)
          </p>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <input
              type="file"
              accept=".csv"
              onChange={handleCsvUpload}
              disabled={uploadingCsv}
              className="file-input"
            />
            {uploadingCsv && <span>Uploading...</span>}
          </div>
          {csvMessage && (
            <div style={{
              marginTop: '1rem',
              padding: '0.75rem',
              backgroundColor: csvMessage.includes('Error') ? '#fee' : '#efe',
              color: csvMessage.includes('Error') ? '#c33' : '#3c3',
              borderRadius: '4px'
            }}>
              {csvMessage}
            </div>
          )}
          <div style={{ marginTop: '1rem', color: '#666', fontSize: '0.9rem' }}>
            <strong>Example CSV format:</strong>
            <pre style={{ backgroundColor: '#fff', padding: '0.5rem', borderRadius: '4px', overflow: 'auto' }}>
file_name,player_name
photo001.jpg,John Smith
photo002.jpg,Jane Doe
photo003.jpg,John Smith
            </pre>
          </div>
        </div>
      )}
      
      
      <div className="photos-grid">
        {filteredPhotos.length === 0 ? (
          <p className="empty-state">
            {photos.length === 0 
              ? 'No photos in this album' 
              : 'No photos match your search'}
          </p>
        ) : (
          filteredPhotos.map((photo) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              onClick={() => handlePhotoClick(photo)}
              onShare={(e) => handleSharePhoto(e, photo)}
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
