import React, { useEffect, useState } from 'react';
import '../PhotoLabStyles.css';
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
  const { id, slug } = useParams<{ id: string; slug?: string }>();
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
    const url = slug
      ? `${window.location.origin}/s/${slug}/albums/${album.id}`
      : `${window.location.origin}/albums/${album.id}`;
    
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
    const url = slug
      ? `${window.location.origin}/s/${slug}/albums/${id}?photo=${photo.id}`
      : `${window.location.origin}/albums/${id}?photo=${photo.id}`;
    
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
        <div className="album-details-notification">
          ✓ {shareNotification}
        </div>
      )}
      <div className="page-header">
        <div className="album-details-header-row">
          <div className="album-details-header-col">
            <button onClick={() => navigate(slug ? `/s/${slug}` : '/albums')} className="btn-back">
              ← Back to Albums
            </button>
            <h1>{album.name}</h1>
            <p>{album.description}</p>
          </div>
          <button
            onClick={handleShareAlbum}
            className="btn btn-secondary btn-share-album"
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
        <div className="album-details-packages-section">
          <h3 className="album-details-packages-title">📦 Available Packages</h3>
          <p className="album-details-packages-desc">
            Select a package, then choose a photo to apply it to. The package will be expanded into individual products in your cart.
          </p>
          <div className="album-details-packages-grid">
            {packages.map((pkg) => {
              const retailValue = packageService.calculateRetailValue(pkg);
              const savings = packageService.calculateSavings(pkg);
              const savingsPercent = packageService.getSavingsPercentage(pkg);
              return (
                <div
                  key={pkg.id}
                  className="package-card album-details-package-card"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.02)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 107, 53, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <h4 className="album-details-package-title">{pkg.name}</h4>
                  <p className="album-details-package-desc">{pkg.description}</p>
                  <div className="album-details-package-includes">
                    <strong>Includes:</strong>
                    <ul className="album-details-package-list">
                      {pkg.items.map((item, idx) => (
                        <li key={idx}>
                          {item.quantity}x {item.product?.name} - {item.productSize?.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="album-details-package-row">
                    <div>
                      <div className="album-details-package-retail">
                        Retail: ${retailValue.toFixed(2)}
                      </div>
                      <div className="album-details-package-price">
                        ${pkg.packagePrice.toFixed(2)}
                      </div>
                    </div>
                    <div className="album-details-package-savings">
                      <div className="album-details-package-savings-percent">
                        Save {savingsPercent}%
                      </div>
                      <div className="album-details-package-savings-amount">
                        (${savings.toFixed(2)})
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowPackages(false);
                      document.querySelector('.photos-grid')?.scrollIntoView({ behavior: 'smooth' });
                      alert(`Now select a photo to apply "${pkg.name}" package to.`);
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
}

export default AlbumDetails;
