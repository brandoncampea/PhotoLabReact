import React, { useState, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Photo, Album } from '../../types';
import { photoService } from '../../services/photoService';
import { albumService } from '../../services/albumService';
import { extractPlayerNamesFromFilename, tagPhotoWithFilenamePlayers, getValidPlayerTagsFromFilename } from '../../utils/playerTagging';


const AdminPhotos: React.FC = () => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [albumId, setAlbumId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [roster, setRoster] = useState<Array<{ playerName: string; playerNumber?: string }>>([]);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    albumService.getAlbums().then(setAlbums);
  }, []);

  useEffect(() => {
    if (albums.length > 0) {
      const urlAlbumParam = searchParams.get('album');
      const urlAlbumId = urlAlbumParam ? parseInt(urlAlbumParam) : null;
      if (urlAlbumId && !isNaN(urlAlbumId) && albums.find(a => a.id === urlAlbumId)) {
        setAlbumId(urlAlbumId);
      } else {
        setAlbumId(albums[0].id);
        navigate(`/admin/photos?album=${albums[0].id}`, { replace: true });
      }
    }
  }, [albums, searchParams, navigate]);


  useEffect(() => {
    if (albumId) {
      setLoading(true);
      Promise.all([
        photoService.getPhotosByAlbum(albumId),
        photoService.getAlbumRoster(albumId)
      ]).then(([photos, roster]) => {
        setPhotos(photos);
        setRoster(roster);
      }).finally(() => setLoading(false));
    }
  }, [albumId]);

  const onDrop = (acceptedFiles: File[]) => {
    setSelectedFiles(acceptedFiles);
    setUploadError(null);
  };
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  // Use the correct upload method (commonly photoService.uploadFileToAzureBlob or similar)
  const handleUpload = async () => {
    if (!albumId || selectedFiles.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of selectedFiles) {
        // 1. Upload file to Azure Blob
        const blobName = `${albumId}/${Date.now()}_${file.name}`;
        const blobUrl = await (await import('../../services/photoService')).uploadFileToAzureBlob({ file, blobName });
        // 2. Notify backend to record the photo
        await (await import('../../services/photoService')).recordPhotoBlob({
          albumId,
          fileName: file.name,
          blobUrl,
          fileSizeBytes: file.size,
        });
      }
      setSelectedFiles([]);
      photoService.getPhotosByAlbum(albumId).then(setPhotos);
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Delete photo handler
  const handleDelete = async (photoId: number) => {
    if (!albumId) return;
    if (!window.confirm('Delete this photo?')) return;
    setLoading(true);
    try {
      await photoService.deletePhoto(photoId);
      photoService.getPhotosByAlbum(albumId).then(setPhotos);
    } finally {
      setLoading(false);
    }
  };


  // Tagging handler (multi-select, only update on change)
  const handleTag = async (photo: Photo, playerNames: string[]) => {
    await photoService.updatePhoto(photo.id, { playerNames });
    if (albumId) photoService.getPhotosByAlbum(albumId).then(setPhotos);
  };

  // Known team names (add more as needed)
  const knownTeams = ["Softball JV", "Softball V", "MM"];

  // Get tags for display: prefer playerNames, else use centralized filename tagging utility (filtered)
  function getPhotoTags(photo: Photo): string[] {
    const names = (photo.playerNames && String(photo.playerNames).split(',').map(n => n.trim()).filter(Boolean));
    if (names && names.length > 0) return names;
    // Use only the centralized utility for filename extraction and filtering
    return getValidPlayerTagsFromFilename(photo.fileName, roster, knownTeams);
  }

  // Use canonical asset endpoint for photo display
  function getPhotoUrl(photo: Photo): string {
    // Always prefer the /api/photos/{id}/asset?variant=thumbnail endpoint for admin thumbnails
    return `/api/photos/${photo.id}/asset?variant=thumbnail`;
  }

  // --- Toolbar Actions ---
  const handleNotifyWatchers = async () => {
    if (!albumId) return;
    await photoService.notifyWatchers(albumId);
    alert('Watchers notified!');
  };
  const handleDeleteAll = async () => {
    if (!albumId) return;
    if (!window.confirm('Delete ALL photos in this album?')) return;
    setLoading(true);
    await photoService.deleteAllPhotos(albumId);
    photoService.getPhotosByAlbum(albumId).then(setPhotos);
    setLoading(false);
  };
  const handleDeleteAllTags = async () => {
    if (!albumId) return;
    setLoading(true);
    await photoService.clearAllTagsInAlbum(albumId);
    photoService.getPhotosByAlbum(albumId).then(setPhotos);
    setLoading(false);
  };
  const handleTagAllFromFilenames = async () => {
    if (!albumId || photos.length === 0) return;
    setTaggingAll(true);
    setTagAllMessage(null);
    try {
      const photoList = photos.map(p => ({ id: p.id, fileName: p.fileName }));
      const result = await photoService.tagAllFromFilenames(albumId, photoList);
      setTagAllMessage(`Tagged ${result.tagged} photo${result.tagged === 1 ? '' : 's'} from filenames.`);
      await photoService.getPhotosByAlbum(albumId).then(setPhotos);
    } catch (err: any) {
      setTagAllMessage('Failed to tag photos from filenames.');
    } finally {
      setTaggingAll(false);
    }
  };
  const handleDetectAll = async () => {
    if (!albumId) return;
    setLoading(true);
    await photoService.detectAll(albumId);
    photoService.getPhotosByAlbum(albumId).then(setPhotos);
    setLoading(false);
  };
  const handleRosterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!albumId || !e.target.files?.[0]) return;
    setLoading(true);
    await photoService.uploadPlayerNamesCsv(albumId, e.target.files[0]);
    photoService.getPhotosByAlbum(albumId).then(setPhotos);
    setLoading(false);
  };

  const [taggingAll, setTaggingAll] = useState(false);
  const [tagAllMessage, setTagAllMessage] = useState<string | null>(null);

  return (
    <div>
      <h2>Manage Photos</h2>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <button onClick={handleNotifyWatchers}>Notify Watchers</button>
        <select
          value={albumId ?? ''}
          onChange={e => setAlbumId(Number(e.target.value))}
          disabled={albums.length === 0}
        >
          {albums.map(album => (
            <option key={album.id} value={album.id}>{album.name}</option>
          ))}
        </select>
        <input
          type="file"
          accept=".csv"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleRosterUpload}
        />
        <button onClick={() => fileInputRef.current?.click()}>Upload Roster CSV</button>
        <button onClick={handleDetectAll}>Detect All</button>
        <button onClick={handleTagAllFromFilenames}>Tag All from Filenames</button>
        <button onClick={handleDeleteAllTags}>Delete All Tags</button>
        <button onClick={handleDeleteAll}>Delete All ({photos.length})</button>
      </div>
      <div {...getRootProps()} style={{ border: '2px dashed #aaa', padding: 20, margin: '20px 0', background: isDragActive ? '#f0f0f0' : undefined }}>
        <input {...getInputProps()} />
        {isDragActive ? <p>Drop files here...</p> : <p>Drag & drop photos here, or click to select files</p>}
        {selectedFiles.length > 0 && (
          <div>
            <strong>Files to upload:</strong>
            <ul>
              {selectedFiles.map(file => <li key={file.name}>{file.name}</li>)}
            </ul>
            <button onClick={handleUpload} disabled={uploading}>Upload</button>
            {uploadError && <div style={{ color: 'red' }}>{uploadError}</div>}
          </div>
        )}
      </div>
      <h3>Photos</h3>
      {loading ? (
        <div>Loading photos...</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
          {photos.map(photo => (
            <div key={photo.id} style={{ border: '1px solid #ccc', padding: 12, width: 260, background: '#181828', borderRadius: 12 }}>
              <img src={getPhotoUrl(photo)} alt={photo.fileName} style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }} />
              <div style={{ fontWeight: 600 }}>{photo.fileName}</div>

              <div style={{ margin: '8px 0' }}>
                <strong>Player Tags:</strong>
                {/* Player Tags as pills */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5em', marginBottom: '0.5em' }}>
                  {getPhotoTags(photo).map((tag) => (
                    <span key={tag} style={{
                      display: 'inline-block',
                      background: '#2d2d3a',
                      color: '#fff',
                      borderRadius: '16px',
                      padding: '0.25em 0.75em',
                      fontSize: '0.95em',
                      fontWeight: 500,
                      marginRight: '0.25em',
                      marginBottom: '0.25em',
                      border: '1px solid #555',
                    }}>{tag}</span>
                  ))}
                </div>
                {/* End pills */}
                <button onClick={() => handleTag(photo, [])} style={{ marginTop: 4 }}>Clear all</button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => handleDelete(photo.id)} style={{ color: 'red' }}>Delete</button>
                <button onClick={() => photoService.setAsCover(photo.id)}>Set as cover</button>
                <button onClick={() => photoService.detectPhoto(photo.id)}>Detect</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Tag All From Filenames button and progress UI */}
      <div style={{ marginBottom: '1em' }}>
        <button onClick={handleTagAllFromFilenames} disabled={taggingAll || loading}>
          {taggingAll ? 'Tagging...' : 'Tag All From Filenames'}
        </button>
        {taggingAll && <span style={{ marginLeft: 10, color: '#ffb347' }}>Processing...</span>}
        {tagAllMessage && <span style={{ marginLeft: 10, color: tagAllMessage.startsWith('Tagged') ? '#7fff7f' : '#ff7f7f' }}>{tagAllMessage}</span>}
      </div>
    </div>
  );
};

export default AdminPhotos;
