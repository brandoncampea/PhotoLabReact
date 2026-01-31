import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Album, Photo, Package } from '../types';
import { albumService } from '../services/albumService';
import { photoService } from '../services/photoService';
import { analyticsService } from '../services/analyticsService';
import { exifService } from '../services/exifService';
import { packageService } from '../services/packageService';
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
  const [packages, setPackages] = useState<Package[]>([]);
  const [showPackages, setShowPackages] = useState(false);
  const [selectedPackageForOrder, setSelectedPackageForOrder] = useState<Package | null>(null);
  const [selectedPhotoForPackage, setSelectedPhotoForPackage] = useState<Photo | null>(null);

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
      
      // Load packages if album has a price list
      if (albumData.priceListId) {
        try {
          const packagesData = await packageService.getAll(albumData.priceListId);
          const activePackages = packagesData.filter(p => p.isActive);
          setPackages(activePackages);
        } catch (err) {
          console.error('Failed to load packages:', err);
        }
      }
      
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

  const handlePackagePhotoClick = (pkg: Package, photo: Photo) => {
    // Track photo view for package
    if (album) {
      analyticsService.trackPhotoView(photo.id, photo.fileName, album.id, album.name);
    }
    setSelectedPackageForOrder(pkg);
    setSelectedPhotoForPackage(photo);
  };

  const handleCloseCropper = () => {
    setSelectedPhoto(null);
    setSelectedPackageForOrder(null);
    setSelectedPhotoForPackage(null);
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
        {packages.length > 0 && (
          <button
            onClick={() => setShowPackages(!showPackages)}
            className="btn btn-primary"
            style={{ padding: '0.5rem 1rem' }}
          >
            📦 {showPackages ? 'Hide' : 'View'} Packages ({packages.length})
          </button>
        )}
      </div>

      {showPackages && packages.length > 0 && (
        <div style={{
          padding: '1.5rem',
          backgroundColor: '#f5f5f5',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          border: '1px solid #e0e0e0'
        }}>
          <h3 style={{ marginTop: 0 }}>📦 Available Packages</h3>
          <p style={{ color: '#666', marginBottom: '1.5rem' }}>
            Select a package, then choose a photo to apply it to. The package will be expanded into individual products in your cart.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {packages.map((pkg) => {
              const retailValue = packageService.calculateRetailValue(pkg);
              const savings = packageService.calculateSavings(pkg);
              const savingsPercent = packageService.getSavingsPercentage(pkg);
              
              return (
                <div
                  key={pkg.id}
                  style={{
                    backgroundColor: 'white',
                    border: '2px solid #ff6b35',
                    borderRadius: '8px',
                    padding: '1rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.02)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 107, 53, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#ff6b35' }}>{pkg.name}</h4>
                  <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.75rem' }}>{pkg.description}</p>
                  
                  <div style={{ borderTop: '1px solid #e0e0e0', paddingTop: '0.75rem', marginBottom: '0.75rem' }}>
                    <strong>Includes:</strong>
                    <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem', fontSize: '0.9rem' }}>
                      {pkg.items.map((item, idx) => (
                        <li key={idx}>
                          {item.quantity}x {item.product?.name} - {item.productSize?.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div>
                      <div style={{ fontSize: '0.85rem', color: '#999', textDecoration: 'line-through' }}>
                        Retail: ${retailValue.toFixed(2)}
                      </div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#4caf50' }}>
                        ${pkg.packagePrice.toFixed(2)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#ff6b35' }}>
                        Save {savingsPercent}%
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#666' }}>
                        (${savings.toFixed(2)})
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => {
                      setShowPackages(false);
                      // Scroll to photos section
                      document.querySelector('.photos-grid')?.scrollIntoView({ behavior: 'smooth' });
                      alert(`Now select a photo to apply "${pkg.name}" package to.`);
                      // Store package in state, modify photo click handler
                      const originalPhotoCards = document.querySelectorAll('.photo-card');
                      originalPhotoCards.forEach(card => {
                        card.addEventListener('click', (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const photoIndex = Array.from(originalPhotoCards).indexOf(card);
                          const photo = filteredPhotos[photoIndex];
                          if (photo) {
                            handlePackagePhotoClick(pkg, photo);
                          }
                        }, { once: true });
                      });
                    }}
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                  >
                    Select Photo for This Package
                  </button>
                </div>
              );
            })}
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
          albumPhotos={photos}
          onClose={handleCloseCropper}
        />
      )}

      {selectedPhotoForPackage && selectedPackageForOrder && (
        <CropperModal
          photo={selectedPhotoForPackage}
          albumPhotos={photos}
          onClose={handleCloseCropper}
          selectedPackage={selectedPackageForOrder}
        />
      )}
    </div>
  );
};

export default AlbumDetails;
