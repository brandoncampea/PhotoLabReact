import { Photo } from '../types';

/**
 * Centralized utility to handle auto-tagging a photo from filename and associating with detected faces.
 * - If roster is present, uses detectPlayersFromFilenames to tag photo.
 * - If no roster, extracts potential player names from filename.
 * - If only one face and one name, auto-tags the face box with the name.
 */
/**
 * Helper to robustly extract a player name from a filename like ALINA_KUROPATKIN_74.jpg or AJAH_HELM_88.jpg
 * - Splits on underscores/hyphens
 * - Ignores trailing numbers
 * - Capitalizes each part
 */
function extractNameFromFilename(filename: string): string | null {
  const base = filename.replace(/\.[^.]+$/, '');
  const normalized = base.replace(/[-]+/g, '_');
  let parts = normalized.split('_').filter(Boolean);
  if (parts.length === 0) return null;
  // Remove trailing number if present
  if (/^\d+$/.test(parts[parts.length - 1])) parts = parts.slice(0, -1);
  if (parts.length === 0) return null;
  // Capitalize each part
  const name = parts.map(
    (part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
  ).join(' ');
  return name.trim() || null;
}

function addPlayerToRosterIfMissing(roster: any[], playerName: string) {
  if (!roster.some((p: any) => p.playerName.toLowerCase() === playerName.toLowerCase())) {
    roster.push({ playerName });
  }
}

export async function autoTagPhotoFromFilenameAndFaces({
  photo,
  rosterPlayers,
  photoService,
  handleDetectPlayers,
  detectionByPhotoId,
  // setDetectionByPhotoId, // removed unused variable
  setUploadMessage,
}: {
  photo: Photo,
  rosterPlayers: Array<{ playerName: string; playerNumber?: string }>,
  photoService: any,
  handleDetectPlayers: Function,
  detectionByPhotoId: Record<number, any>,
  setDetectionByPhotoId: Function,
  setUploadMessage: Function,
}) {
  // Dynamically import to avoid circular deps
  const { detectPlayersFromFilenames } = await import('../services/filenamePlayerDetection'); // removed unused extractPotentialPlayerNamesFromFilenames


  // 1. Robustly extract a player name from the filename
  const extractedName = extractNameFromFilename(photo.fileName);
  if (extractedName) {
    // Add to roster if missing
    addPlayerToRosterIfMissing(rosterPlayers, extractedName);
    await handleDetectPlayers(photo, { silent: true });
    const detection = detectionByPhotoId[photo.id];
    if (detection && detection.faceBoxes && detection.faceBoxes.length === 1) {
      // Only one face: force only one tag, overwrite any previous tags
      try {
        await photoService.updatePhotoPlayers(photo.id, [{ playerName: extractedName }]);
        setUploadMessage && setUploadMessage({ type: 'success', text: `Auto-tagged single detected face with: ${extractedName}` });
      } catch (error) {
        setUploadMessage && setUploadMessage({ type: 'error', text: 'Failed to auto-tag single detected face.' });
      }
      return;
    } else {
      // Not exactly one face: keep previous logic (tag from filename, but don't overwrite extra tags)
      try {
        await photoService.updatePhotoPlayers(photo.id, [{ playerName: extractedName }]);
        setUploadMessage && setUploadMessage({ type: 'success', text: `Auto-tagged with: ${extractedName}` });
      } catch (error) {
        setUploadMessage && setUploadMessage({ type: 'error', text: 'Failed to auto-tag from filename.' });
      }
      return;
    }
  }

  // 2. If no valid name in filename, fall back to roster-based detection
  if (rosterPlayers.length > 0) {
    const detectedPlayers = detectPlayersFromFilenames([
      photo.fileName
    ], rosterPlayers);
    if (detectedPlayers.length > 0) {
      try {
        await photoService.updatePhotoPlayers(photo.id, detectedPlayers);
        setUploadMessage && setUploadMessage({ type: 'success', text: `Auto-tagged with: ${detectedPlayers.map(p => p.playerName).join(', ')}` });
      } catch (error) {
        setUploadMessage && setUploadMessage({ type: 'error', text: 'Failed to auto-tag from roster.' });
      }
      return;
    }
  }

  // 3. If neither, just run detection
  await handleDetectPlayers(photo, { silent: true });
}
