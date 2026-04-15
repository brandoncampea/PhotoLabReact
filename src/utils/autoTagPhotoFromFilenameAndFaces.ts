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
  const parts = normalized.split('_').filter(Boolean);
  if (parts.length === 0) return null;

  // Helper: is a name part (alphabetic, not all uppercase short code, not a number)
  const isNamePart = (part: string) => /^[A-Za-z]+$/.test(part) && !(part.length <= 2 && part === part.toUpperCase());

  // Find the longest sequence of consecutive name parts (length > 1)
  let bestSeq: string[] = [];
  let currentSeq: string[] = [];
  for (const part of parts) {
    if (isNamePart(part)) {
      currentSeq.push(part);
    } else {
      if (currentSeq.length > bestSeq.length && currentSeq.length > 1) {
        bestSeq = currentSeq;
      }
      currentSeq = [];
    }
  }
  // Check at end
  if (currentSeq.length > bestSeq.length && currentSeq.length > 1) {
    bestSeq = currentSeq;
  }
  if (bestSeq.length === 0) return null;
  const name = bestSeq.map(
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
    // Only tag the filename-matched player, do NOT run face detection or roster fallback on upload
    try {
      await photoService.updatePhotoPlayers(photo.id, [{ playerName: extractedName }]);
      setUploadMessage && setUploadMessage({ type: 'success', text: `Auto-tagged with: ${extractedName}` });
    } catch (error) {
      setUploadMessage && setUploadMessage({ type: 'error', text: 'Failed to auto-tag from filename.' });
    }
    return;
  }

  // 2. If no valid name in filename, do NOT tag anyone. Detection must be triggered manually.
}
