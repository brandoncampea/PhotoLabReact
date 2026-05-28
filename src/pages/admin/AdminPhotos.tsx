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
import { extractPlayerNameFromFilename } from '../../utils/playerTagging';

const detectFaceBoxesInBrowser = async (photo: Photo): Promise<{ faceBoxes: FaceTagBox[]; error?: string | null }> => {
  // Always use the backend asset endpoint for the full-size image (never the thumbnail)
  return detectFaceBoxes(photo, () => Promise.resolve(`/api/photos/${photo.id}/asset`));
};



const setImageRef = (_photoId: number, _el: HTMLImageElement | null) => {};
import React, { useState, useEffect } from 'react';
import './AdminPhotos.css';
import UploadPanel from '../../components/UploadPanel';
import { useUploadContext } from '../../contexts/UploadContext';

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
    // Manually tag a player by name input
    const handleManualTagPlayer = async (photo: Photo, playerName: string) => {
      if (!playerName || !photo) return;
      const selectedPlayers = [{ playerName: playerName.trim() }];
      try {
        await photoService.updatePhotoPlayers(photo.id, selectedPlayers);
        await loadPhotos();
        setUploadMessage({ type: 'success', text: `Tagged photo with player: ${playerName}` });
      } catch (error: any) {
        console.error('Failed to manually tag player:', error);
        const msg = error?.response?.data?.error || 'Failed to tag player.';
        setUploadMessage({ type: 'error', text: msg });
      }
    };
  // Batch detect all photos in album (must be inside component for state access)
  // Progress state for batch detection
  const [detectAllProgress, setDetectAllProgress] = useState<{ current: number; total: number; running: boolean }>({ current: 0, total: 0, running: false });

  const handleDetectAll = async () => {
    if (!photos.length) return;
    setDetectAllProgress({ current: 0, total: photos.length, running: true });
    setLoading(false); // Ensure loading spinner does not hide progress bar
    try {
      for (let i = 0; i < photos.length; i++) {
        // eslint-disable-next-line no-await-in-loop
        await handleDetectPlayers(photos[i], { silent: true });
        setDetectAllProgress((prev) => ({ ...prev, current: i + 1 }));
      }
      await loadPhotos();
      setUploadMessage({ type: 'success', text: 'Auto-tagged and detected faces for all photos.' });
    } catch (err) {
      setUploadMessage({ type: 'error', text: 'Failed to auto-tag or detect faces for all photos.' });
    } finally {
      setDetectAllProgress({ current: 0, total: 0, running: false });
    }
  };

  const handleDetectNamesFromFilenames = async () => {
    if (!albumId) return;
    if (!photos.length) return;
    if (!confirm('Auto-detect player names from filenames for this album? Existing tagged photos will be skipped.')) return;
    setLoading(true);
    try {
      const updates: Array<{ id: number; playerNames: string }> = [];
      for (const p of photos) {
        // Treat undefined, null, empty string, or whitespace as untagged
        if (typeof p.playerNames === 'string' && p.playerNames.trim().length > 0) continue;
        if (!p.fileName) continue;
        const extracted = extractPlayerNameFromFilename(p.fileName);
        if (extracted && extracted.name) {
          updates.push({ id: p.id, playerNames: extracted.name });
        }
      }
      if (updates.length > 0) {
        await photoService.batchUpdatePhotoPlayers(updates);
        setUploadMessage({ type: 'success', text: `Tagged ${updates.length} photo(s) from filenames.` });
        // Always reload photos from backend to reflect new tags
        await loadPhotos();
        await loadRoster();
      } else {
        setUploadMessage({ type: 'error', text: 'No untagged photos found with detectable player names in filenames.' });
      }
    } catch (err) {
      console.error('Failed to auto-detect names for album:', err);
      setUploadMessage({ type: 'error', text: 'Failed to auto-detect names for album.' });
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
  // Remove local showUploadPanel, use UploadContext for panel visibility
  const [metadataPhoto, setMetadataPhoto] = useState<Photo | null>(null);
  // Removed unused coverMessage and isDragging
  const [coverLoadingId, setCoverLoadingId] = useState<number | null>(null);
  const [coverSuccessId, setCoverSuccessId] = useState<number | null>(null);
  // Remove local uploadItems, use UploadContext for upload files
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
    setLoading(true);
    try {
      const data = await photoService.getPhotosByAlbum(albumId);
      // Show all saved player names for each photo
      setPhotos(Array.isArray(data) ? data : []);

      // Only load face tags from metadata for initial page load (no API calls)
      const detectionResults = (Array.isArray(data) ? data : []).map((photo) => {
        const faceTags = getStoredFaceTags(photo);
        return {
          photoId: photo.id,
          detection: null,
          faceBoxes: Array.isArray(faceTags) ? faceTags : [],
        };
      });
      setDetectionByPhotoId((prev) => {
        const next = { ...prev };
        for (const { photoId, faceBoxes } of detectionResults) {
          if (faceBoxes && faceBoxes.length > 0) {
            next[photoId] = {
              detectedNumbers: [],
              usedCachedDetections: false,
              detectedNumbersUpdatedAt: null,
              numberMatchingAvailable: false,
              rosterPlayersWithNumbersCount: 0,
              faceMatchingAvailable: false,
              faceMatches: [],
              faceBoxes: faceBoxes || [],
              faceDetectionError: undefined,
              numberMatches: [],
              suggestions: [],
            };
          }
        }
        return next;
      });
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

    // Clean up previous previews (use UploadContext if needed, or skip if not available)
    // If you want to clean up previews from previous upload, you can do so here if you have access to them.

    // UploadContext handles upload state; no setUploadItems or items needed here
    setUploading(true);
    setUploadMessage(null);
    setUploadProgress({ completed: 0, total: workingFiles.length });

    // Parallel upload logic (limit to 5 at a time)
    const parallelLimit = 5;
    let completed = 0;
    let failed = 0;

    const queue = workingFiles.map((file, idx) => ({
      id: `${Date.now()}-${idx}-${file.name}`,
      file,
      progress: 0,
      status: 'queued',
      duplicateMode,
      attempts: 0,
    }));

    try {
      await Promise.all(Array(parallelLimit).fill(0).map(uploadNext));

      // --- Post-upload polling to ensure new photos appear ---
      const expectedCount = photos.length + completed;
      let pollTries = 0;
      let foundAll = false;
      while (pollTries < 5 && !foundAll) {
        await loadPhotos();
        const refreshed = await photoService.getPhotosByAlbum(albumId as number);
        // Check if all uploaded files are present in refreshed list
        const uploadedNames = items.map(i => i.file.name.replace(/\s+/g, '_'));
        foundAll = uploadedNames.every(name => refreshed.some(p => p.fileName === name));
        if (foundAll) break;
        pollTries++;
        await new Promise(res => setTimeout(res, 1000));
      }
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
  // Use UploadContext for upload state and addFiles
  const { files: uploadFilesCtx, addFiles, clearFiles, updateFile } = useUploadContext();
  // Compute overall progress
  const uploadingFiles = uploadFilesCtx.filter(f => f.status !== 'error' && f.status !== 'paused');
  const overallProgress = uploadingFiles.length
    ? Math.round(uploadingFiles.reduce((acc, f) => acc + (f.progress || 0), 0) / uploadingFiles.length)
    : 0;
  // Show panel if any file is uploading or queued
  const showUploadPanel = uploadFilesCtx.some(f => f.status !== 'done' && f.status !== 'error');
  // Hide panel when all are done
  useEffect(() => {
    if (uploadFilesCtx.length && uploadFilesCtx.every(f => f.status === 'done' || f.status === 'error')) {
      // When all uploads finish, reload the photo list so new photos appear automatically
      loadPhotos();
      setTimeout(() => clearFiles(), 1200);
    }
  }, [uploadFilesCtx, clearFiles]);

  const handleConfirmDuplicateMode = async () => {
    if (!pendingDuplicateFiles?.length) return;

    const normalizeName = (name: string) => name.replace(/\s+/g, '_').toLowerCase();
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
    if (workingFiles.length > 0) {
      addFiles(workingFiles);
    }
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
      // If photo already has a tagged player, we should not override it from filename.
      // Otherwise, try to extract a player name from the filename and, if exactly one face detected, assign it to that box (fallback).
      // Always try to extract a player name from the filename if no player is tagged, or if tags were just cleared
      let playerNameFromFilename: string | null = null;
      if (photo.fileName) {
        const extracted = extractPlayerNameFromFilename(photo.fileName);
        if (extracted && extracted.name) playerNameFromFilename = extracted.name;
      }
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

      // --- Persist detected player names to backend ---
      // Collect all unique detected player names from faceMatches and/or mergedFaceBoxes
      const detectedNames = new Set<string>();
      if (result.faceMatches && Array.isArray(result.faceMatches)) {
        result.faceMatches.forEach(fm => {
          if (fm.playerName && typeof fm.playerName === 'string' && fm.playerName.trim().length > 0) {
            detectedNames.add(fm.playerName.trim());
          }
        });
      }
      mergedFaceBoxes.forEach(box => {
        if (box.playerName && typeof box.playerName === 'string' && box.playerName.trim().length > 0) {
          detectedNames.add(box.playerName.trim());
        }
      });
      // If we have detected player names, persist them
      if (detectedNames.size > 0) {
        const playerArr = Array.from(detectedNames).map(playerName => ({ playerName }));
        try {
          await photoService.updatePhotoPlayers(photo.id, playerArr);
          if (!options?.silent) {
            setUploadMessage({ type: 'success', text: `Tagged photo with: ${playerArr.map(p => p.playerName).join(', ')}` });
          }
          console.log('Successfully saved detected player names:', playerArr);
        } catch (err) {
          setUploadMessage({ type: 'error', text: 'Failed to save detected player names.' });
          console.error('Failed to save detected player names:', err);
        }
        // Optionally reload photos to reflect new tags
        await loadPhotos();
      }

      // If the photo already has tagged player(s), save a face signature for them when possible
      try {
        const taggedNames = String(photo.playerNames || '').split(',').map(n => n.trim()).filter(Boolean);
        if (taggedNames.length > 0 && mergedFaceBoxes.length > 0) {
          for (const taggedName of taggedNames) {
            // Prefer a box that already has the player assigned
            let matchedBox = mergedFaceBoxes.find(b => b.playerName && String(b.playerName).trim().toLowerCase() === taggedName.toLowerCase());
            // If no box explicitly matched but there's exactly one face and one tagged name, use it
            if (!matchedBox && mergedFaceBoxes.length === 1 && taggedNames.length === 1) {
              matchedBox = mergedFaceBoxes[0];
            }
            if (matchedBox) {
              try {
                await photoService.trainFaceSignature(photo.id, taggedName, {
                  leftPct: matchedBox.leftPct,
                  topPct: matchedBox.topPct,
                  widthPct: matchedBox.widthPct,
                  heightPct: matchedBox.heightPct,
                });
              } catch (err) {
                // Non-fatal: log and continue
                console.warn('Failed to train face signature for', taggedName, err);
              }
            }
          }
        }
      } catch (e) {
        // ignore training errors
      }
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
  // Duplicate detection on file drop
  const onDrop = React.useCallback((acceptedFiles: File[]) => {
    if (uploading) return;
    if (!acceptedFiles.length) return;
    // Detect duplicates by sanitized file name
    const normalize = (name: string) => name.replace(/\s+/g, '_').toLowerCase();
    const existingNames = new Set(photos.map(p => normalize(p.fileName || '')));
    const duplicates = acceptedFiles.filter(f => existingNames.has(normalize(f.name)));
    if (duplicates.length > 0) {
      setPendingDuplicateFiles(acceptedFiles);
      setPendingDuplicateCount(duplicates.length);
      // Do not add files yet; wait for user to choose mode
      return;
    }
    addFiles(acceptedFiles);
  }, [uploading, addFiles, photos]);
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
        <button className="btn btn-secondary" onClick={handleDetectAll} disabled={photos.length === 0 || detectAllProgress.running}>Detect All Faces/Players</button>
        {(detectAllProgress.running || (detectAllProgress.total > 0 && detectAllProgress.current < detectAllProgress.total)) && (
          <span style={{ marginLeft: 12, color: '#7b61ff', fontWeight: 500 }}>
            Detecting faces: {detectAllProgress.current} / {detectAllProgress.total}
            <span style={{ display: 'inline-block', width: 80, marginLeft: 8, verticalAlign: 'middle' }}>
              <div style={{ height: 8, background: '#eee', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${(detectAllProgress.current / detectAllProgress.total) * 100}%`, height: '100%', background: '#7b61ff', transition: 'width 0.2s' }} />
              </div>
            </span>
          </span>
        )}
        <button className="btn btn-secondary" style={{ marginLeft: 8 }} onClick={handleDetectNamesFromFilenames} disabled={photos.length === 0 || loading}>Detect Names from Filenames</button>
        <button className="btn btn-info" onClick={handleNotifyWatchers} disabled={notifyLoading || !watchedTaggedPlayers.length}>Notify Watchers</button>
        {/* Test Name Extraction button removed */}
        <input type="file" accept=".csv" onChange={handleRosterCsvUpload} disabled={rosterUploading} style={{ marginLeft: 12 }} />
        {rosterUploading && <span style={{ marginLeft: 8 }}>Uploading roster…</span>}
        {rosterMessage && <span style={{ marginLeft: 8 }}>{rosterMessage}</span>}
        {notifyResult && <span style={{ marginLeft: 8 }}>{notifyResult}</span>}
      </div>
      {showUploadPanel ? (
        <div className="admin-photos-upload-panel" style={{ padding: 0, margin: '24px 0', background: 'none', boxShadow: 'none' }}>
          <UploadPanel
            files={uploadFilesCtx}
            onCancel={clearFiles}
            overallProgress={overallProgress}
            visible={showUploadPanel}
          />
        </div>
      ) : (
        <div className="admin-photos-upload-panel" {...getRootProps()} style={{ padding: 24, margin: '24px 0', background: isDragActive ? '#23234a' : undefined, cursor: uploading ? 'not-allowed' : 'pointer' }}>
          <input {...getInputProps()} />
          <p>{uploading ? 'Uploading photos…' : 'Drag and drop photos here, or click to select files.'}</p>
        </div>
      )}
      {/* Photo grid */}
      <div className="admin-photos-grid">
          {photos.length === 0 ? (
            <div className="empty-state">No photos in this album.</div>
          ) : (
            // Filter out duplicate file names, only show the latest photo for each name
            Array.from(
              photos.reduce((map, photo) => {
                if (!map.has(photo.fileName)) {
                  map.set(photo.fileName, photo);
                }
                return map;
              }, new Map()),
              ([, photo]) => photo
            ).map((photo) => (
              <div key={photo.id} className="admin-photo-card">
                <div style={{ position: 'relative', width: '100%', height: 'auto' }}>
                  <img
                    src={`/api/photos/${photo.id}/asset?variant=thumbnail`}
                    alt={photo.fileName}
                    className="admin-photo-img"
                    style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 8 }}
                  />
                  {/* Face Box Overlays */}
                  {detectionByPhotoId[photo.id]?.faceBoxes?.length > 0 && (
                    detectionByPhotoId[photo.id].faceBoxes.map((box, i) => (
                      <div
                        key={box.id ? `${box.id}-${i}` : `facebox-${photo.id}-${i}`}
                        style={{
                          position: 'absolute',
                          left: `${box.leftPct}%`,
                          top: `${box.topPct}%`,
                          width: `${box.widthPct}%`,
                          height: `${box.heightPct}%`,
                          border: '2px solid #7b61ff',
                          borderRadius: 6,
                          background: 'rgba(123,97,255,0.10)',
                          pointerEvents: 'auto',
                          zIndex: 2,
                          display: 'flex',
                          alignItems: 'flex-end',
                          justifyContent: 'center',
                        }}
                        title={box.playerName ? `Tagged: ${box.playerName}` : 'Click to tag face'}
                        onClick={() => {
                          const playerName = prompt('Tag this face with a player name:', box.playerName || '');
                          if (playerName && playerName.trim()) {
                            setDetectionByPhotoId(prev => ({
                              ...prev,
                              [photo.id]: {
                                ...prev[photo.id],
                                faceBoxes: prev[photo.id].faceBoxes.map((fb, idx) =>
                                  idx === i ? { ...fb, playerName: playerName.trim() } : fb
                                ),
                              },
                            }));
                          }
                        }}
                      >
                        <span
                          style={{
                            background: '#7b61ff',
                            color: '#fff',
                            fontSize: 12,
                            padding: '2px 6px',
                            borderRadius: 4,
                            marginBottom: 2,
                            marginTop: 'auto',
                            cursor: 'pointer',
                            userSelect: 'none',
                          }}
                        >
                          {box.playerName ? box.playerName : 'Tag'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                {/* Player name pills and tag input stacked */}
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                  <div className="admin-photo-player-pills" style={{ marginBottom: '1.1rem', width: '100%', alignItems: 'flex-start', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {getSelectedPlayerNamesForPhoto(photo).map((playerName) => (
                      <span
                        key={playerName}
                        style={{
                          background: '#7b61ff',
                          color: '#fff',
                          fontSize: 12,
                          padding: '2px 10px',
                          borderRadius: 12,
                          userSelect: 'none',
                          fontWeight: 500,
                          letterSpacing: 0.2,
                          marginRight: 4,
                          marginBottom: 2,
                          minHeight: '24px',
                          alignItems: 'center',
                          display: 'inline-flex',
                        }}
                      >
                        {playerName}
                      </span>
                    ))}
                  </div>
                  <div className="admin-photo-tag-input-row" style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                    <input
                      type="text"
                      placeholder="Tag player name"
                      style={{ flex: 1, minWidth: 0, padding: '2px 6px', borderRadius: 4, border: '1px solid #7b61ff', fontSize: 13 }}
                      value={photo._manualTagInput || ''}
                      onChange={e => {
                        const value = e.target.value;
                        setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, _manualTagInput: value } : p));
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const value = (photo as any)._manualTagInput;
                          if (value && value.trim()) {
                            handleManualTagPlayer(photo, value.trim());
                          }
                        }
                      }}
                    />
                    <button
                      className="btn btn-primary"
                      style={{ fontSize: 13, padding: '2px 10px' }}
                      onClick={() => {
                        const value = (photo as any)._manualTagInput;
                        if (value && value.trim()) {
                          handleManualTagPlayer(photo, value.trim());
                        }
                      }}
                    >Tag</button>
                  </div>
                </div>
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
                  <div>
                    Players:{' '}
                    {photo.playerNames && photo.playerNames.trim() ? (
                      photo.playerNames.split(',').map((n, i) => (
                        <span key={i} style={{ display: 'inline-block', marginRight: 4 }}>{n.trim()}</span>
                      ))
                    ) : '—'}
                  </div>
                  <div>Views: {typeof photo.viewCount === 'number' ? photo.viewCount : '—'}</div>
                  <div>Orders: {typeof photo.orderCount === 'number' ? photo.orderCount : '—'}</div>
                  {/* Detection Results */}
                  {detectionByPhotoId[photo.id] && (
                    <div style={{ margin: '8px 0', fontSize: 13, color: '#4caf50' }}>
                      {detectionByPhotoId[photo.id].faceBoxes.length > 0 ? (
                        <>
                          <div>Detected Faces: {detectionByPhotoId[photo.id].faceBoxes.length}</div>
                          {detectionByPhotoId[photo.id].faceBoxes.map((box, i) => (
                            <div key={box.id ? `${box.id}-${i}` : `facebox-${photo.id}-${i}`}>
                              {box.playerName ? `Player: ${box.playerName}` : 'Face detected'}
                              {box.playerNumber ? ` (#${box.playerNumber})` : ''}
                            </div>
                          ))}
                        </>
                      ) : detectionByPhotoId[photo.id].faceDetectionError ? (
                        <div style={{ color: '#ff5252' }}>Detection error: {detectionByPhotoId[photo.id].faceDetectionError}</div>
                      ) : (
                        <div>No faces detected</div>
                      )}
                    </div>
                  )}
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

      {/* Duplicate Upload Modal */}
      {pendingDuplicateFiles && pendingDuplicateFiles.length > 0 && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0,0,0,0.45)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{ background: '#fff', color: '#23234a', borderRadius: 10, padding: 28, minWidth: 340, maxWidth: 420, boxShadow: '0 4px 32px rgba(30,20,60,0.18)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 20 }}>Duplicate Photos Detected</h3>
            </div>
            <div style={{ fontSize: 15, marginBottom: 16 }}>
              {pendingDuplicateCount} duplicate photo{pendingDuplicateCount === 1 ? '' : 's'} detected.<br />
              How would you like to handle them?
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', marginBottom: 8 }}>
                <input
                  type="radio"
                  name="duplicateMode"
                  value="skip"
                  checked={duplicateModeSelection === 'skip'}
                  onChange={() => setDuplicateModeSelection('skip')}
                  style={{ marginRight: 8 }}
                />
                Skip duplicates (upload only new photos)
              </label>
              <label style={{ display: 'block', marginBottom: 8 }}>
                <input
                  type="radio"
                  name="duplicateMode"
                  value="overwrite"
                  checked={duplicateModeSelection === 'overwrite'}
                  onChange={() => setDuplicateModeSelection('overwrite')}
                  style={{ marginRight: 8 }}
                />
                Overwrite existing photos with same name
              </label>
              <label style={{ display: 'block', marginBottom: 8 }}>
                <input
                  type="radio"
                  name="duplicateMode"
                  value="allow"
                  checked={duplicateModeSelection === 'allow'}
                  onChange={() => setDuplicateModeSelection('allow')}
                  style={{ marginRight: 8 }}
                />
                Allow duplicates (upload all)
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button className="btn btn-secondary" onClick={handleCancelDuplicateMode}>Cancel</button>
              <button className="btn btn-primary" onClick={handleConfirmDuplicateMode}>Continue</button>
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
