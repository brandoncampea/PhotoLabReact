import React, { useState, useEffect } from 'react';
import { useSasUrl } from '../../hooks/useSasUrl';
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
    attempts?: number;
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
  const [rosterUploading, setRosterUploading] = useState(false);
  const [rosterMessage, setRosterMessage] = useState<string | null>(null);
  const [rosterPlayers, setRosterPlayers] = useState<Array<{ playerName: string; playerNumber?: string }>>([]);

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  useEffect(() => {
    loadAlbums();
  }, []);

  useEffect(() => {
    // Set albumId from URL params after albums are loaded
    if (albums.length > 0) {
      const urlAlbumParam = searchParams.get('album');
      const urlAlbumId = urlAlbumParam ? parseInt(urlAlbumParam) : null;
      
      if (urlAlbumId && !isNaN(urlAlbumId) && albums.find(a => a.id === urlAlbumId)) {
        setAlbumId(urlAlbumId);
      } else {
        // Default to first album if URL param is invalid or missing
        const firstAlbumId = albums[0].id;
        setAlbumId(firstAlbumId);
        navigate(`/admin/photos?album=${firstAlbumId}`, { replace: true });
      }
    }
  }, [albums, searchParams, navigate]);

  useEffect(() => {
    if (albumId) {
      loadPhotos();
      loadRoster();
    }
  }, [albumId]);

  const loadAlbums = async () => {
    try {
      const data = await albumService.getAlbums();
      setAlbums(data);
    } catch (error) {
      console.error('Failed to load albums:', error);
    } finally {
      setLoading(false);
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

  const loadRoster = async () => {
    if (!albumId) return;
    try {
      const roster = await photoService.getAlbumRoster(albumId);
      setRosterPlayers(Array.isArray(roster) ? roster : []);
    } catch (error) {
      console.error('Failed to load roster:', error);
      setRosterPlayers([]);
    }
  };

  // Upload files handler (moved from loadPhotos)
  const uploadFiles = async (files: File[]) => {
    if (!files.length) return;

    // Clean up previous previews
    uploadItems.forEach((item) => URL.revokeObjectURL(item.previewUrl));

    const items: UploadItem[] = files.map((file, idx) => ({
      id: `${Date.now()}-${idx}-${file.name}`,
      file,
      previewUrl: URL.createObjectURL(file),
      progress: 0,
      status: 'queued',
      attempts: 0,
    }));

    setUploadItems(items);
    setUploading(true);
    setUploadMessage(null);
    setUploadProgress({ completed: 0, total: files.length });

    const uploadSingleItem = async (item: UploadItem, autoRetries = 2): Promise<boolean> => {
      let attempt = 0;
      const maxAttempts = autoRetries + 1;

      while (attempt < maxAttempts) {
        attempt += 1;
        setUploadItems((prev) =>
          prev.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  status: 'uploading',
                  progress: 0,
                  attempts: attempt,
                  error: attempt > 1 ? `Retry ${attempt - 1}/${autoRetries}...` : undefined,
                }
              : entry
          )
        );

        try {
          await photoService.uploadPhotos(albumId ?? 0, [item.file], undefined, (percent) => {
            setUploadItems((prev) =>
              prev.map((entry) =>
                entry.id === item.id
                  ? { ...entry, status: 'uploading', progress: percent, attempts: attempt }
                  : entry
              )
            );
          });

          setUploadItems((prev) =>
            prev.map((entry) =>
              entry.id === item.id
                ? { ...entry, status: 'done', progress: 100, attempts: attempt, error: undefined }
                : entry
            )
          );
          return true;
        } catch (error) {
          const hasMoreRetries = attempt < maxAttempts;
          if (hasMoreRetries) {
            await wait(600);
            continue;
          }

          console.error(`Failed to upload photo ${item.file.name}:`, error);
          setUploadItems((prev) =>
            prev.map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    status: 'error',
                    attempts: attempt,
                    error: `Upload failed after ${attempt} attempt${attempt === 1 ? '' : 's'}.`,
                  }
                : entry
            )
          );
          return false;
        }
      }

      return false;
    };

    try {
      let completed = 0;
      let failed = 0;

      for (let i = 0; i < items.length; i += 1) {
        const current = items[i];
        const ok = await uploadSingleItem(current, 2);
        if (ok) {
          completed += 1;
        } else {
          failed += 1;
        }
        setUploadProgress({ completed: completed + failed, total: files.length });
      }

      if (failed === 0) {
        setUploadMessage({ type: 'success', text: `Uploaded ${completed} photo${completed === 1 ? '' : 's'} successfully.` });
      } else if (completed > 0) {
        setUploadMessage({ type: 'error', text: `Uploaded ${completed} photo${completed === 1 ? '' : 's'}, ${failed} failed.` });
      } else {
        setUploadMessage({ type: 'error', text: 'Upload failed. Please try again.' });
      }

      await loadPhotos();
      await loadAlbums();

      // When all uploads finish successfully, clear progress UI and show gallery state.
      if (failed === 0 && completed === files.length) {
        items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
        setUploadItems([]);
        setUploadProgress({ completed: 0, total: 0 });
        setShowUploadPanel(false);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleRetryUploadItem = async (itemId: string) => {
    const item = uploadItems.find((entry) => entry.id === itemId);
    if (!item) return;

    setUploading(true);
    try {
      let attempt = 0;
      const autoRetries = 2;
      const maxAttempts = autoRetries + 1;

      while (attempt < maxAttempts) {
        attempt += 1;
        setUploadItems((prev) =>
          prev.map((entry) =>
            entry.id === itemId
              ? { ...entry, status: 'uploading', progress: 0, attempts: attempt, error: undefined }
              : entry
          )
        );

        try {
          await photoService.uploadPhotos(albumId ?? 0, [item.file], undefined, (percent) => {
            setUploadItems((prev) =>
              prev.map((entry) =>
                entry.id === itemId
                  ? { ...entry, status: 'uploading', progress: percent, attempts: attempt }
                  : entry
              )
            );
          });

          setUploadItems((prev) =>
            prev.map((entry) =>
              entry.id === itemId
                ? { ...entry, status: 'done', progress: 100, attempts: attempt, error: undefined }
                : entry
            )
          );
          setUploadMessage({ type: 'success', text: `Retried and uploaded ${item.file.name}.` });
          await loadPhotos();
          await loadAlbums();
          return;
        } catch (error) {
          const hasMoreRetries = attempt < maxAttempts;
          if (hasMoreRetries) {
            await wait(600);
            continue;
          }

          setUploadItems((prev) =>
            prev.map((entry) =>
              entry.id === itemId
                ? { ...entry, status: 'error', attempts: attempt, error: `Upload failed after ${attempt} attempt${attempt === 1 ? '' : 's'}.` }
                : entry
            )
          );
          setUploadMessage({ type: 'error', text: `Retry failed for ${item.file.name}.` });
        }
      }
    } finally {
      setUploading(false);
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

  const handleAlbumChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextAlbumId = Number(event.target.value);
    if (!Number.isInteger(nextAlbumId) || nextAlbumId <= 0) return;
    setAlbumId(nextAlbumId);
    navigate(`/admin/photos?album=${nextAlbumId}`, { replace: true });
  };

  const getSelectedPlayersForPhoto = (photo: Photo) => {
    const selectedNames = String((photo as any).playerNames || '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    return new Set(selectedNames);
  };

  const handleTogglePlayerTag = async (photo: Photo, player: { playerName: string; playerNumber?: string }) => {
    const selected = getSelectedPlayersForPhoto(photo);
    if (selected.has(player.playerName)) {
      selected.delete(player.playerName);
    } else {
      selected.add(player.playerName);
    }

    const selectedPlayers = Array.from(selected).map((name) => {
      const match = rosterPlayers.find((p) => p.playerName === name);
      return {
        playerName: name,
        playerNumber: match?.playerNumber || null,
      };
    });

    try {
      await photoService.updatePhotoPlayers(photo.id, selectedPlayers);
      setPhotos((prev) => prev.map((p) => (
        p.id === photo.id
          ? {
              ...p,
              playerNames: selectedPlayers.map((sp) => sp.playerName).join(', ') || undefined,
              playerNumbers: selectedPlayers.map((sp) => sp.playerNumber).filter(Boolean).join(', ') || undefined,
            }
          : p
      )));
    } catch (error) {
      console.error('Failed to update photo player tags:', error);
      setUploadMessage({ type: 'error', text: 'Failed to update player tag.' });
    }
  };

  const handleClearPhotoTags = async (photo: Photo) => {
    try {
      await photoService.updatePhotoPlayers(photo.id, []);
      setPhotos((prev) => prev.map((p) => (
        p.id === photo.id
          ? {
              ...p,
              playerNames: undefined,
              playerNumbers: undefined,
            }
          : p
      )));
    } catch (error) {
      console.error('Failed to clear photo player tags:', error);
      setUploadMessage({ type: 'error', text: 'Failed to clear player tags.' });
    }
  };

  const handleRosterCsvUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !albumId) return;

    setRosterUploading(true);
    setRosterMessage(null);
    try {
      const result = await photoService.uploadPlayerNamesCsv(albumId, file);
      await loadPhotos();
      await loadRoster();
      const rosterSaved = Number((result as any).rosterPlayersSaved || 0);
      const trained = Number((result as any).facialRecognitionTrained || 0);
      setRosterMessage(`Roster uploaded: ${result.photosUpdated} photo(s) tagged, ${rosterSaved} roster player(s) saved, ${trained} training sample(s) captured.`);
    } catch (error: any) {
      const backendMessage = error?.response?.data?.error;
      setRosterMessage(backendMessage || 'Failed to upload roster CSV.');
    } finally {
      setRosterUploading(false);
      event.target.value = '';
    }
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
                  {item.error && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginTop: '0.2rem' }}>
                      <div className="danger-text" style={{ fontSize: '0.75rem' }}>{item.error}</div>
                      {item.status === 'error' && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.1rem 0.45rem', fontSize: '0.72rem', lineHeight: 1.2 }}
                          onClick={() => handleRetryUploadItem(item.id)}
                          disabled={uploading}
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  )}
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
          <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <input
              type="file"
              id="roster-csv-upload"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={handleRosterCsvUpload}
              disabled={rosterUploading || !albumId}
            />
            <label htmlFor="roster-csv-upload" className="btn btn-secondary" style={{ margin: 0 }}>
              {rosterUploading ? 'Uploading roster…' : '📋 Upload Roster CSV'}
            </label>
            <span className="muted-text" style={{ fontSize: '0.8rem' }}>
              Reused across this studio’s future album uploads.
            </span>
          </div>
          {rosterMessage && (
            <p className={rosterMessage.toLowerCase().includes('failed') ? 'danger-text' : 'success-text'} style={{ margin: '0.45rem 0 0 0', fontSize: '0.85rem' }}>
              {rosterMessage}
            </p>
          )}
        </div>
      )}

      <div className="photos-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
        gap: '2rem',
        marginTop: '2rem',
        justifyItems: 'center',
      }}>
        {photos.map((photo) => (
          <div key={photo.id} className="admin-photo-card">
            <div style={{ cursor: 'pointer' }}
                 onClick={() => window.open(photo.fullImageUrl || photo.thumbnailUrl, '_blank')}
                 title="Click to view full size">
              <PhotoSasThumbnail src={photo.thumbnailUrl} alt={photo.fileName} />
            </div>
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
              {!!(photo as any).playerNames && (
                <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.82rem', color: '#f5b041', fontWeight: 600 }}>
                  👤 {(photo as any).playerNames}
                </p>
              )}
              <div style={{ marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 0 }}>
                    Player Tags (click to toggle)
                  </label>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleClearPhotoTags(photo)}
                    disabled={!((photo as any).playerNames || '').trim()}
                    style={{ padding: '0.12rem 0.45rem', fontSize: '0.72rem', lineHeight: 1.2 }}
                    title="Clear all tags for this photo"
                  >
                    Clear all
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  {rosterPlayers.map((player, idx) => {
                    const selected = getSelectedPlayersForPhoto(photo).has(player.playerName);
                    return (
                      <button
                        key={`${player.playerName}-${player.playerNumber || ''}-${idx}`}
                        type="button"
                        onClick={() => handleTogglePlayerTag(photo, player)}
                        style={{
                          border: '1px solid var(--border-color)',
                          borderRadius: '999px',
                          padding: '0.2rem 0.55rem',
                          fontSize: '0.78rem',
                          cursor: 'pointer',
                          background: selected ? 'var(--primary-color)' : 'var(--bg-tertiary)',
                          color: selected ? '#fff' : 'var(--text-primary)',
                        }}
                        title={selected ? 'Click to untag' : 'Click to tag'}
                      >
                        {player.playerNumber ? `${player.playerName} #${player.playerNumber}` : player.playerName}
                      </button>
                    );
                  })}
                </div>
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
            background: 'rgba(30, 32, 48, 0.92)', // solid dark background
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

// Helper component for SAS-protected photo thumbnails
function PhotoSasThumbnail({ src, alt }: { src: string, alt: string }) {
  const isBlobName = src && !src.startsWith('/') && !src.startsWith('http');
  const sasUrl = isBlobName ? useSasUrl(src) : null;
  return (
    <img
      src={isBlobName ? (sasUrl || '') : src}
      alt={alt}
      style={{
        width: 360,
        height: 360,
        objectFit: 'cover',
        borderRadius: 8,
        background: '#222',
        display: 'block',
      }}
    />
  );
}

// Helper to format photo metadata for display
function getMetadataForDisplay(photo: Photo | null): Record<string, string | number> {
  if (!photo) return {};
  const metadata: Record<string, string | number> = {
    'File Name': photo.fileName || 'N/A',
    'Photo ID': photo.id,
  };
  if (photo.width && photo.height) {
    metadata['Dimensions'] = `${photo.width} × ${photo.height}`;
  }
  if ((photo as any).aspectRatio) {
    metadata['Aspect Ratio'] = (photo as any).aspectRatio;
  }
  if ((photo as any).orientation) {
    metadata['Orientation'] = (photo as any).orientation;
  }
  if ((photo as any).megapixels) {
    metadata['Megapixels'] = (photo as any).megapixels;
  }
  // Add more fields as needed
  return metadata;
}

export default AdminPhotos;
