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

  // Extract all name parts, ignore numbers and abbreviations
  const nameParts = parts.filter(isNamePart);
  if (nameParts.length === 0) return null;
  const name = nameParts.map(
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
  // setDetectionByPhotoId, // removed unused variable
  setUploadMessage,
  onTagged,
}: {
  photo: Photo,
  rosterPlayers: Array<{ playerName: string; playerNumber?: string }>,
  photoService: any,
  handleDetectPlayers: Function,
  detectionByPhotoId: Record<number, any>,
  setDetectionByPhotoId: Function,
  setUploadMessage: Function,
  onTagged?: (players: Array<{ playerName: string }>) => void,
}) {
  // Dynamically import to avoid circular deps
  const { detectPlayersFromFilenames } = await import('../services/filenamePlayerDetection');

  // 1. Try to match any roster player using robust filename detection
  const detectedPlayers = detectPlayersFromFilenames([photo.fileName], rosterPlayers);
  if (detectedPlayers.length > 0) {
    // Add any detected player to roster if missing
    detectedPlayers.forEach(player => addPlayerToRosterIfMissing(rosterPlayers, player.playerName));
    try {
      await photoService.updatePhotoPlayers(photo.id, detectedPlayers);
      setUploadMessage && setUploadMessage({ type: 'success', text: `Auto-tagged with: ${detectedPlayers.map(p => p.playerName).join(', ')}` });
      if (onTagged) onTagged(detectedPlayers);
    } catch (error) {
      setUploadMessage && setUploadMessage({ type: 'error', text: 'Failed to auto-tag from filename.' });
    }
    return;
  }

  // 2. Fallback: extract a name from filename if possible (for non-rostered players)
  const extractedName = extractNameFromFilename(photo.fileName);
  if (extractedName) {
    addPlayerToRosterIfMissing(rosterPlayers, extractedName);
    try {
      await photoService.updatePhotoPlayers(photo.id, [{ playerName: extractedName }]);
      setUploadMessage && setUploadMessage({ type: 'success', text: `Auto-tagged with: ${extractedName}` });
      if (onTagged) onTagged([{ playerName: extractedName }]);
    } catch (error) {
      setUploadMessage && setUploadMessage({ type: 'error', text: 'Failed to auto-tag from filename.' });
    }
    return;
  }

  // 3. If no valid name in filename, do NOT tag anyone. Detection must be triggered manually.
}
