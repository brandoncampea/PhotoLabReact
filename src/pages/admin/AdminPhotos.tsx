import React, { useState, useEffect } from 'react';
import * as blazeface from '@tensorflow-models/blazeface';
import '@tensorflow/tfjs';
import { useSasUrl } from '../../hooks/useSasUrl';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Photo, Album, PhotoMetadata } from '../../types';
import { photoService } from '../../services/photoService';
import { albumService } from '../../services/albumService';
import { albumAdminService } from '../../services/albumAdminService';
import { detectPlayersFromFilenames, extractPotentialPlayerNamesFromFilenames } from '../../services/filenamePlayerDetection';
import { getSelectedPlayerNamesForPhoto, isPlayerSelectedForPhoto, upsertPhotoInState, handleTogglePlayerTag as sharedHandleTogglePlayerTag } from '../../utils/playerTagging';




type FaceTagBox = {
  id: string;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;


  playerName?: string | null;
  playerNumber?: string | null;
};

const loadImageElement = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Failed to load image for face detection'));
  image.src = src;
});

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

let blazeFaceModelPromise: Promise<any> | null = null;

const getBlazeFaceModel = async () => {
  if (!blazeFaceModelPromise) {
    blazeFaceModelPromise = blazeface.load();
  }
  return blazeFaceModelPromise;
// ...existing code...

const resolvePhotoImageUrl = async (photo: Photo): Promise<string | null> => {
  const source = photo.fullImageUrl || photo.thumbnailUrl;
  if (!source) return null;
  if (source.startsWith('http') || source.startsWith('/')) return source;

  const response = await fetch(`/api/blob-sas?blobName=${encodeURIComponent(source)}`);
  if (!response.ok) return null;
  const data = await response.json();
  return typeof data?.sasUrl === 'string' ? data.sasUrl : null;
};

const detectFaceBoxesInBrowser = async (photo: Photo): Promise<{ faceBoxes: FaceTagBox[]; error?: string | null }> => {
  try {
    const imageUrl = await resolvePhotoImageUrl(photo);
    if (!imageUrl) {
      return { faceBoxes: [], error: 'Could not load image for face detection.' };
    }

    const image = await loadImageElement(imageUrl);
    const width = Number(image.naturalWidth || image.width || 0);
    const height = Number(image.naturalHeight || image.height || 0);
    if (!width || !height) {
      return { faceBoxes: [], error: 'Image dimensions were unavailable for face detection.' };
    }

    const FaceDetectorCtor = (window as any).FaceDetector;
    if (FaceDetectorCtor) {
      const detector = new FaceDetectorCtor({ maxDetectedFaces: 20, fastMode: true });
      const detections: Array<{ boundingBox?: { x?: number; y?: number; width?: number; height?: number } }> = await detector.detect(image);

      return {
        faceBoxes: detections
          .map((detection: { boundingBox?: { x?: number; y?: number; width?: number; height?: number } }, index: number) => ({
            id: `face-${index + 1}`,
            leftPct: clampPercent((Number(detection?.boundingBox?.x || 0) / width) * 100),
            topPct: clampPercent((Number(detection?.boundingBox?.y || 0) / height) * 100),
            widthPct: clampPercent((Number(detection?.boundingBox?.width || 0) / width) * 100),
            heightPct: clampPercent((Number(detection?.boundingBox?.height || 0) / height) * 100),
          }))
          .filter((box: FaceTagBox) => box.widthPct > 0 && box.heightPct > 0),
        error: null,
      };
    }

    const model = await getBlazeFaceModel();
    const predictions = await model.estimateFaces(image, false);

    const mappedFaceBoxes: FaceTagBox[] = (predictions || []).map((prediction: any, index: number): FaceTagBox => {
        const topLeft = Array.isArray(prediction.topLeft)
          ? prediction.topLeft
          : (prediction.topLeft?.arraySync?.() || [0, 0]);
        const bottomRight = Array.isArray(prediction.bottomRight)
          ? prediction.bottomRight
          : (prediction.bottomRight?.arraySync?.() || [0, 0]);

        const x1 = Number(topLeft?.[0] || 0);
        const y1 = Number(topLeft?.[1] || 0);
        const x2 = Number(bottomRight?.[0] || 0);
        const y2 = Number(bottomRight?.[1] || 0);

        const boxWidth = Math.max(0, x2 - x1);
        const boxHeight = Math.max(0, y2 - y1);

        return {
          id: `face-${index + 1}`,
          leftPct: clampPercent((x1 / width) * 100),
          topPct: clampPercent((y1 / height) * 100),
          widthPct: clampPercent((boxWidth / width) * 100),
          heightPct: clampPercent((boxHeight / height) * 100),
        };
      });

    const faceBoxes: FaceTagBox[] = mappedFaceBoxes
      .filter((box) => box.widthPct > 0 && box.heightPct > 0);

    return {
      faceBoxes,
      error: null,
    };
  } catch (error) {
    console.error('Client-side face box detection failed:', error);
    return { faceBoxes: [], error: 'Face boxes could not be detected for this image.' };
  }
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




const AdminPhotos: React.FC = () => {
  type DuplicateMode = 'allow' | 'skip' | 'overwrite';
  type DetectionResult = {
    detectedNumbers: string[];
    usedCachedDetections?: boolean;
    detectedNumbersUpdatedAt?: string | null;
    numberMatchingAvailable?: boolean;
    rosterPlayersWithNumbersCount?: number;
    faceMatchingAvailable?: boolean;
    faceMatches: Array<{ playerName: string; playerNumber?: string | null; distance: number }>;
    faceBoxes: FaceTagBox[];
    faceDetectionError?: string | null;
    numberMatches: Array<{ playerName: string; playerNumber?: string | null; matchedNumber: string }>;
    suggestions: Array<{ playerName: string; playerNumber?: string | null; reasons: string[]; confidence: number }>;
  };

  type UploadItem = {
    id: string;
    file: File;
    previewUrl: string;
    progress: number;
    status: 'queued' | 'uploading' | 'done' | 'error';
    duplicateMode: DuplicateMode;
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
  const [pendingDuplicateFiles, setPendingDuplicateFiles] = useState<File[] | null>(null);
  const [pendingDuplicateCount, setPendingDuplicateCount] = useState(0);
  const [duplicateModeSelection, setDuplicateModeSelection] = useState<DuplicateMode>('skip');
  const [detectionByPhotoId, setDetectionByPhotoId] = useState<Record<number, DetectionResult>>({});
  const [detectingPhotoId, setDetectingPhotoId] = useState<number | null>(null);
  const [selectedFaceBoxByPhotoId, setSelectedFaceBoxByPhotoId] = useState<Record<number, string | null>>({});
  const [playerSearchByPhotoId, setPlayerSearchByPhotoId] = useState<Record<number, string>>({});

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
      setPhotos(Array.isArray(data) ? data : []);
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

    const items: UploadItem[] = workingFiles.map((file, idx) => ({
      id: `${Date.now()}-${idx}-${file.name}`,
      file,
      previewUrl: URL.createObjectURL(file),
      progress: 0,
      status: 'queued',
      duplicateMode,
      attempts: 0,
    }));

    setUploadItems(items);
    setUploading(true);
    setUploadMessage(null);
    setUploadProgress({ completed: 0, total: workingFiles.length });

    const uploadSingleItem = async (item: UploadItem, autoRetries = 2): Promise<{ ok: boolean; uploadedPhoto?: Photo }> => {
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
          const uploaded = await photoService.uploadPhotos(albumId ?? 0, [item.file], undefined, item.duplicateMode, (percent) => {
            setUploadItems((prev) =>
              prev.map((entry) =>
                entry.id === item.id
                  ? { ...entry, status: 'uploading', progress: percent, attempts: attempt }
                  : entry
              )
            );
          });

          const skippedByServer = item.duplicateMode === 'skip' && uploaded.length === 0;

          setUploadItems((prev) =>
            prev.map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    status: 'done',
                    progress: 100,
                    attempts: attempt,
                    error: skippedByServer ? 'Skipped duplicate' : undefined,
                  }
                : entry
            )
          );
          return { ok: true, uploadedPhoto: uploaded[0] };
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
          return { ok: false };
        }
      }

      return { ok: false };
    };

    try {
      let completed = 0;
      let failed = 0;

      for (let i = 0; i < items.length; i += 1) {
        const current = items[i];
        const result = await uploadSingleItem(current, 2);
        if (result.ok) {
          completed += 1;
          if (result.uploadedPhoto?.id) {
            // If we have a roster, auto-tag from filename using roster names
            if (rosterPlayers.length > 0) {
              const detectedPlayers = detectPlayersFromFilenames(
                [result.uploadedPhoto.fileName],
                rosterPlayers
              );
              
              if (detectedPlayers.length > 0) {
                try {
                  console.log(`Auto-tagging ${result.uploadedPhoto.fileName} with players from filename:`, detectedPlayers);
                  await photoService.updatePhotoPlayers(result.uploadedPhoto.id, detectedPlayers);
                } catch (error) {
                  console.error('Failed to auto-tag from filename:', error);
                }
              }
            } else {
              // No roster yet - extract potential names and log them
              const potentialNames = extractPotentialPlayerNamesFromFilenames([result.uploadedPhoto.fileName]);
              if (potentialNames.length > 0) {
                console.log(`Potential player names detected in ${result.uploadedPhoto.fileName}:`, potentialNames);
              }
            }
            
            // Then run face/number detection
            await handleDetectPlayers(result.uploadedPhoto, { silent: true });
          }
        } else {
          failed += 1;
        }
        setUploadProgress({ completed: completed + failed, total: workingFiles.length });
      }

      if (failed === 0) {
        const skipSuffix = skippedClientSide > 0 ? ` Skipped ${skippedClientSide} duplicate photo${skippedClientSide === 1 ? '' : 's'}.` : '';
        setUploadMessage({ type: 'success', text: `Uploaded ${completed} photo${completed === 1 ? '' : 's'} successfully.${skipSuffix}` });
      } else if (completed > 0) {
        const skipSuffix = skippedClientSide > 0 ? ` Skipped ${skippedClientSide} duplicate photo${skippedClientSide === 1 ? '' : 's'}.` : '';
        setUploadMessage({ type: 'error', text: `Uploaded ${completed} photo${completed === 1 ? '' : 's'}, ${failed} failed.${skipSuffix}` });
      } else {
        setUploadMessage({ type: 'error', text: 'Upload failed. Please try again.' });
      }

      await loadPhotos();
      await loadAlbums();

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
          const uploaded = await photoService.uploadPhotos(albumId ?? 0, [item.file], undefined, item.duplicateMode, (percent) => {
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

          if (uploaded[0]?.id) {
            await handleDetectPlayers(uploaded[0], { silent: true });
          }

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

  // Use shared handleTogglePlayerTag
  const handleTogglePlayerTag = (photo: Photo, player: { playerName: string; playerNumber?: string }) => {
    return sharedHandleTogglePlayerTag({
      photo,
      player,
      rosterPlayers,
      setPhotos,
      photoService,
      setUploadMessage,
    });
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
        {Array.isArray(photos) && photos.map((photo) => (
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
                <div style={{ margin: '0.35rem 0 0 0' }}>
                  <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.82rem', color: '#f5b041', fontWeight: 600 }}>
                    👤 {(photo as any).playerNames}
                  </p>
                  {/* Existing tags as clickable chips for easy removal */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {getSelectedPlayerNamesForPhoto(photo).map((playerName) => {
                      const player = rosterPlayers.find((p) => p.playerName === playerName);
                      return (
                        <button
                          key={`existing-${playerName}`}
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('Clicked existing tag:', playerName, 'with number:', player?.playerNumber);
                            handleTogglePlayerTag(photo, { playerName, playerNumber: player?.playerNumber || undefined });
                          }}
                          style={{
                            border: '1px solid var(--primary-color)',
                            borderRadius: '999px',
                            padding: '0.2rem 0.55rem',
                            fontSize: '0.74rem',
                            cursor: 'pointer',
                            background: 'var(--primary-color)',
                            color: '#fff',
                            zIndex: 10,
                            position: 'relative',
                          }}
                          title={`Click to remove ${playerName}`}
                        >
                          {player?.playerNumber ? `${playerName} #${player.playerNumber}` : playerName} ✕
                        </button>
                      );
                    })}
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
                        <FaceBoxPreview
                          photo={photo}
                          faceBoxes={detectionByPhotoId[photo.id].faceBoxes}
                          selectedFaceBoxId={selectedFaceBoxByPhotoId[photo.id] || null}
                          onSelectFaceBox={(faceBoxId) => setSelectedFaceBoxByPhotoId((prev) => ({
                            ...prev,
                            [photo.id]: faceBoxId,
                          }))}
                        />
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

                  {/* Filtered roster chips */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {(() => {
                      const q = (playerSearchByPhotoId[photo.id] ?? '').toLowerCase().trim();
                      const filtered = q
                        ? rosterPlayers.filter(
                            (p) =>
                              p.playerName.toLowerCase().includes(q) ||
                              (p.playerNumber ?? '').includes(q)
                          )
                        : rosterPlayers;
                      return filtered.map((player, idx) => {
                        const selected = isPlayerSelectedForPhoto(photo, player.playerName);
                        const selectedFaceBoxId = selectedFaceBoxByPhotoId[photo.id];
                        return (
                          <button
                            key={`${player.playerName}-${player.playerNumber || ''}-${idx}`}
                            type="button"
                            onClick={() => {
                              if (selectedFaceBoxId) {
                                handleAssignPlayerToSelectedFace(photo, player);
                              } else {
                                handleTogglePlayerTag(photo, player);
                              }
                              setPlayerSearchByPhotoId((prev) => ({ ...prev, [photo.id]: '' }));
                            }}
                            style={{
                              border: `1px solid ${selected ? 'var(--primary-color)' : 'var(--border-color)'}`,
                              borderRadius: '999px',
                              padding: '0.2rem 0.55rem',
                              fontSize: '0.78rem',
                              cursor: 'pointer',
                              background: selected ? 'var(--primary-color)' : 'var(--bg-tertiary)',
                              color: selected ? '#fff' : 'var(--text-primary)',
                            }}
                            title={selectedFaceBoxId
                              ? `Assign ${player.playerName} to selected face box`
                              : (selected ? 'Click to untag' : 'Click to tag')}
                          >
                            {player.playerNumber ? `${player.playerName} #${player.playerNumber}` : player.playerName}
                          </button>
                        );
                      });
                    })()}
                  </div>

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

function FaceBoxPreview({
  photo,
  faceBoxes,
  selectedFaceBoxId,
  onSelectFaceBox,
}: {
  photo: Photo;
  faceBoxes: FaceTagBox[];
  selectedFaceBoxId: string | null;
  onSelectFaceBox: (faceBoxId: string) => void;
}) {
  const source = photo.fullImageUrl || photo.thumbnailUrl;
  const isBlobName = !!source && !source.startsWith('/') && !source.startsWith('http');
  const sasUrl = useSasUrl(isBlobName ? source : null);
  const resolvedSrc = isBlobName ? (sasUrl || '') : (source || '');

  if (!resolvedSrc) return null;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 360,
        aspectRatio: '1 / 1',
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid var(--border-color)',
        background: '#111827',
      }}
    >
      <img
        src={resolvedSrc}
        alt={photo.fileName}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          filter: 'brightness(0.96)',
        }}
      />
      {faceBoxes.map((faceBox) => {
        const isSelected = faceBox.id === selectedFaceBoxId;
        const hasAssignedPlayer = !!faceBox.playerName;
        return (
          <button
            key={faceBox.id}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSelectFaceBox(faceBox.id);
            }}
            title={faceBox.playerName ? `${faceBox.id}: ${faceBox.playerName}` : `${faceBox.id}: click to select`}
            style={{
              position: 'absolute',
              left: `${faceBox.leftPct}%`,
              top: `${faceBox.topPct}%`,
              width: `${faceBox.widthPct}%`,
              height: `${faceBox.heightPct}%`,
              border: isSelected
                ? '2px solid #f5b041'
                : hasAssignedPlayer
                  ? '2px solid #7ee0b7'
                  : '2px solid rgba(255,255,255,0.85)',
              background: isSelected
                ? 'rgba(245, 176, 65, 0.18)'
                : hasAssignedPlayer
                  ? 'rgba(126, 224, 183, 0.14)'
                  : 'rgba(255,255,255,0.05)',
              borderRadius: 6,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                transform: 'translateY(-100%)',
                background: 'rgba(17, 24, 39, 0.92)',
                color: '#fff',
                fontSize: '0.68rem',
                padding: '0.12rem 0.35rem',
                borderRadius: '0.35rem 0.35rem 0 0',
                whiteSpace: 'nowrap',
              }}
            >
              {faceBox.playerName ? `${faceBox.id}: ${faceBox.playerName}` : faceBox.id}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Helper to format photo metadata for display
function getMetadataForDisplay(photo: Photo | null): Record<string, string | number> {
  if (!photo) return {};

  let exif: Record<string, any> = {};
  exif = parsePhotoMetadata(photo);

  const metadata: Record<string, string | number> = {
    'File Name': photo.fileName || 'N/A',
    'Photo ID': photo.id,
  };

  if ((photo as any).playerNames) {
    metadata['Players'] = (photo as any).playerNames;
  }
  if ((photo as any).playerNumbers) {
    metadata['Player Numbers'] = (photo as any).playerNumbers;
  }

  if (exif.caption) metadata['Caption'] = String(exif.caption);
  if (exif.headline) metadata['Headline'] = String(exif.headline);
  if (exif.keywords) metadata['Keywords'] = String(exif.keywords);

  if (exif.cameraMake || exif.cameraModel) {
    metadata['Camera'] = `${exif.cameraMake || ''}${exif.cameraMake && exif.cameraModel ? ' ' : ''}${exif.cameraModel || ''}`.trim();
  }
  if (exif.dateTaken) metadata['Date Taken'] = String(exif.dateTaken);

  if (exif.iso) metadata['ISO'] = String(exif.iso);
  if (exif.aperture) metadata['Aperture'] = String(exif.aperture);
  if (exif.fNumber) metadata['F Number'] = String(exif.fNumber);
  if (exif.shutterSpeed) metadata['Shutter Speed'] = String(exif.shutterSpeed);
  if (exif.exposureTime) metadata['Exposure Time'] = String(exif.exposureTime);
  if (exif.exposureProgram) metadata['Exposure Program'] = String(exif.exposureProgram);
  if (exif.focalLength) metadata['Focal Length'] = String(exif.focalLength);
  if (exif.meteringMode) metadata['Metering Mode'] = String(exif.meteringMode);

  if (exif.city || exif.stateOrProvince) {
    metadata['Location'] = `${exif.city || ''}${exif.city && exif.stateOrProvince ? ', ' : ''}${exif.stateOrProvince || ''}`.trim();
  }

  if (exif.colorSpace) metadata['Color Space'] = String(exif.colorSpace);
  if (exif.colorProfile) metadata['Color Profile'] = String(exif.colorProfile);
  if (exif.redEye) metadata['Red Eye'] = String(exif.redEye);
  if (exif.alphaChannel) metadata['Alpha Channel'] = String(exif.alphaChannel);

  if (photo.width && photo.height) {
    metadata['Dimensions'] = `${photo.width} × ${photo.height}`;
  } else if (exif.width && exif.height) {
    metadata['Dimensions'] = `${exif.width} × ${exif.height}`;
  }
  if (exif.fileSize) {
    const bytes = Number(exif.fileSize);
    if (Number.isFinite(bytes) && bytes > 0) {
      metadata['File Size'] = `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
  }

  if (Array.isArray(exif.faceTags) && exif.faceTags.length > 0) {
    metadata['Face Tags'] = exif.faceTags
      .map((faceTag: FaceTagBox) => `${faceTag.id}${faceTag.playerName ? ` → ${faceTag.playerName}${faceTag.playerNumber ? ` #${faceTag.playerNumber}` : ''}` : ''}`)
      .join(', ');
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

  return metadata;
}

export default AdminPhotos;
