import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Photo, Album } from '../types';
import { photoService } from '../services/photoService';
import { albumService } from '../services/albumService';
import { exifService } from '../services/exifService';
import { analyticsService } from '../services/analyticsService';
import PhotoCard from '../components/PhotoCard';
import CropperModal from '../components/CropperModal';

const Search: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [allPhotos, setAllPhotos] = useState<Photo[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [filteredPhotos, setFilteredPhotos] = useState<Photo[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'album'>('name');
  const [metadataFilter, setMetadataFilter] = useState<'all' | 'camera' | 'iso' | 'aperture' | 'shutterSpeed' | 'focalLength'>('all');
  const [shareNotification, setShareNotification] = useState('');

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    // Update URL when search query changes
    if (searchQuery) {
      setSearchParams({ q: searchQuery });
    } else {
      setSearchParams({});
    }
    filterPhotos();
  }, [searchQuery, sortBy, metadataFilter, allPhotos]);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const albumsData = await albumService.getAlbums();
      setAlbums(albumsData);

      // Load photos from all albums
      const photosPromises = albumsData.map(album => 
        photoService.getPhotosByAlbum(album.id)
      );
      const photosArrays = await Promise.all(photosPromises);
      const photos = photosArrays.flat();
      setAllPhotos(photos);
    } catch (error) {
      console.error('Error loading photos:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterPhotos = () => {
    let filtered = allPhotos;

    // Filter by search query
    if (searchQuery.trim()) {
      filtered = filtered.filter(photo => {
        // Apply metadata filter if specified
        if (metadataFilter !== 'all') {
          const metadata = photo.metadata;
          if (!metadata) return false;
          
          switch(metadataFilter) {
            case 'camera':
              const cameraTerm = searchQuery.toLowerCase();
              return (metadata.cameraMake?.toLowerCase().includes(cameraTerm) || 
                      metadata.cameraModel?.toLowerCase().includes(cameraTerm));
            case 'iso':
              return metadata.iso?.toLowerCase().includes(searchQuery.toLowerCase());
            case 'aperture':
              return metadata.aperture?.toLowerCase().includes(searchQuery.toLowerCase());
            case 'shutterSpeed':
              return metadata.shutterSpeed?.toLowerCase().includes(searchQuery.toLowerCase());
            case 'focalLength':
              return metadata.focalLength?.toLowerCase().includes(searchQuery.toLowerCase());
            default:
              return true;
          }
        }
        
        // Default: search all fields
        return exifService.searchInMetadata(photo, searchQuery);
      });
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
    } else if (sortBy === 'album') {
      filtered = [...filtered].sort((a, b) => a.albumId - b.albumId);
    }

    setFilteredPhotos(filtered);
  };

  const handlePhotoClick = (photo: Photo) => {
    const album = albums.find(a => a.id === photo.albumId);
    if (album) {
      analyticsService.trackPhotoView(photo.id, photo.fileName, album.id, album.name);
    }
    setSelectedPhoto(photo);
  };

  const getAlbumName = (albumId: number) => {
    return albums.find(a => a.id === albumId)?.name || 'Unknown Album';
  };

  const handleSharePhoto = async (e: React.MouseEvent, photo: Photo) => {
    e.stopPropagation();
    const url = `${window.location.origin}/albums/${photo.albumId}?photo=${photo.id}`;
    
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

  if (loading) {
    return <div className="loading">Loading photos...</div>;
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
        <h1>Search Photos</h1>
        <p>Search across all albums by filename, camera, or metadata</p>
      </div>

      <div className="search-filter-bar">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search by filename, camera make/model, ISO, date..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
            autoFocus
          />
        </div>
        <div className="sort-controls">
          <label htmlFor="metadata-filter">Search in:</label>
          <select
            id="metadata-filter"
            value={metadataFilter}
            onChange={(e) => setMetadataFilter(e.target.value as any)}
            className="sort-select"
          >
            <option value="all">All Fields</option>
            <option value="camera">Camera Make/Model</option>
            <option value="iso">ISO</option>
            <option value="aperture">Aperture</option>
            <option value="shutterSpeed">Shutter Speed</option>
            <option value="focalLength">Focal Length</option>
          </select>
        </div>
        <div className="sort-controls">
          <label htmlFor="sort-by">Sort by:</label>
          <select
            id="sort-by"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'name' | 'date' | 'album')}
            className="sort-select"
          >
            <option value="name">File Name</option>
            <option value="date">Date Taken</option>
            <option value="album">Album</option>
          </select>
        </div>
      </div>

      {searchQuery && (
        <div className="search-results-info">
          <p>
            {filteredPhotos.length} {filteredPhotos.length === 1 ? 'photo' : 'photos'} found
            {searchQuery && ` for "${searchQuery}"`}
            {metadataFilter !== 'all' && ` in ${metadataFilter}`}
          </p>
        </div>
      )}

      <div className="photos-grid">
        {filteredPhotos.length === 0 ? (
          <div className="empty-state">
            {searchQuery ? (
              <>
                <p>No photos match your search</p>
                <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.5rem' }}>
                  Try different keywords or browse all photos in{' '}
                  <a href="/albums" style={{ color: '#4169E1' }}>Albums</a>
                </p>
              </>
            ) : (
              <>
                <p>Enter a search term to find photos</p>
                <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.5rem' }}>
                  Search by filename, camera make/model, date, or camera settings
                </p>
              </>
            )}
          </div>
        ) : (
          filteredPhotos.map((photo) => {
            const metadataDisplay = exifService.getMetadataDisplay(photo.metadata);
            return (
              <div key={photo.id} style={{ position: 'relative' }}>
                <PhotoCard
                  photo={photo}
                  onClick={() => handlePhotoClick(photo)}
                  onShare={(e) => handleSharePhoto(e, photo)}
                />
                <div style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  backgroundColor: 'rgba(0, 0, 0, 0.7)',
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                }}>
                  {getAlbumName(photo.albumId)}
                </div>
                {metadataDisplay.length > 0 && (
                  <div style={{
                    backgroundColor: '#f9f9f9',
                    padding: '0.75rem',
                    fontSize: '0.85rem',
                    color: '#666',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: '0.5rem',
                    borderTop: '1px solid #eee'
                  }}>
                    {metadataDisplay.map((field) => (
                      <div key={field.label} style={{ minWidth: '140px' }}>
                        <span style={{ fontWeight: 500 }}>{field.label}:</span>
                        <span style={{ marginLeft: '0.5rem' }}>{field.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {selectedPhoto && (
        <CropperModal
          photo={selectedPhoto}
          onClose={() => setSelectedPhoto(null)}
        />
      )}
    </div>
  );
};

export default Search;
