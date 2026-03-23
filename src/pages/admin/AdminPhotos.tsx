import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Photo, Album, PhotoMetadata } from '../../types';
import { photoService } from '../../services/photoService';
import { albumService } from '../../services/albumService';
import { albumAdminService } from '../../services/albumAdminService';





const AdminPhotos: React.FC = () => {
  type UploadItem = {
    id: string;
    file: File;
    previewUrl: string;
    progress: number;
    status: 'queued' | 'uploading' | 'done' | 'error';
    metadata?: PhotoMetadata;
    error?: string;
  };

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number }>({ completed: 0, total: 0 });
  const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showUploadPanel, setShowUploadPanel] = useState(true);
  const [metadataPhoto, setMetadataPhoto] = useState<Photo | null>(null);
  const [albumId, setAlbumId] = useState<number | null>(null);
  const [coverMessage, setCoverMessage] = useState<string | null>(null);
  const [coverLoadingId, setCoverLoadingId] = useState<number | null>(null);
  const [coverSuccessId, setCoverSuccessId] = useState<number | null>(null);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    loadAlbums();
  }, []);

  useEffect(() => {
    // Set albumId from URL params after albums are loaded
    if (albums.length > 0) {
      const urlAlbumParam = searchParams.get('album');
      const urlAlbumId = urlAlbumParam ? parseInt(urlAlbumParam) : null;
      
      console.log('AdminPhotos: URL album param:', urlAlbumParam, 'parsed:', urlAlbumId);
      console.log('AdminPhotos: Available albums:', albums.map(a => ({ id: a.id, name: a.name })));
      
      if (urlAlbumId && !isNaN(urlAlbumId) && albums.find(a => a.id === urlAlbumId)) {
        console.log('AdminPhotos: Setting albumId to URL param:', urlAlbumId);
        setAlbumId(urlAlbumId);
      } else {
        // Default to first album if URL param is invalid or missing
        const firstAlbumId = albums[0].id;
        console.log('AdminPhotos: Defaulting to first album:', firstAlbumId);
        setAlbumId(firstAlbumId);
        navigate(`/admin/photos?album=${firstAlbumId}`, { replace: true });
      }
    }
  }, [albums, searchParams, navigate]);

  useEffect(() => {
    if (albumId) {
      loadPhotos();
    }
  }, [albumId]);

  const loadAlbums = async () => {
    try {
      const data = await albumService.getAlbums();
      console.log('AdminPhotos: Loaded albums:', data);
      setAlbums(data);
    } catch (error) {
      console.error('Failed to load albums:', error);
    }
  };

  const loadPhotos = async () => {
    if (!albumId) return;
    try {
      const data = await photoService.getPhotosByAlbum(albumId);
      setPhotos(data);
    } catch (error) {
      console.error('Failed to load photos:', error);
    } finally {
      setLoading(false);
    }
  };

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0 || !albumId) return;

    uploadItems.forEach((item) => URL.revokeObjectURL(item.previewUrl));

    const items: UploadItem[] = files.map((file, idx) => ({
      id: `${Date.now()}-${idx}-${file.name}`,
      file,
      previewUrl: URL.createObjectURL(file),
      progress: 0,
      status: 'queued',
    }));

    setUploadItems(items);
    setUploading(true);
    try {
      // Extract metadata from each file
      // Metadata extraction is currently unused
      
      // Descriptions currently unused; we pass files only
      await photoService.uploadPhotos(albumId, files);
      loadPhotos();
      loadAlbums(); // Reload albums to update photo count
    } catch (error) {
      console.error('Failed to upload photos:', error);
      setUploadMessage({ type: 'error', text: 'Upload failed. Please try again.' });
    } finally {
      setUploading(false);
      setUploadProgress({ completed: 0, total: 0 });
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await uploadFiles(files);
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith('image/'));
    await uploadFiles(files);
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this photo?')) {
      try {
        await photoService.deletePhoto(id);
        loadPhotos();
        loadAlbums(); // Reload albums to update photo count
      } catch (error) {
        console.error('Failed to delete photo:', error);
      }
    }
  };

  const handleDeleteAll = async () => {
    if (photos.length === 0) {
      alert('No photos to delete');
      return;
    }
    
    if (confirm(`Are you sure you want to delete all ${photos.length} photos from this album? This cannot be undone.`)) {
      try {
        // Delete all photos in parallel
        await Promise.all(photos.map(photo => photoService.deletePhoto(photo.id)));
        // Immediately clear UI
        setPhotos([]);
        // Then reload to ensure sync
        await loadPhotos();
        await loadAlbums(); // Reload albums to update photo count
      } catch (error) {
        console.error('Failed to delete all photos:', error);
      }
    }
  };

  const handleSetCover = async (photo: Photo) => {
    if (!albumId) return;
    try {
      setCoverLoadingId(photo.id);
      // Use the actual photo's full image URL as the cover
      const coverUrl = photo.fullImageUrl || photo.thumbnailUrl;
      if (!coverUrl) {
        setCoverMessage('Photo URL not available');
        setTimeout(() => setCoverMessage(null), 2500);
        return;
      }
      await albumAdminService.updateAlbum(albumId, { coverImageUrl: coverUrl, coverPhotoId: photo.id });
      await loadAlbums();
      setCoverMessage('Cover updated');
      setCoverSuccessId(photo.id);
      setTimeout(() => setCoverMessage(null), 2000);
      setTimeout(() => setCoverSuccessId(null), 1500);
    } catch (error) {
      console.error('Failed to set album cover:', error);
      setCoverMessage('Failed to update cover');
      setTimeout(() => setCoverMessage(null), 2500);
    } finally {
      setCoverLoadingId(null);
    }
  };

  const handleAlbumChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newAlbumId = e.target.value;
    setShowUploadPanel(true);
    navigate(`/admin/photos?album=${newAlbumId}`);
  };

  const getMetadataForDisplay = (photo: Photo): Record<string, string> => {
    const rawMetadata = photo.metadata;
    let parsedMetadata: Record<string, any> = {};

    if (typeof rawMetadata === 'string') {
      try {
        parsedMetadata = JSON.parse(rawMetadata);
      } catch {
        parsedMetadata = { raw: rawMetadata };
      }
    } else if (rawMetadata && typeof rawMetadata === 'object') {
      parsedMetadata = rawMetadata as Record<string, any>;
    }

    const metadata: Record<string, string> = {
      'File Name': photo.fileName || 'N/A',
      'Photo ID': String(photo.id),
    };

    if (photo.width && photo.height) {
      metadata.Dimensions = `${photo.width} × ${photo.height}`;
    }

    Object.entries(parsedMetadata).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      const label = key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (s) => s.toUpperCase())
        .trim();
      metadata[label] = String(value);
    });

    return metadata;
  };

  const currentAlbum = albums.find(a => a.id === albumId);

  if (loading || !albumId) {
    return <div className="loading">Loading...</div>;
  }

  if (albums.length === 0) {
    return (
      <div className="admin-page">
        <div className="page-header">
          <h1>Manage Photos</h1>
        </div>
        <div className="empty-state">
          <p>No albums found. Please create an album first.</p>
          <a href="/admin/albums" className="btn btn-primary">Go to Albums</a>
        </div>
      </div>
    );
  }

  return (
    <>
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
          {showUploadPanel ? (
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
                {uploading
                  ? `Uploading ${uploadProgress.completed}/${uploadProgress.total}...`
                  : '+ Upload Photos'}
              </label>
              {photos.length > 0 && (
                <button
                  onClick={handleDeleteAll}
                  className="btn btn-danger"
                  style={{ marginLeft: '0.5rem' }}
                >
                  🗑️ Delete All ({photos.length})
                </button>
              )}
            </div>
          ) : (
            <div style={{ marginTop: '1.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowUploadPanel(true)}
              >
                + Upload More Photos
              </button>
              {photos.length > 0 && (
                <button
                  onClick={handleDeleteAll}
                  className="btn btn-danger"
                  style={{ marginLeft: '0.5rem' }}
                >
                  🗑️ Delete All ({photos.length})
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(false);
        }}
        onDrop={handleDrop}
        style={{
          marginBottom: '1rem',
          padding: '1.25rem',
          border: `2px dashed ${isDragging ? 'var(--primary-color)' : 'var(--border-color)'}`,
          borderRadius: '0.75rem',
          backgroundColor: isDragging ? 'rgba(124, 92, 255, 0.12)' : 'var(--bg-tertiary)',
          textAlign: 'center',
          color: 'var(--text-secondary)',
        }}
      >
        Drag & drop images here to upload, or use the upload button.
      </div>

      {uploadItems.length > 0 && (
        <div className="admin-summary-box" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Upload Progress</h3>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {uploadItems.map((item) => (
              <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '56px 1fr', gap: '0.75rem', alignItems: 'center' }}>
                <img
                  src={item.previewUrl}
                  alt={item.file.name}
                  style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}
                />
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.9rem' }}>{item.file.name}</span>
                    <span className={item.status === 'error' ? 'danger-text' : item.status === 'done' ? 'success-text' : 'muted-text'} style={{ fontSize: '0.8rem' }}>
                      {item.status === 'uploading' ? `${item.progress}%` : item.status}
                    </span>
                  </div>
                  <div style={{ height: '8px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '999px', overflow: 'hidden', marginTop: '0.35rem' }}>
                    <div style={{ width: `${item.progress}%`, height: '100%', backgroundColor: item.status === 'error' ? 'var(--error-color)' : 'var(--primary-color)', transition: 'width 0.2s' }} />
                  </div>
                  {item.metadata && (
                    <div className="muted-text" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                      {item.metadata.cameraMake || 'Camera'} • {item.metadata.width || '?'}x{item.metadata.height || '?'}
                    </div>
                  )}
                  {item.error && <div className="danger-text" style={{ fontSize: '0.75rem' }}>{item.error}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {currentAlbum && (
        <div className="admin-summary-box" style={{ marginBottom: '1.5rem' }}>
          <p className="muted-text" style={{ margin: 0, fontSize: '0.95rem' }}>
            <strong>Current Album:</strong> {currentAlbum.name} ({photos.length} photos)
          </p>
          {coverMessage && (
            <p className={coverMessage.includes('Failed') ? 'danger-text' : 'success-text'} style={{ margin: '0.35rem 0 0 0', fontSize: '0.85rem' }}>
              {coverMessage}
            </p>
          )}
          <p className="muted-text" style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem' }}>
            All photos must belong to an album. Select an album above to upload or manage photos.
          </p>
          {uploadMessage && (
            <p className={uploadMessage.type === 'success' ? 'success-text' : 'danger-text'} style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem' }}>
              {uploadMessage.text}
            </p>
          )}
        </div>
      )}

      <div className="photos-grid">
        {photos.map((photo) => (
          <div key={photo.id} className="admin-photo-card">
            <img src={photo.thumbnailUrl} alt={photo.fileName} />
            <div className="photo-info">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                <p className="photo-filename" style={{ margin: 0 }}>{photo.fileName}</p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0.2rem 0.45rem', fontSize: '0.85rem', lineHeight: 1 }}
                  onClick={() => setMetadataPhoto(photo)}
                  title="View photo metadata"
                  aria-label={`View metadata for ${photo.fileName}`}
                >
                  i
                </button>
              </div>
            </div>
            {currentAlbum && currentAlbum.coverPhotoId === photo.id && (
              <div className="cover-photo-badge">
                Cover photo
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem' }}>
              <button
                onClick={() => handleSetCover(photo)}
                className="btn btn-secondary"
                disabled={
                  (currentAlbum ? currentAlbum.coverPhotoId === photo.id : false)
                  || coverLoadingId === photo.id
                }
              >
                {coverLoadingId === photo.id
                  ? 'Updating...'
                  : coverSuccessId === photo.id
                    ? '✓ Set'
                    : currentAlbum && currentAlbum.coverPhotoId === photo.id
                      ? 'Current cover'
                      : 'Set as cover'}
              </button>
              <button
                onClick={() => handleDelete(photo.id)}
                className="btn-delete"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {metadataPhoto && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '1rem'
          }}
          onClick={() => setMetadataPhoto(null)}
        >
          <div
            style={{
              width: 'min(680px, 100%)',
              maxHeight: '80vh',
              overflowY: 'auto',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              padding: '1rem'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0 }}>Photo Metadata</h3>
              <button type="button" className="btn btn-secondary" onClick={() => setMetadataPhoto(null)}>
                Close
              </button>
            </div>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {Object.entries(getMetadataForDisplay(metadataPhoto)).map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '180px 1fr',
                    gap: '0.75rem',
                    padding: '0.5rem 0',
                    borderBottom: '1px solid var(--border-color)'
                  }}
                >
                  <strong>{label}</strong>
                  <span style={{ wordBreak: 'break-word' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AdminPhotos;
