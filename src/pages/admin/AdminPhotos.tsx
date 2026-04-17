import { autoTagPhotoFromFilenameAndFaces } from '../../utils/autoTagPhotoFromFilenameAndFaces';
// --- Shared types and utilities ---
type FaceTagBox = {
  id: string;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  playerName?: string | null;
  playerNumber?: string | null;
};

const parsePhotoMetadata = (photo: Photo | null): PhotoMetadata => {
  if (!photo) return {};

  const rawMetadata = (photo as any).metadata;
  if (rawMetadata && typeof rawMetadata === 'object') {
    return rawMetadata as PhotoMetadata;
  }

  if (typeof rawMetadata === 'string') {
    try {
      const parsed = JSON.parse(rawMetadata);
      return parsed as PhotoMetadata;
    } catch {
      return {};
    }
  }
  return {};
};
// --- Local type definitions and stubs for missing types/functions ---
type DuplicateMode = 'skip' | 'overwrite' | 'allow';

type UploadItem = {
  id: string;
  file: File;
  previewUrl: string;
  progress: number;
  status: 'queued' | 'uploading' | 'done' | 'error';
  duplicateMode: DuplicateMode;
  attempts: number;
  taggedPlayer?: string | null;
  description?: string;
  error?: string;
};

type DetectionResult = {
  detectedNumbers: string[];
  usedCachedDetections: boolean;
  detectedNumbersUpdatedAt: string | null;
  numberMatchingAvailable: boolean;
  rosterPlayersWithNumbersCount: number;
  faceMatchingAvailable: boolean;
  faceMatches: Array<{ playerName: string; playerNumber?: string; distance?: number }>;
  faceBoxes: FaceTagBox[];
  faceDetectionError?: string | null;
  numberMatches: Array<{ playerName: string; playerNumber?: string; matchedNumber?: string }>;
  suggestions: Array<{ playerName: string; playerNumber?: string; reasons?: string[]; confidence?: number }>;
};

// --- Implemented functions for auto-tagging and batch detection ---
// Extract player name from filename (e.g., PAYTON_ROGERS_63_MM.jpg => Payton Rogers)
const extractPlayerNameFromFilename = (filename: string): string | null => {
  const base = filename.replace(/\.[^.]+$/, '');
  const normalized = base.replace(/[-]+/g, '_');
  const parts = normalized.split('_').filter(Boolean);
  if (parts.length === 0) return null;
  // Only use alphabetic parts for name
  const isNamePart = (part: string) => /^[A-Za-z]+$/.test(part) && !(part.length <= 2 && part === part.toUpperCase());
  const nameParts = parts.filter(isNamePart);
  if (nameParts.length === 0) return null;
  const name = nameParts.map(
    (part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
  ).join(' ');
  return name.trim() || null;
};


// Dummy face detection (can be replaced with real model)
const detectFaceBoxesInBrowser = async (photo) => {
  // Placeholder: return empty array
  return { faceBoxes: [] };
};



const setImageRef = (_photoId: number, _el: HTMLImageElement | null) => {};
import React, { useState, useEffect } from 'react';

// Collapsible Upload Progress Panel (must be top-level)
interface UploadProgressPanelProps {
  uploadItems: UploadItem[];
  uploading: boolean;
  handleRetryUploadItem: (item: UploadItem) => void;
  setUploading: (uploading: boolean) => void;
}

function UploadProgressPanel({ uploadItems, uploading, handleRetryUploadItem, setUploading }: UploadProgressPanelProps) {
  const [collapsed, setCollapsed] = React.useState(true);
  const uploadingCount = uploadItems.filter((i: UploadItem) => i.status === 'uploading').length;
  const failedCount = uploadItems.filter((i: UploadItem) => i.status === 'error').length;
  const doneCount = uploadItems.filter((i: UploadItem) => i.status === 'done').length;

  return (
    <div className="admin-summary-box" style={{ marginBottom: '1.5rem', position: 'relative', zIndex: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setCollapsed(c => !c)}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', userSelect: 'none' }}>Upload Progress</h3>
        <button
          type="button"
          className="btn btn-tertiary"
          style={{ fontSize: '1.1rem', padding: '0.1rem 0.7rem', minWidth: 0 }}
          tabIndex={-1}
          aria-label={collapsed ? 'Expand upload panel' : 'Collapse upload panel'}
        >
          {collapsed ? '▼' : '▲'}
        </button>
      </div>

      {/* Always show thumbnails/progress bars */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem', overflowX: 'auto', paddingBottom: 4 }}>
        {uploadItems.map((item: UploadItem) => (
          <div key={item.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 48 }}>
            <img
              src={item.previewUrl}
              alt={item.file.name}
              style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border-color)' }}
            />
            <div style={{ width: 36, height: 5, background: 'var(--bg-primary)', borderRadius: 3, marginTop: 2, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
              <div style={{ width: `${item.progress}%`, height: '100%', background: item.status === 'error' ? 'var(--error-color)' : 'var(--primary-color)', transition: 'width 0.2s' }} />
            </div>
          </div>
        ))}
        <span style={{ fontSize: '0.85rem', color: 'var(--muted-color)', marginLeft: 8 }}>
          {uploadingCount > 0 && `${uploadingCount} uploading`}
          {doneCount > 0 && ` • ${doneCount} done`}
          {failedCount > 0 && ` • ${failedCount} failed`}
        </span>
      </div>

      {/* Show full details only when expanded */}
      {!collapsed && (
        <div style={{ marginTop: '1rem' }}>
          {/* Place for full upload details, actions, errors, etc. */}
          {/* ...existing or future expanded content... */}
        </div>
      )}
    </div>
  );
}


import * as blazeface from '@tensorflow-models/blazeface';
import '@tensorflow/tfjs';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Photo, Album, PhotoMetadata } from '../../types';
import { photoService, uploadFileToAzureBlob, recordPhotoBlob } from '../../services/photoService';
import { albumService } from '../../services/albumService';
import { albumAdminService } from '../../services/albumAdminService';
import { useSasUrl } from '../../hooks/useSasUrl';
import playerWatchlistService from '../../services/playerWatchlistService';
import notifyWatchersService from '../../services/notifyWatchersService';

const AdminPhotos: React.FC = () => {
  // Batch detect all photos in album (must be inside component for state access)
  const handleDetectAll = async () => {
    if (!photos.length) return;
    setLoading(true);
    try {
      for (const photo of photos) {
        await autoTagPhotoFromFilenameAndFaces({
          photo,
          rosterPlayers,
          photoService,
          onTagged: () => {},
        });
        // Optionally, run face detection here if needed
        // const detection = await detectFaceBoxesInBrowser(photo);
        // setDetectionByPhotoId(prev => ({ ...prev, [photo.id]: detection }));
      }
      await loadPhotos();
      setUploadMessage({ type: 'success', text: 'Auto-tagged all photos from filenames.' });
    } catch (err) {
      setUploadMessage({ type: 'error', text: 'Failed to auto-tag all photos.' });
    } finally {
      setLoading(false);
    }
  };

  // --- All state declarations must come first (before any useEffect) ---
  // albumId must be declared first so it is available to all hooks below
  const [albumId, setAlbumId] = useState<number | null>(null);
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
  const [coverMessage, setCoverMessage] = useState<string | null>(null);
  const [coverLoadingId, setCoverLoadingId] = useState<number | null>(null);
  const [coverSuccessId, setCoverSuccessId] = useState<number | null>(null);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [rosterUploading, setRosterUploading] = useState(false);
  const [rosterMessage, setRosterMessage] = useState<string | null>(null);
  const [rosterPlayers, setRosterPlayers] = useState<Array<{ playerName: string; playerNumber?: string }>>([]);
  const [pendingDuplicateFiles, setPendingDuplicateFiles] = useState<File[] | null>(null);
  const [pendingDuplicateCount, setPendingDuplicateCount] = useState(0);
  const [duplicateModeSelection, setDuplicateModeSelection] = useState<DuplicateMode>('skip');
  const [detectionByPhotoId, setDetectionByPhotoId] = useState<Record<number, DetectionResult>>({});
  const [detectingPhotoId, setDetectingPhotoId] = useState<number | null>(null);
  const [selectedFaceBoxByPhotoId, setSelectedFaceBoxByPhotoId] = useState<Record<number, string | null>>({});
  const [playerSearchByPhotoId, setPlayerSearchByPhotoId] = useState<Record<number, string>>({});
  // Notify Watchers state
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifyResult, setNotifyResult] = useState<string | null>(null);
  const [watchedTaggedPlayers, setWatchedTaggedPlayers] = useState<{ playerName: string, count: number }[]>([]);

  // Compute watched tagged players in album
  useEffect(() => {
    async function fetchWatchedTaggedPlayers() {
      if (!albumId || !photos.length) {
        setWatchedTaggedPlayers([]);
        return;
      }
      // Get all tagged player names in album
      const taggedNames = new Set<string>();
      photos.forEach(photo => {
        String(photo.playerNames || '').split(',').map(n => n.trim()).filter(Boolean).forEach(n => taggedNames.add(n));
      });
      if (taggedNames.size === 0) {
        setWatchedTaggedPlayers([]);
        return;
      }
      // Get roster with isWatching
      try {
        const roster = await playerWatchlistService.getRoster();
        const watched = Array.from(taggedNames).map(playerName => {
          const rosterEntry = roster.find(r => r.playerName.toLowerCase() === playerName.toLowerCase() && r.isWatching);
          return rosterEntry ? { playerName: rosterEntry.playerName, count: 1 } : null;
        }).filter(Boolean) as { playerName: string, count: number }[];
        setWatchedTaggedPlayers(watched);
      } catch {
        setWatchedTaggedPlayers([]);
      }
    }
    fetchWatchedTaggedPlayers();
  }, [albumId, photos]);

  const handleNotifyWatchers = async () => {
    if (!albumId) return;
    setNotifyLoading(true);
    setNotifyResult(null);
    try {
      const result = await notifyWatchersService.notify(albumId);
      setNotifyResult(result?.message || `Notified ${result?.notified || 0} watchers.`);
    } catch (err: any) {
      setNotifyResult(err?.response?.data?.error || 'Failed to notify watchers.');
    } finally {
      setNotifyLoading(false);
    }
  };




type FaceTagBox = {
  id: string;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  playerName?: string | null;
  playerNumber?: string | null;
};

const parsePhotoMetadata = (photo: Photo | null): PhotoMetadata => {
  if (!photo) return {};

  const rawMetadata = (photo as any).metadata;
  if (rawMetadata && typeof rawMetadata === 'object') {
    return rawMetadata as PhotoMetadata;
  }

  if (typeof rawMetadata === 'string') {
    try {
      const parsed = JSON.parse(rawMetadata);
      if (parsed && typeof parsed === 'object') {
        return parsed as PhotoMetadata;
      }
    } catch {
      return {};
    }
  }

  return {};
};

const getStoredFaceTags = (photo: Photo | null): FaceTagBox[] => {
  const faceTags = parsePhotoMetadata(photo).faceTags;
  return Array.isArray(faceTags) ? faceTags : [];
};

const mergeDetectedBoxesWithSavedTags = (photo: Photo, faceBoxes: FaceTagBox[]) => {
  const savedFaceTags = getStoredFaceTags(photo);
  return faceBoxes.map((box, index) => {
    const saved = savedFaceTags.find((tag) => tag.id === box.id) || savedFaceTags[index];
    return saved
      ? {
          ...box,
          playerName: saved.playerName || null,
          playerNumber: saved.playerNumber || null,
        }
      : box;
  });
};





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
      // Only keep the filename-matched player for each photo
      const cleaned = Array.isArray(data)
        ? data.map(photo => {
            const filename = photo.fileName || '';
            const base = filename.replace(/\.[^.]+$/, '');
            const normalized = base.replace(/[-]+/g, '_');
            let parts = normalized.split('_').filter(Boolean);
            if (parts.length === 0) return { ...photo, playerNames: undefined, playerNumbers: undefined };
            if (/^\d+$/.test(parts[parts.length - 1])) parts = parts.slice(0, -1);
            if (parts.length === 0) return { ...photo, playerNames: undefined, playerNumbers: undefined };
            const name = parts.map(
              (part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
            ).join(' ').trim();
            // Only keep this player if present
            const allNames = String(photo.playerNames || '').split(',').map(n => n.trim()).filter(Boolean);
            const keep = allNames.find(n => n.toLowerCase() === name.toLowerCase());
            return {
              ...photo,
              playerNames: keep ? keep : undefined,
              playerNumbers: keep ? photo.playerNumbers : undefined,
            };
          })
        : [];
      setPhotos(cleaned);
    } catch (error) {
      console.error('Failed to load photos:', error);
      setPhotos([]);
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

  const performUpload = async (workingFiles: File[], duplicateMode: DuplicateMode, skippedClientSide = 0) => {
    if (!workingFiles.length) return;

    // Clean up previous previews
    uploadItems.forEach((item) => URL.revokeObjectURL(item.previewUrl));

    const extractNameFromFilename = (filename: string): string | null => {
      const base = filename.replace(/\.[^.]+$/, '');
      const normalized = base.replace(/[-]+/g, '_');
      let parts = normalized.split('_').filter(Boolean);
      if (parts.length === 0) return null;
      if (/^\d+$/.test(parts[parts.length - 1])) parts = parts.slice(0, -1);
      if (parts.length === 0) return null;
      const name = parts.map(
        (part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
      ).join(' ');
      return name.trim() || null;
    };
    const items: UploadItem[] = workingFiles.map((file, idx) => ({
      id: `${Date.now()}-${idx}-${file.name}`,
      file,
      previewUrl: URL.createObjectURL(file),
      progress: 0,
      status: 'queued',
      duplicateMode,
      attempts: 0,
      taggedPlayer: extractNameFromFilename(file.name),
    }));

    setUploadItems(items);
    setUploading(true);
    setUploadMessage(null);
    setUploadProgress({ completed: 0, total: workingFiles.length });

    // Parallel upload logic (limit to 5 at a time)
    const parallelLimit = 5;
    let completed = 0;
    let failed = 0;

    const queue = [...items];

    const maxAutoRetries = 2;
    const uploadNext = async () => {
      if (queue.length === 0) return;
      const item = queue.shift();
      let attempts = item.attempts || 0;
      let success = false;
      while (attempts <= maxAutoRetries && !success) {
        setUploadItems((prev) =>
          prev.map((entry) =>
            entry.id === item.id ? { ...entry, status: 'uploading', progress: 0, attempts } : entry
          )
        );
        try {
          // Direct-to-Blob upload
          if (typeof albumId !== 'number') throw new Error('albumId must be a number');
          const blobName = `albums/${albumId}/${item.file.name}`;
          const blobUrl = await uploadFileToAzureBlob({
            file: item.file,
            blobName,
            onProgress: (percent) => {
              setUploadItems((prev) =>
                prev.map((entry) =>
                  entry.id === item.id ? { ...entry, progress: percent } : entry
                )
              );
            },
          });
          // Notify backend with blobUrl, description, and metadata
          const recordResult = await recordPhotoBlob({
            albumId: albumId as number,
            fileName: item.file.name,
            blobUrl,
            description: item.description,
            fileSizeBytes: item.file.size,
            // Optionally add width, height, metadata, playerName, playerNumber if available
          });


          // Ensure roster is loaded before auto-tagging
          if (rosterPlayers.length === 0) {
            await loadRoster();
          }


          // Fetch the latest photo object from backend for accurate tagging
          let latestPhoto = null;
          try {
            // Always fetch the latest list to ensure we get the just-uploaded photo
            const refreshedPhotos = await photoService.getPhotosByAlbumId(albumId as number);
            latestPhoto = refreshedPhotos.find((p: any) => p.fileName === item.file.name);
          } catch {}

          if (recordResult && recordResult.id && latestPhoto) {
            // Run auto-tagging and capture the detected player(s)
            let detectedPlayerNames: string[] = [];
            await autoTagPhotoFromFilenameAndFaces({
              photo: latestPhoto,
              rosterPlayers,
              photoService,
              handleDetectPlayers: () => {}, // No-op for now
              detectionByPhotoId,
              setDetectionByPhotoId,
              setUploadMessage,
              onTagged: (players: Array<{ playerName: string }>) => {
                detectedPlayerNames = players.map(p => p.playerName);
              }
            });
            // Wait for the backend to update before reloading
            await new Promise(res => setTimeout(res, 300));
            // Update uploadItems to show tagged players in the upload panel
            setUploadItems((prev) =>
              prev.map((entry) =>
                entry.id === item.id ? { ...entry, taggedPlayer: detectedPlayerNames.join(', ') } : entry
              )
            );
          }

          // Only reload photos after all uploads are done (outside the uploadNext loop)

          setUploadItems((prev) =>
            prev.map((entry) =>
              entry.id === item.id ? { ...entry, status: 'done', progress: 100, error: undefined, attempts } : entry
            )
          );
          completed += 1;
          success = true;
        } catch (error) {
          attempts += 1;
          if (attempts > maxAutoRetries) {
            setUploadItems((prev) =>
              prev.map((entry) =>
                entry.id === item.id ? { ...entry, status: 'error', error: `Upload failed after ${attempts} attempts.` } : entry
              )
            );
            failed += 1;
          }
        }
      }
      setUploadProgress({ completed: completed + failed, total: workingFiles.length });
      await uploadNext();
    };

    try {
      await Promise.all(Array(parallelLimit).fill(0).map(uploadNext));

      // After all uploads and tagging, reload photos and albums once
      await loadPhotos();
      await loadAlbums();

      if (failed === 0) {
        const skipSuffix = skippedClientSide > 0 ? ` Skipped ${skippedClientSide} duplicate photo${skippedClientSide === 1 ? '' : 's'}.` : '';
        setUploadMessage({ type: 'success', text: `Uploaded ${completed} photo${completed === 1 ? '' : 's'} successfully.${skipSuffix}` });
      } else if (completed > 0) {
        const skipSuffix = skippedClientSide > 0 ? ` Skipped ${skippedClientSide} duplicate photo${skippedClientSide === 1 ? '' : 's'}.` : '';
        setUploadMessage({ type: 'error', text: `Uploaded ${completed} photo${completed === 1 ? '' : 's'}, ${failed} failed.${skipSuffix}` });
      } else {
        setUploadMessage({ type: 'error', text: 'Upload failed. Please try again.' });
      }

      // When all uploads finish successfully, clear progress UI and show gallery state.
      if (failed === 0 && completed === workingFiles.length) {
        items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
        setUploadItems([]);
        setUploadProgress({ completed: 0, total: 0 });
        setShowUploadPanel(false);
      }
    } finally {
      setUploading(false);
    }
  };

  // Upload files handler
  const uploadFiles = async (files: File[]) => {
    if (!files.length) return;

    const normalizeName = (name: string) => name.trim().toLowerCase();
    const existingNames = new Set(photos.map((p) => normalizeName(String(p.fileName || ''))));
    const duplicateCandidates = files.filter((file) => existingNames.has(normalizeName(file.name)));

    // Helper to robustly extract a player name from a filename
    const extractNameFromFilename = (filename: string): string | null => {
      const base = filename.replace(/\.[^.]+$/, '');
      const normalized = base.replace(/[-]+/g, '_');
      const parts = normalized.split('_').filter(Boolean);
      if (parts.length === 0) return null;
      // Helper: is a name part (alphabetic, not all uppercase short code, not a number)
      const isNamePart = (part: string) => /^[A-Za-z]+$/.test(part) && !(part.length <= 2 && part === part.toUpperCase());
      const nameParts = parts.filter(isNamePart);
      if (nameParts.length === 0) return null;
      const name = nameParts.map(
        (part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
      ).join(' ');
      return name.trim() || null;
    };

    // Update uploadItems with detected player name immediately
    setUploadItems((prev: UploadItem[]) => [
      ...files.map((file, idx): UploadItem => {
        const detectedPlayer = extractNameFromFilename(file.name);
        return {
          id: `${Date.now()}-${idx}-${file.name}`,
          file,
          previewUrl: URL.createObjectURL(file),
          progress: 0,
          status: 'queued',
          duplicateMode: 'allow',
          attempts: 0,
          taggedPlayer: detectedPlayer || null,
        };
      }),
    ]);

    if (duplicateCandidates.length > 0) {
      setPendingDuplicateFiles(files);
      setPendingDuplicateCount(duplicateCandidates.length);
      setDuplicateModeSelection('skip');
      return;
    }

    await performUpload(files, 'allow', 0);
  };

  const handleConfirmDuplicateMode = async () => {
    if (!pendingDuplicateFiles?.length) return;

    const normalizeName = (name: string) => name.trim().toLowerCase();
    const existingNames = new Set(photos.map((p) => normalizeName(String(p.fileName || ''))));

    let workingFiles = pendingDuplicateFiles;
    let skippedClientSide = 0;

    if (duplicateModeSelection === 'skip') {
      workingFiles = pendingDuplicateFiles.filter((file) => !existingNames.has(normalizeName(file.name)));
      skippedClientSide = pendingDuplicateFiles.length - workingFiles.length;
      if (!workingFiles.length) {
        setUploadMessage({ type: 'success', text: `Skipped ${skippedClientSide} duplicate photo${skippedClientSide === 1 ? '' : 's'}. Nothing to upload.` });
        setPendingDuplicateFiles(null);
        setPendingDuplicateCount(0);
        return;
      }
    }

    setPendingDuplicateFiles(null);
    setPendingDuplicateCount(0);
    await performUpload(workingFiles, duplicateModeSelection, skippedClientSide);
  };

  const handleCancelDuplicateMode = () => {
    setPendingDuplicateFiles(null);
    setPendingDuplicateCount(0);
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
          // Direct-to-Blob upload for retry
          const blobName = `${albumId}/${item.file.name}`;
          const blobUrl = await uploadFileToAzureBlob({
            file: item.file,
            blobName,
            onProgress: (percent) => {
              setUploadItems((prev) =>
                prev.map((entry) =>
                  entry.id === itemId
                    ? { ...entry, status: 'uploading', progress: percent, attempts: attempt }
                    : entry
                )
              );
            },
          });
          await recordPhotoBlob({
            albumId: albumId as number,
            fileName: item.file.name,
            blobUrl,
            description: item.description,
            fileSizeBytes: item.file.size,
          });
          setUploadItems((prev) =>
            prev.map((entry) =>
              entry.id === itemId
                ? { ...entry, status: 'done', progress: 100, attempts: attempt, error: undefined }
                : entry
            )
          );
          // await handleDetectPlayers(uploaded[0], { silent: true }); // Removed: uploaded is undefined in this context
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
        // Refresh the page to reset all UI state
        window.location.reload();
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
      // Use backend asset endpoint for cover image
      const coverUrl = `/api/photos/${photo.id}/asset`;
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

  const getSelectedPlayerNamesForPhoto = (photo: Photo) => {
    return String((photo as any).playerNames || '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
  };

  const isPlayerSelectedForPhoto = (photo: Photo, playerName: string) => {
    const key = String(playerName || '').trim().toLowerCase();
    return getSelectedPlayerNamesForPhoto(photo).some((name) => name.toLowerCase() === key);
  };

  const upsertPhotoInState = (updatedPhoto: Photo) => {
    setPhotos((prev) => prev.map((photo) => (Number(photo.id) === Number(updatedPhoto.id) ? { ...photo, ...updatedPhoto } : photo)));
  };

  const handleTogglePlayerTag = async (photo: Photo, player: { playerName: string; playerNumber?: string }) => {
    const selectedNames = [...getSelectedPlayerNamesForPhoto(photo)];
    const clickedName = String(player.playerName || '').trim();
    const clickedNameKey = clickedName.toLowerCase();
    const existingIndex = selectedNames.findIndex((name) => name.trim().toLowerCase() === clickedNameKey);

    if (existingIndex >= 0) {
      selectedNames.splice(existingIndex, 1);
    } else {
      selectedNames.push(clickedName);
    }

    const selectedPlayers = selectedNames.map((name) => {
      const match = rosterPlayers.find((p) => p.playerName === name);
      return {
        playerName: name,
        playerNumber: match?.playerNumber || (name === player.playerName ? (player.playerNumber || null) : null),
      };
    });

    const newPlayerNames = selectedPlayers.map((sp) => sp.playerName).join(', ') || undefined;
    const newPlayerNumbers = selectedPlayers.map((sp) => sp.playerNumber).filter(Boolean).join(', ') || undefined;

    const optimisticPhoto: Photo = {
      ...photo,
      playerNames: newPlayerNames,
      playerNumbers: newPlayerNumbers,
    };

    // Optimistic update so chip highlight changes immediately in the UI.
    upsertPhotoInState(optimisticPhoto);

    try {
      const updated = await photoService.updatePhotoPlayers(photo.id, selectedPlayers);
      
      // Create a completely new photo object, explicitly setting playerNames and playerNumbers
      const updatedPhoto: Photo = {
        ...optimisticPhoto,
        ...updated,
        playerNames: newPlayerNames,
        playerNumbers: newPlayerNumbers,
      };

      upsertPhotoInState(updatedPhoto);

      const autoTaggedCount = Number(updated.autoTaggedCount || 0);
      const faceMatches = Number(updated.autoTagMatches?.face || 0);
      const numberMatches = Number(updated.autoTagMatches?.number || 0);
      const trainedFaceSamples = Number((updated as any).trainedFaceSamples || 0);

      setUploadMessage({
        type: 'success',
        text: `Auto-tag results: ${autoTaggedCount} additional photo${autoTaggedCount === 1 ? '' : 's'} tagged (face: ${faceMatches}, number: ${numberMatches}). Trained ${trainedFaceSamples} face sample${trainedFaceSamples === 1 ? '' : 's'} from this tag.`,
      });

      if (autoTaggedCount > 0) {
        await loadPhotos();
      }
    } catch (error) {
      console.error('Failed to update photo player tags:', error);
      // Roll back optimistic change on failure.
      upsertPhotoInState(photo);
      setUploadMessage({ type: 'error', text: 'Failed to update player tag.' });
    }
  };

  const handleAssignPlayerToSelectedFace = async (photo: Photo, player: { playerName: string; playerNumber?: string }) => {
    const selectedFaceId = selectedFaceBoxByPhotoId[photo.id];
    if (!selectedFaceId) {
      await handleTogglePlayerTag(photo, player);
      return;
    }

    const detection = detectionByPhotoId[photo.id];
    const selectedFace = detection?.faceBoxes.find((faceBox) => faceBox.id === selectedFaceId);
    if (!selectedFace) {
      // Stale face-box selection can happen when detections are cleared or unavailable.
      // Fall back to normal tag toggle so predefined player chips always remain clickable.
      setSelectedFaceBoxByPhotoId((prev) => ({
        ...prev,
        [photo.id]: null,
      }));
      await handleTogglePlayerTag(photo, player);
      return;
    }

    const currentMetadata = parsePhotoMetadata(photo);
    const existingFaceTags = getStoredFaceTags(photo);
    const nextFaceTags = [
      ...existingFaceTags.filter((faceTag) => faceTag.id !== selectedFace.id),
      {
        ...selectedFace,
        playerName: player.playerName,
        playerNumber: player.playerNumber || null,
      },
    ].sort((a, b) => a.id.localeCompare(b.id));

    const existingSelectedNames = getSelectedPlayerNamesForPhoto(photo);
    const clickedName = String(player.playerName || '').trim();
    const clickedNameKey = clickedName.toLowerCase();
    const mergedSelectedNames = [
      ...existingSelectedNames,
      ...(existingSelectedNames.some((name) => name.toLowerCase() === clickedNameKey) ? [] : [clickedName]),
    ];

    const selectedPlayers = mergedSelectedNames.map((name) => {
      const rosterMatch = rosterPlayers.find((entry) => entry.playerName === name);
      const faceMatch = nextFaceTags.find((entry) => entry.playerName === name);
      return {
        playerName: name,
        playerNumber: rosterMatch?.playerNumber || faceMatch?.playerNumber || null,
      };
    });

    const selectedPlayerNumbers = selectedPlayers
      .map((entry) => entry.playerNumber)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

    const optimisticPhoto: Photo = {
      ...photo,
      metadata: {
        ...currentMetadata,
        faceTags: nextFaceTags,
      },
      playerNames: selectedPlayers.map((entry) => entry.playerName).join(', ') || undefined,
      playerNumbers: selectedPlayerNumbers.join(', ') || undefined,
    };

    upsertPhotoInState(optimisticPhoto);

    try {
      const updated = await photoService.updatePhoto(photo.id, {
        metadata: {
          ...currentMetadata,
          faceTags: nextFaceTags,
        },
        playerNames: selectedPlayers.map((entry) => entry.playerName),
        playerNumbers: selectedPlayerNumbers,
      });

      upsertPhotoInState({
        ...optimisticPhoto,
        ...updated,
        metadata: {
          ...currentMetadata,
          faceTags: nextFaceTags,
        },
        playerNames: selectedPlayers.map((entry) => entry.playerName).join(', ') || undefined,
        playerNumbers: selectedPlayerNumbers.join(', ') || undefined,
      });

      setDetectionByPhotoId((prev) => ({
        ...prev,
        [photo.id]: prev[photo.id]
          ? {
              ...prev[photo.id],
              faceBoxes: (prev[photo.id].faceBoxes || []).map((faceBox) =>
                faceBox.id === selectedFace.id
                  ? { ...faceBox, playerName: player.playerName, playerNumber: player.playerNumber || null }
                  : faceBox
              ),
            }
          : prev[photo.id],
      }));

      setUploadMessage({ type: 'success', text: `Tagged ${player.playerName} on ${selectedFace.id}.` });
    } catch (error) {
      console.error('Failed to tag selected face box:', error);
      upsertPhotoInState(photo);
      setUploadMessage({ type: 'error', text: 'Failed to save the face-box tag.' });
    }
  };

  const handleDetectPlayers = async (photo: Photo, options?: { silent?: boolean }) => {
    try {
      setDetectingPhotoId(photo.id);
      const [result, faceBoxResult] = await Promise.all([
        photoService.getPhotoDetections(photo.id),
        detectFaceBoxesInBrowser(photo),
      ]);
      const mergedFaceBoxes = mergeDetectedBoxesWithSavedTags(photo, faceBoxResult.faceBoxes || []);
      setDetectionByPhotoId((prev) => ({
        ...prev,
        [photo.id]: {
          detectedNumbers: result.detectedNumbers || [],
          usedCachedDetections: !!result.usedCachedDetections,
          detectedNumbersUpdatedAt: result.detectedNumbersUpdatedAt || null,
          numberMatchingAvailable: !!result.numberMatchingAvailable,
          rosterPlayersWithNumbersCount: Number(result.rosterPlayersWithNumbersCount || 0),
          faceMatchingAvailable: !!result.faceMatchingAvailable,
          faceMatches: result.faceMatches || [],
          faceBoxes: mergedFaceBoxes,
          faceDetectionError: faceBoxResult.error || null,
          numberMatches: result.numberMatches || [],
          suggestions: result.suggestions || [],
        },
      }));
      setSelectedFaceBoxByPhotoId((prev) => ({
        ...prev,
        [photo.id]: mergedFaceBoxes[0]?.id || null,
      }));
    } catch (error) {
      console.error('Failed to detect players:', error);
      if (!options?.silent) {
        setUploadMessage({ type: 'error', text: 'Failed to detect faces/numbers for this photo.' });
      }
    } finally {
      setDetectingPhotoId(null);
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
      const rosterName = String((result as any).rosterName || '').trim();
      const rosterPrefix = rosterName ? `Roster "${rosterName}" uploaded:` : 'Roster uploaded:';
      setRosterMessage(`${rosterPrefix} ${result.photosUpdated} photo(s) tagged, ${rosterSaved} roster player(s) saved, ${trained} training sample(s) captured.`);
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
          {/* Notify Watchers Button */}
          <button
            type="button"
            className="btn btn-warning"
            style={{ position: 'relative', minWidth: 140, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}
            onClick={handleNotifyWatchers}
            disabled={notifyLoading || watchedTaggedPlayers.length === 0}
            title={watchedTaggedPlayers.length === 0 ? 'No watched tagged players in this album' : 'Notify all customers watching tagged players'}
          >
            Notify Watchers
            {watchedTaggedPlayers.length > 0 && (
              <span style={{
                background: '#f5b041',
                color: '#222',
                borderRadius: 12,
                fontSize: '0.85rem',
                fontWeight: 700,
                padding: '0.1rem 0.6rem',
                marginLeft: 4,
                display: 'inline-block',
                minWidth: 22,
                textAlign: 'center',
              }}>
                {watchedTaggedPlayers.length}
              </span>
            )}
            {notifyLoading && <span className="spinner" style={{ marginLeft: 6 }} />}
          </button>
          {notifyResult && (
            <span style={{ color: notifyResult.toLowerCase().includes('fail') ? '#e74c3c' : '#27ae60', fontSize: '0.92rem', marginLeft: 8 }}>{notifyResult}</span>
          )}
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

          {pendingDuplicateFiles && (
            <div
              style={{
                marginTop: '1.5rem',
                padding: '0.75rem',
                border: '1px solid var(--border-color)',
                borderRadius: '0.5rem',
                background: 'var(--surface-color)',
                minWidth: '360px',
              }}
            >
              <div style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                {pendingDuplicateCount} duplicate file name{pendingDuplicateCount === 1 ? '' : 's'} found.
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  className="form-select"
                  value={duplicateModeSelection}
                  onChange={(e) => setDuplicateModeSelection(e.target.value as DuplicateMode)}
                  style={{ minWidth: '180px' }}
                >
                  <option value="skip">Skip duplicates</option>
                  <option value="overwrite">Overwrite existing</option>
                  <option value="allow">Allow duplicates</option>
                </select>
                <button type="button" className="btn btn-primary" onClick={handleConfirmDuplicateMode}>
                  Continue Upload
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleCancelDuplicateMode}>
                  Cancel
                </button>
              </div>
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
        <UploadProgressPanel
          uploadItems={uploadItems}
          uploading={uploading}
          handleRetryUploadItem={handleRetryUploadItem}
          setUploading={setUploading}
        />
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
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginLeft: '0.5rem', minWidth: 140 }}
              onClick={handleDetectAll}
              disabled={photos.length === 0}
              title="Detect faces and numbers for all photos in this album"
            >
              🧑‍💻 Detect All
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginLeft: '0.5rem', minWidth: 140 }}
              onClick={async () => {
                if (photos.length === 0) {
                  alert('No photos to tag from filenames.');
                  return;
                }
                setLoading(true);
                try {
                  for (const photo of photos) {
                    await autoTagPhotoFromFilenameAndFaces({
                      photo,
                      rosterPlayers,
                      photoService,
                      onTagged: () => {},
                    });
                  }
                  await loadPhotos();
                  setUploadMessage({ type: 'success', text: 'Tagged all photos from filenames.' });
                } catch (err) {
                  setUploadMessage({ type: 'error', text: 'Failed to tag all photos from filenames.' });
                } finally {
                  setLoading(false);
                }
              }}
              disabled={photos.length === 0}
              title="Auto-tag all photos in this album from filenames only"
            >
              🏷️ Tag All from Filenames
            </button>
            <button
              type="button"
              className="btn btn-danger"
              style={{ marginLeft: '0.5rem', minWidth: 140 }}
              onClick={async () => {
                if (photos.length === 0) {
                  alert('No photos to clear tags from.');
                  return;
                }
                if (window.confirm(`Are you sure you want to clear all player tags from all ${photos.length} photos in this album? This cannot be undone.`)) {
                  for (const photo of photos) {
                    await handleClearPhotoTags(photo);
                  }
                  setUploadMessage({ type: 'success', text: 'Cleared all player tags from all photos in this album.' });
                  await loadPhotos();
                }
              }}
              disabled={photos.length === 0}
              title="Remove all player tags from all photos in this album"
            >
              🗑️ Delete All Tags
            </button>
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
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '2.2rem 2.2rem',
        marginTop: '2rem',
        justifyItems: 'stretch',
        width: '100%',
        boxSizing: 'border-box',
      }}>
        {Array.isArray(photos) && photos.map((photo) => (
          <div key={photo.id} className="admin-photo-card" style={{
            border: '1.5px solid rgba(180,180,200,0.22)',
            borderRadius: '18px',
            boxShadow: '0 2px 8px 0 rgba(30,30,60,0.04)',
            padding: '1.2rem 1.2rem 1.5rem 1.2rem',
            background: 'rgba(255,255,255,0.03)',
            marginBottom: '0.5rem',
            width: '100%',
            maxWidth: 440,
            boxSizing: 'border-box',
            position: 'relative',
          }}>
            <div style={{ cursor: 'pointer', position: 'relative' }}
                 onClick={() => window.open(`/api/photos/${photo.id}/asset`, '_blank')}
                 title="Click to view full size">
              {/* Use backend asset endpoint for image preview */}
              <img
                src={`/api/photos/${photo.id}/asset`}
                alt={photo.fileName}
                style={{
                  width: '100%',
                  maxWidth: 360,
                  aspectRatio: '1 / 1',
                  objectFit: 'cover',
                  borderRadius: 8,
                  background: '#222',
                  display: 'block',
                }}
                ref={el => setImageRef(photo.id, el)}
              />
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
              {/* Show auto-tag chips (current tags on the photo) */}
              {!!(photo as any).playerNames && (
                <div style={{ margin: '0.35rem 0 0 0' }}>
                  <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.82rem', color: '#f5b041', fontWeight: 600 }}>
                    👤 {(photo as any).playerNames}
                  </p>
                  {/* Existing tags as chips, not clickable */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {String((photo as any).playerNames || '').split(',').map((playerName: string) => (
                      <span
                        key={`existing-${playerName}`}
                        style={{
                          border: '1px solid var(--primary-color)',
                          borderRadius: '999px',
                          padding: '0.2rem 0.55rem',
                          fontSize: '0.74rem',
                          background: 'var(--primary-color)',
                          color: '#fff',
                          zIndex: 10,
                          position: 'relative',
                          marginBottom: '0.15rem',
                        }}
                        title={playerName.trim()}
                      >
                        {playerName.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 0 }}>
                    Player Tags (click to toggle)
                  </label>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleDetectPlayers(photo)}
                      disabled={detectingPhotoId === photo.id}
                      style={{ padding: '0.12rem 0.45rem', fontSize: '0.72rem', lineHeight: 1.2 }}
                      title="Detect faces and numbers for this photo"
                    >
                      {detectingPhotoId === photo.id ? 'Detecting…' : 'Detect'}
                    </button>
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
                </div>

                {detectionByPhotoId[photo.id] && (
                  <div style={{ marginBottom: '0.45rem' }}>
                    {detectionByPhotoId[photo.id].suggestions.length > 0 && (
                      <div style={{ fontSize: '0.72rem', color: '#7ee0b7', marginBottom: '0.25rem' }}>
                        Suggested players:
                      </div>
                    )}
                    {detectionByPhotoId[photo.id].detectedNumbers.length > 0 && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        OCR numbers: {detectionByPhotoId[photo.id].detectedNumbers.join(', ')}{detectionByPhotoId[photo.id].usedCachedDetections ? ' (cached)' : ''}
                      </div>
                    )}
                    {detectionByPhotoId[photo.id].detectedNumbers.length === 0 && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        OCR numbers: none found{detectionByPhotoId[photo.id].usedCachedDetections ? ' (cached)' : ''}
                      </div>
                    )}
                    {detectionByPhotoId[photo.id].detectedNumbers.length > 0 && !detectionByPhotoId[photo.id].numberMatchingAvailable && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        Number matching: roster has no jersey numbers saved yet
                      </div>
                    )}
                    {detectionByPhotoId[photo.id].faceDetectionError && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        Face boxes: {detectionByPhotoId[photo.id].faceDetectionError}
                      </div>
                    )}
                    {!detectionByPhotoId[photo.id].faceMatchingAvailable && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        Face matching: no trained face signatures available yet
                      </div>
                    )}
                    {detectionByPhotoId[photo.id].faceMatchingAvailable && detectionByPhotoId[photo.id].faceMatches.length === 0 && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        Face matching: no close matches found
                      </div>
                    )}
                    {detectionByPhotoId[photo.id].suggestions.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        {detectionByPhotoId[photo.id].suggestions.map((suggestion, idx) => {
                          const selected = isPlayerSelectedForPhoto(photo, suggestion.playerName);
                          const selectedFaceBoxId = selectedFaceBoxByPhotoId[photo.id];
                          return (
                            <button
                              key={`${photo.id}-suggestion-${idx}-${suggestion.playerName}`}
                              type="button"
                              onClick={() => selectedFaceBoxId
                                ? handleAssignPlayerToSelectedFace(photo, { playerName: suggestion.playerName, playerNumber: suggestion.playerNumber || undefined })
                                : handleTogglePlayerTag(photo, { playerName: suggestion.playerName, playerNumber: suggestion.playerNumber || undefined })}
                              style={{
                                border: '1px dashed var(--border-color)',
                                borderRadius: '999px',
                                padding: '0.2rem 0.55rem',
                                fontSize: '0.74rem',
                                cursor: 'pointer',
                                background: selected ? 'var(--primary-color)' : 'rgba(80, 200, 160, 0.12)',
                                color: selected ? '#fff' : 'var(--text-primary)',
                              }}
                              title={selectedFaceBoxId
                                ? `Assign ${suggestion.playerName} to ${selectedFaceBoxId} • detected by ${(suggestion.reasons || []).join(', ')} • confidence ${suggestion.confidence}`
                                : `Detected by: ${(suggestion.reasons || []).join(', ')} • confidence ${suggestion.confidence}`}
                            >
                              {suggestion.playerNumber ? `${suggestion.playerName} #${suggestion.playerNumber}` : suggestion.playerName}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                        No player suggestions found yet.
                      </div>
                    )}

                    {detectionByPhotoId[photo.id].faceBoxes.length > 0 && (
                      <div style={{ marginTop: '0.55rem', marginBottom: '0.45rem' }}>
                        <div style={{ fontSize: '0.72rem', color: '#7ee0b7', marginBottom: '0.35rem' }}>
                          Detected faces: click a box, then click a player to tag that face.
                        </div>
                        <div style={{ marginTop: '0.35rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                          Selected face: {selectedFaceBoxByPhotoId[photo.id] || 'none'}
                        </div>
                      </div>
                    )}

                    <details style={{ marginTop: '0.45rem' }}>
                      <summary style={{ cursor: 'pointer', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                        Detection debug
                      </summary>
                      <div
                        style={{
                          marginTop: '0.35rem',
                          padding: '0.45rem',
                          border: '1px solid var(--border-color)',
                          borderRadius: '0.45rem',
                          background: 'rgba(255,255,255,0.03)',
                          display: 'grid',
                          gap: '0.45rem',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '0.7rem', color: '#a8a8b8', marginBottom: '0.2rem' }}>Face candidates</div>
                          {detectionByPhotoId[photo.id].faceBoxes.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                              {detectionByPhotoId[photo.id].faceBoxes.map((faceBox) => (
                                <span
                                  key={`${photo.id}-${faceBox.id}`}
                                  style={{
                                    border: '1px solid rgba(126, 224, 183, 0.35)',
                                    borderRadius: '999px',
                                    padding: '0.15rem 0.45rem',
                                    fontSize: '0.72rem',
                                    color: '#d7f8ea',
                                  }}
                                >
                                  {faceBox.id}{faceBox.playerName ? ` → ${faceBox.playerName}${faceBox.playerNumber ? ` #${faceBox.playerNumber}` : ''}` : ''}
                                </span>
                              ))}
                            </div>
                          ) : detectionByPhotoId[photo.id].faceMatches.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                              {detectionByPhotoId[photo.id].faceMatches.map((match, idx) => (
                                <span
                                  key={`${photo.id}-face-${idx}-${match.playerName}`}
                                  style={{
                                    border: '1px solid rgba(126, 224, 183, 0.35)',
                                    borderRadius: '999px',
                                    padding: '0.15rem 0.45rem',
                                    fontSize: '0.72rem',
                                    color: '#d7f8ea',
                                  }}
                                >
                                  {match.playerNumber ? `${match.playerName} #${match.playerNumber}` : match.playerName} · d={match.distance}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>No face candidates.</div>
                          )}
                        </div>

                        <div>
                          <div style={{ fontSize: '0.7rem', color: '#a8a8b8', marginBottom: '0.2rem' }}>Number matches</div>
                          {!detectionByPhotoId[photo.id].numberMatchingAvailable && detectionByPhotoId[photo.id].detectedNumbers.length > 0 ? (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                              No roster player numbers are available to compare against yet.
                            </div>
                          ) : detectionByPhotoId[photo.id].numberMatches.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                              {detectionByPhotoId[photo.id].numberMatches.map((match, idx) => (
                                <span
                                  key={`${photo.id}-number-${idx}-${match.playerName}`}
                                  style={{
                                    border: '1px solid rgba(245, 176, 65, 0.35)',
                                    borderRadius: '999px',
                                    padding: '0.15rem 0.45rem',
                                    fontSize: '0.72rem',
                                    color: '#fde7c2',
                                  }}
                                >
                                  {match.playerNumber ? `${match.playerName} #${match.playerNumber}` : match.playerName} · OCR {match.matchedNumber}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>No number matches.</div>
                          )}
                        </div>
                      </div>
                    </details>
                  </div>
                )}

                {/* ── Manual player tagging ─────────────────────────────── */}
                <div style={{ marginTop: '0.55rem' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    Tag players manually{rosterPlayers.length > 0 ? ` (${rosterPlayers.length} on roster)` : ' — no roster loaded'}:
                  </div>

                  {/* Search / free-type input */}
                  <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.45rem' }}>
                    <input
                      type="text"
                      placeholder={rosterPlayers.length > 0 ? 'Search roster…' : 'Type player name…'}
                      value={playerSearchByPhotoId[photo.id] ?? ''}
                      onChange={(e) => setPlayerSearchByPhotoId((prev) => ({ ...prev, [photo.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const raw = (playerSearchByPhotoId[photo.id] ?? '').trim();
                          if (!raw) return;
                          const exact = rosterPlayers.find(
                            (p) => p.playerName.toLowerCase() === raw.toLowerCase()
                          );
                          const player = exact ?? { playerName: raw };
                          const selectedFaceBoxId = selectedFaceBoxByPhotoId[photo.id];
                          if (selectedFaceBoxId) {
                            handleAssignPlayerToSelectedFace(photo, player);
                          } else {
                            handleTogglePlayerTag(photo, player);
                          }
                          setPlayerSearchByPhotoId((prev) => ({ ...prev, [photo.id]: '' }));
                        }
                        if (e.key === 'Escape') {
                          setPlayerSearchByPhotoId((prev) => ({ ...prev, [photo.id]: '' }));
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '0.22rem 0.5rem',
                        fontSize: '0.78rem',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        color: 'var(--text-primary)',
                        outline: 'none',
                      }}
                    />
                    {/* Add by typed name if no exact match in roster */}
                    {(() => {
                      const raw = (playerSearchByPhotoId[photo.id] ?? '').trim();
                      if (!raw) return null;
                      const exactMatch = rosterPlayers.some(
                        (p) => p.playerName.toLowerCase() === raw.toLowerCase()
                      );
                      if (exactMatch) return null;
                      const selectedFaceBoxId = selectedFaceBoxByPhotoId[photo.id];
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            const player = { playerName: raw };
                            if (selectedFaceBoxId) {
                              handleAssignPlayerToSelectedFace(photo, player);
                            } else {
                              handleTogglePlayerTag(photo, player);
                            }
                            setPlayerSearchByPhotoId((prev) => ({ ...prev, [photo.id]: '' }));
                          }}
                          style={{
                            padding: '0.22rem 0.6rem',
                            fontSize: '0.76rem',
                            cursor: 'pointer',
                            background: 'rgba(110, 231, 183, 0.14)',
                            border: '1px dashed #6ee7b7',
                            borderRadius: '6px',
                            color: '#6ee7b7',
                            whiteSpace: 'nowrap',
                          }}
                          title={`Tag "${raw}" (not on roster)`}
                        >
                          + Tag "{raw}"
                        </button>
                      );
                    })()}
                  </div>

                  {/* Filtered roster chips removed: only search/manual entry is available. */}

                  {rosterPlayers.length === 0 && (
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                      No roster loaded. Type a name above and press Enter to tag.
                    </div>
                  )}
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
}

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

function FaceBoxPreview({
  photo,
  faceBoxes,
  selectedFaceBoxId,
  onSelectFaceBox,
  setImageRef,
}: {
  photo: Photo;
  faceBoxes: FaceTagBox[];
  selectedFaceBoxId: string | null;
  onSelectFaceBox: (faceBoxId: string) => void;
  setImageRef: (photoId: number, el: HTMLImageElement | null) => void;
}) {
  // Deprecated: FaceBoxPreview now unused, see above for direct <img> usage with asset endpoint
  return null;
}

// Helper to format photo metadata for display
function getMetadataForDisplay(photo: Photo | null): Record<string, string | number> {
  if (!photo) return {};

  let exif: Record<string, any> = {};
  exif = parsePhotoMetadata(photo);

  // Start with basic fields
  const metadata: Record<string, string | number> = {
    'File Name': photo?.fileName || 'N/A',
    'Photo ID': photo?.id,
  };

  // Add all top-level photo fields except for large blobs
  Object.entries(photo || {}).forEach(([key, value]) => {
    if (
      key !== 'metadata' &&
      key !== 'id' &&
      key !== 'fileName' &&
      key !== 'albumId' &&
      key !== 'url' &&
      key !== 'assetUrl' &&
      key !== 'sasUrl' &&
      key !== 'blobName' &&
      key !== 'createdAt' &&
      key !== 'updatedAt' &&
      typeof value !== 'object' &&
      typeof value !== 'undefined'
    ) {
      metadata[key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())] = value as any;
    }
  });

  // Add all EXIF fields (flattened, no prefix, and recursively for nested objects)
  function addExifFields(obj: any, prefix = '') {
    if (!obj || typeof obj !== 'object') return;
    Object.entries(obj).forEach(([key, value]) => {
      const label = prefix ? `${prefix}${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        addExifFields(value, label + '.');
      } else if (Array.isArray(value)) {
        metadata[label] = value.map(v => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ');
      } else if (typeof value !== 'undefined') {
        metadata[label] = String(value);
      }
    });
  }
  addExifFields(exif);

  return metadata;

}
export default AdminPhotos;
