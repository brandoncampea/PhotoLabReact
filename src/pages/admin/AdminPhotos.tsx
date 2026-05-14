import { autoTagPhotoFromFilenameAndFaces } from '../../utils/autoTagPhotoFromFilenameAndFaces';
import { useDropzone } from 'react-dropzone';
// --- Shared types and utilities ---
import type { FaceTagBox } from '../../utils/faceDetection';
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
  numberMatches: Array<{ playerName: string; playerNumber?: string | undefined; matchedNumber?: string | undefined }>;
  suggestions: Array<{ playerName: string; playerNumber?: string; reasons?: string[]; confidence?: number }>;
};

// --- Implemented functions for auto-tagging and batch detection ---
// (extractPlayerNameFromFilename is unused, removed)




// Real face detection using BlazeFace

import { detectFaceBoxes } from '../../utils/faceDetection';

const detectFaceBoxesInBrowser = async (photo: Photo): Promise<{ faceBoxes: FaceTagBox[]; error?: string | null }> => {
  // Always use the backend asset endpoint for the full-size image (never the thumbnail)
  return detectFaceBoxes(photo, () => Promise.resolve(`/api/photos/${photo.id}/asset`));
};



const setImageRef = (_photoId: number, _el: HTMLImageElement | null) => {};
import React, { useState, useEffect } from 'react';
import './AdminPhotos.css';

// UploadProgressPanel and related unused props removed



// import * as blazeface from '@tensorflow-models/blazeface';
// import '@tensorflow/tfjs';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Photo, Album, PhotoMetadata } from '../../types';
import { photoService, uploadFileToAzureBlob, recordPhotoBlob } from '../../services/photoService';
import { albumService } from '../../services/albumService';
import { albumAdminService } from '../../services/albumAdminService';

import playerWatchlistService from '../../services/playerWatchlistService';
import notifyWatchersService from '../../services/notifyWatchersService';

const AdminPhotos: React.FC = () => {
  // Batch detect all photos in album (must be inside component for state access)
  const handleDetectAll = async () => {
    if (!photos.length) return;
    setLoading(true);
    try {
      for (const photo of photos) {
        await handleDetectPlayers(photo, { silent: true });
      }
      await loadPhotos();
      setUploadMessage({ type: 'success', text: 'Auto-tagged and detected faces for all photos.' });
    } catch (err) {
      setUploadMessage({ type: 'error', text: 'Failed to auto-tag or detect faces for all photos.' });
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
  // Removed unused coverMessage and isDragging
  const [coverLoadingId, setCoverLoadingId] = useState<number | null>(null);
  const [coverSuccessId, setCoverSuccessId] = useState<number | null>(null);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
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





  // Removed unused wait function

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
      if (!item) {
        await uploadNext();
        return;
      }
      let attempts = item.attempts || 0;
      let success = false;
      while (attempts <= maxAutoRetries && !success) {
        setUploadItems((prev) =>
          prev.map((entry) =>
            item && entry.id === item.id ? { ...entry, status: 'uploading', progress: 0, attempts } : entry
          )
        );
        try {
          // Direct-to-Blob upload
          if (typeof albumId !== 'number') throw new Error('albumId must be a number');
          // Sanitize filename for blob storage (replace spaces with underscores)
          // item is guaranteed to exist here
          const safeFileName = item.file.name.replace(/\s+/g, '_');
          const blobName = `albums/${albumId}/${safeFileName}`;
          const blobUrl = await uploadFileToAzureBlob({
            file: item.file,
            blobName,
            onProgress: (percent) => {
              setUploadItems((prev) =>
                prev.map((entry) =>
                  item && entry.id === item.id ? { ...entry, progress: percent } : entry
                )
              );
            },
          });
          // Notify backend with sanitized fileName and blobUrl
          const recordResult = await recordPhotoBlob({
            albumId: albumId as number,
            fileName: safeFileName,
            blobUrl,
            description: item.description,
            fileSizeBytes: item.file.size,
            // Optionally add width, height, metadata, playerName, playerNumber if available
          });

          // Only mark as success if backend returns success: true
          if (!recordResult || (recordResult as any).success !== true) {
            setUploadItems((prev) =>
              prev.map((entry) =>
                item && entry.id === item.id ? { ...entry, status: 'error', error: 'Upload failed (backend error).' } : entry
              )
            );
            failed += 1;
            break;
          }

          // Ensure roster is loaded before auto-tagging
          if (rosterPlayers.length === 0) {
            await loadRoster();
          }

          // Fetch the latest photo object from backend for accurate tagging
          let latestPhoto = null;
          try {
            // Always fetch the latest list to ensure we get the just-uploaded photo
            const refreshedPhotos = await photoService.getPhotosByAlbum(albumId as number);
            latestPhoto = refreshedPhotos.find((p: any) => item && p.fileName === item.file.name);
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
                item && entry.id === item.id ? { ...entry, taggedPlayer: detectedPlayerNames.join(', ') } : entry
              )
            );
          }

          setUploadItems((prev) =>
            prev.map((entry) =>
              item && entry.id === item.id ? { ...entry, status: 'done', progress: 100, error: undefined, attempts } : entry
            )
          );
          completed += 1;
          success = true;
        } catch (error) {
          attempts += 1;
          if (attempts > maxAutoRetries) {
            setUploadItems((prev) =>
              prev.map((entry) =>
                item && entry.id === item.id ? { ...entry, status: 'error', error: `Upload failed after ${attempts} attempts.` } : entry
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

      // Ensure photos state is refreshed before next upload
      // This is critical for duplicate detection to work on repeated uploads
      // (Fix for: duplicate prompt not appearing after uploading same file again)
      // Optionally, you can debounce or throttle this if needed for performance

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

    // Always check for duplicates before uploading
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
    setUploadItems(() => [
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



  // Removed unused handleUpload

  // Removed unused handleDrop and setIsDragging (confirmed, remove any remaining code)

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
        setRosterMessage('Photo URL not available');
        setTimeout(() => setRosterMessage(null), 2500);
        return;
      }
      await albumAdminService.updateAlbum(albumId, { coverImageUrl: coverUrl, coverPhotoId: photo.id });
      await loadAlbums();
      setRosterMessage('Cover updated');
      setCoverSuccessId(photo.id);
      setTimeout(() => setRosterMessage(null), 2000);
      setTimeout(() => setCoverSuccessId(null), 1500);
    } catch (error) {
      console.error('Failed to set album cover:', error);
      setRosterMessage('Failed to update cover');
      setTimeout(() => setRosterMessage(null), 2500);
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
      let mergedFaceBoxes = mergeDetectedBoxesWithSavedTags(photo, faceBoxResult.faceBoxes || []);
      // If face matching found matches, assign player names to the corresponding face boxes
      if (result.faceMatches && Array.isArray(result.faceMatches) && mergedFaceBoxes.length > 0) {
        mergedFaceBoxes = mergedFaceBoxes.map((box, idx) => {
          // Try to find a face match for this box by index (assuming order matches)
          const match = result.faceMatches[idx];
          if (match && match.playerName) {
            return { ...box, playerName: match.playerName, playerNumber: match.playerNumber };
          }
          return box;
        });
      }
      // If photo has a player name from filename and exactly one face detected, assign that name to the face box (fallback)
      const playerNameFromFilename = (photo as any).playerNames && String((photo as any).playerNames).split(',')[0].trim();
      if (playerNameFromFilename && mergedFaceBoxes.length === 1) {
        mergedFaceBoxes = mergedFaceBoxes.map(box => ({ ...box, playerName: playerNameFromFilename }));
      }
      setDetectionByPhotoId((prev) => ({
        ...prev,
        [photo.id]: {
          detectedNumbers: result.detectedNumbers || [],
          usedCachedDetections: !!result.usedCachedDetections,
          detectedNumbersUpdatedAt: result.detectedNumbersUpdatedAt || null,
          numberMatchingAvailable: !!result.numberMatchingAvailable,
          rosterPlayersWithNumbersCount: Number(result.rosterPlayersWithNumbersCount || 0),
          faceMatchingAvailable: !!result.faceMatchingAvailable,
          faceMatches: (result.faceMatches || []).map(fm => ({
            playerName: fm.playerName,
            playerNumber: fm.playerNumber ?? null, // allow null
            distance: fm.distance,
          })),
          faceBoxes: mergedFaceBoxes,
          faceDetectionError: faceBoxResult.error || undefined,
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

  // Always call hooks at the top level, never inside conditionals or returns
  // Instead, render early returns as variables
  // Move any useMemo or other hooks here if present
  let earlyReturn: React.ReactNode = null;
  if (loading || !albumId) {
    earlyReturn = <div className="loading">Loading...</div>;
  } else if (albums.length === 0) {
    earlyReturn = (
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

  // If there are any useMemo or similar hooks that were inside the render, move them here

  // Remove any useMemo or hook calls from inside JSX or conditional blocks
  // If you have code like:
  //   const { getRootProps, getInputProps, isDragActive } = useDropzone(...)
  // inside a render function or conditional, move it here and use state/props to control behavior

  // Example: Move useDropzone hook to top level
  const onDrop = React.useCallback((acceptedFiles: File[]) => {
    if (!uploading) uploadFiles(acceptedFiles);
  }, [uploading, uploadFiles]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: true,
    disabled: uploading,
  });
  const [infoPhoto, setInfoPhoto] = useState<Photo | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);

  const openInfoModal = (photo: Photo) => {
    setInfoPhoto(photo);
    setShowInfoModal(true);
  };
  const closeInfoModal = () => {
    setShowInfoModal(false);
    setInfoPhoto(null);
  };

  if (earlyReturn) return earlyReturn;
  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>Manage Photos</h1>
        <div style={{ marginTop: 8 }}>
          <label htmlFor="album-select">Album:</label>{' '}
          <select id="album-select" value={albumId ?? ''} onChange={handleAlbumChange}>
            {albums.map((album) => (
              <option key={album.id} value={album.id}>{album.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="admin-photos-controls">
        <button className="btn btn-danger" onClick={handleDeleteAll} disabled={photos.length === 0}>Delete All Photos</button>
        <button className="btn btn-secondary" onClick={handleDetectAll} disabled={photos.length === 0 || loading}>Auto-Tag All</button>
        <button className="btn btn-info" onClick={handleNotifyWatchers} disabled={notifyLoading || !watchedTaggedPlayers.length}>Notify Watchers</button>
        <input type="file" accept=".csv" onChange={handleRosterCsvUpload} disabled={rosterUploading} style={{ marginLeft: 12 }} />
        {rosterUploading && <span style={{ marginLeft: 8 }}>Uploading roster…</span>}
        {rosterMessage && <span style={{ marginLeft: 8 }}>{rosterMessage}</span>}
        {notifyResult && <span style={{ marginLeft: 8 }}>{notifyResult}</span>}
      </div>
      <div className="admin-photos-upload-panel" {...getRootProps()} style={{ padding: 24, margin: '24px 0', background: isDragActive ? '#23234a' : undefined, cursor: uploading ? 'not-allowed' : 'pointer' }}>
        <input {...getInputProps()} />
        <p>{uploading ? 'Uploading photos…' : 'Drag and drop photos here, or click to select files.'}</p>
        {uploadMessage && <div className={`upload-message ${uploadMessage.type}`}>{uploadMessage.text}</div>}
        {uploadItems && uploadItems.length > 0 && (
          <div className="upload-progress-list" style={{ marginTop: 16 }}>
            {uploadItems.map((item) => (
              <div key={item.id} className="upload-progress-item" style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 }}>{item.file.name}</span>
                <div style={{ width: 120, margin: '0 12px' }}>
                  <div style={{ height: 8, background: '#e0e0e0', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${item.progress}%`, height: 8, background: item.status === 'done' ? '#4caf50' : item.status === 'error' ? '#f44336' : '#7b61ff', transition: 'width 0.3s' }} />
                  </div>
                </div>
                <span style={{ width: 60, textAlign: 'right', fontSize: 13 }}>
                  {item.status === 'uploading' && `${item.progress}%`}
                  {item.status === 'done' && 'Done'}
                  {item.status === 'error' && 'Error'}
                  {item.status === 'queued' && 'Queued'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Photo grid */}
      <div className="admin-photos-grid">
        {photos.length === 0 ? (
          <div className="empty-state">No photos in this album.</div>
        ) : (
          photos.map((photo) => (
            <div key={photo.id} className="admin-photo-card">
              <img src={`/api/photos/${photo.id}/asset?variant=thumbnail`} alt={photo.fileName} className="admin-photo-img" />
              <div className="admin-photo-meta">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <strong>{photo.fileName}</strong>
                  <button
                    title="Show photo info"
                    style={{ background: 'none', border: 'none', color: '#7b61ff', cursor: 'pointer', fontSize: 18, marginLeft: 6 }}
                    onClick={() => openInfoModal(photo)}
                  >
                    <span style={{ fontWeight: 700, fontSize: 18, display: 'inline-block', lineHeight: 1 }}>i</span>
                  </button>
                </div>
                <div>ID: {photo.id}</div>
                <div>Players: {photo.playerNames || '—'}</div>
                <button className="btn btn-danger" onClick={() => handleDelete(photo.id)}>Delete</button>
                <button className="btn btn-secondary" onClick={() => handleSetCover(photo)}>Set as Cover</button>
                <button className="btn btn-info" onClick={() => handleDetectPlayers(photo)}>Detect Players/Faces</button>
                <button className="btn btn-warning" onClick={() => handleClearPhotoTags(photo)}>Clear Tags</button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Info Modal */}
      {showInfoModal && infoPhoto && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{ background: '#23234a', color: '#fff', borderRadius: 10, padding: 28, minWidth: 340, maxWidth: 480, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 4px 32px rgba(30,20,60,0.18)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 20 }}>Photo Info</h3>
              <button onClick={closeInfoModal} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', marginLeft: 12 }} title="Close">&times;</button>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              {Object.entries(getMetadataForDisplay(infoPhoto)).map(([key, value]) => (
                <div key={key} style={{ marginBottom: 4 }}>
                  <span style={{ color: '#bdbdfc', fontWeight: 500 }}>{key}:</span> <span style={{ color: '#fff' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// Helper to parse photo metadata safely
function parsePhotoMetadata(photo: Photo | null): Record<string, any> {
  if (!photo) return {};
  const rawMetadata = (photo as any).metadata;
  if (rawMetadata && typeof rawMetadata === 'object') {
    return rawMetadata as Record<string, any>;
  }
  if (typeof rawMetadata === 'string') {
    try {
      const parsed = JSON.parse(rawMetadata);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, any>;
      }
    } catch {
      return {};
    }
  }
  return {};
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
