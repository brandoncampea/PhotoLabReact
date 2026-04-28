import { Photo } from '../types';

/**
 * Associates a detected face with a tagged player if only one face and one player are present.
 * Updates the photo metadata to link the face box to the player.
 */
export function autoAssociateSingleFaceWithPlayer(photo: Photo, faceBoxes: any[]): any[] {
  const playerNames = (photo.playerNames || '').split(',').map((n: string) => n.trim()).filter(Boolean);
  if (faceBoxes.length === 1 && playerNames.length === 1) {
    return [{ ...faceBoxes[0], playerName: playerNames[0] }];
  }
  return faceBoxes;
}

/**
 * Returns detection overlays (faces, numbers) for a photo, ensuring overlays are only on the main photo object.
 * Optionally auto-associates a single detected face with a tagged player.
 */
export function getDetectionOverlaysForPhoto(photo: Photo, faceBoxes: any[]): any[] {
  return autoAssociateSingleFaceWithPlayer(photo, faceBoxes);
}
// Tag a photo with player names extracted from its filename, regardless of roster

/**
 * Extracts player names from a filename and returns them as an array of strings.
 * Example: "ADDISON_RICE_20.jpg" => ["Addison Rice"]
 */
export function extractPlayerNamesFromFilename(filename: string): string[] {
  const base = filename.replace(/\.[^.]+$/, '');
  const normalized = base.replace(/[-]+/g, '_');
  let parts = normalized.split('_').filter(Boolean);
  if (parts.length < 2) return [];
  // Remove trailing number if present
  if (/^\d+$/.test(parts[parts.length - 1])) parts = parts.slice(0, -1);
  // Remove trailing non-name codes (positions, etc.)
  const NON_NAME_CODES = ['MM', 'GK', 'FWD', 'DEF', 'MID', 'POS', 'G', 'D', 'M', 'F', 'C', 'W', 'S', 'A'];
  while (parts.length > 1 && NON_NAME_CODES.includes(parts[parts.length - 1].toUpperCase())) {
    parts = parts.slice(0, -1);
  }
  // Join all as name, capitalize
  const name = parts
    .map(
      (part) =>
        part
          .replace(/[^a-zA-Z]/g, ' ')
          .toLowerCase()
          .replace(/\b\w/g, (c) => c.toUpperCase())
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return name ? [name] : [];
}

/**
 * Tags a photo object with player names extracted from its filename.
 * Returns a new photo object with playerNames set.
 */
export function tagPhotoWithFilenamePlayers(photo: Photo): Photo {
  if (!photo.fileName) return photo;
  const playerNames = extractPlayerNamesFromFilename(photo.fileName);
  if (playerNames.length === 0) return photo;
  return {
    ...photo,
    playerNames: playerNames.join(', '),
  };
}
// Centralized function: extract player from filename, add to roster if missing, and tag image
export function extractAndTagPlayerFromFilename({ file, player }: { file: File; player?: { name: string; number?: string } }, roster: Array<{ name: string; number: string }>): { updatedImage: { file: File; player?: { name: string; number?: string } }, updatedRoster: Array<{ name: string; number: string }> } {
  // If already tagged, skip extraction
  if (player && player.name) {
    return { updatedImage: { file, player }, updatedRoster: addPlayerToRosterIfMissing(roster, player) };
  }
  const extracted = extractPlayerNameFromFilename(file.name);
  if (!extracted) {
    return { updatedImage: { file }, updatedRoster: roster };
  }
  const updatedRoster = addPlayerToRosterIfMissing(roster, extracted);
  return { updatedImage: { file, player: extracted }, updatedRoster };
}

// Deduplicate images by file name, updating the original image with new tags (no duplicates)
export function deduplicateAndTagImages<T extends { file: File; player?: { name: string; number?: string } }>(images: T[], roster: Array<{ name: string; number: string }>): { images: T[]; roster: Array<{ name: string; number: string }> } {
  const seen = new Map<string, T>();
  let updatedRoster = roster;
  for (const img of images) {
    const { updatedImage, updatedRoster: newRoster } = extractAndTagPlayerFromFilename(img, updatedRoster);
    updatedRoster = newRoster;
    seen.set(img.file.name, { ...img, ...updatedImage });
  }
  return { images: Array.from(seen.values()), roster: updatedRoster };
}
// Deduplicate images by file name (last occurrence wins)
export function deduplicateImagesByFileName<T extends { file: File }>(images: T[]): T[] {
  const seen = new Map<string, T>();
  for (const img of images) {
    seen.set(img.file.name, img);
  }
  return Array.from(seen.values());
}

// Extracts player name from a filename like AJAH_HELM_87.jpg -> Ajah Helm
export function extractPlayerNameFromFilename(filename: string): { name: string; number?: string } | null {
  // Remove extension
  const base = filename.replace(/\.[^.]+$/, '');
  // Replace hyphens with underscores for uniformity
  const normalized = base.replace(/[-]+/g, '_');
  // Split by underscores
  let parts = normalized.split('_').filter(Boolean);
  if (parts.length === 0) return null;

  // Try to extract number from last part, or from the end of the name
  let number: string | undefined = undefined;
  let nameParts = parts;
  // If last part is a number, pop it
  if (/^\d+$/.test(parts[parts.length - 1])) {
    number = parts.pop();
    nameParts = parts;
  } else {
    // If last part ends with digits, split them off
    const match = parts[parts.length - 1].match(/^(.*?)(\d{1,3})$/);
    if (match) {
      nameParts = [...parts.slice(0, -1), match[1]];
      number = match[2];
    }
  }
  // Remove trailing non-name codes (positions, etc.)
  const NON_NAME_CODES = ['MM', 'GK', 'FWD', 'DEF', 'MID', 'POS', 'G', 'D', 'M', 'F', 'C', 'W', 'S', 'A'];
  while (nameParts.length > 1 && NON_NAME_CODES.includes(nameParts[nameParts.length - 1].toUpperCase())) {
    nameParts = nameParts.slice(0, -1);
  }
  // Join remaining as name, capitalize
  const name = nameParts
    .filter(Boolean)
    .map(
      (part) =>
        part
          .replace(/[^a-zA-Z]/g, ' ')
          .toLowerCase()
          .replace(/\b\w/g, (c) => c.toUpperCase())
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name) return null;
  return { name, number };
}

// Adds player to roster if not already present (case-insensitive)
export function addPlayerToRosterIfMissing(players: Array<{ name: string; number: string }>, player: { name: string; number?: string }): Array<{ name: string; number: string }> {
  const exists = players.some(
    (p) => p.name.trim().toLowerCase() === player.name.trim().toLowerCase() && (!player.number || p.number === player.number)
  );
  if (exists) return players;
  return [...players, { name: player.name, number: player.number || '' }];
}

// Tags an image upload with a player (for use in upload UIs)
export function tagImageWithPlayer(img: { file: File; player?: { name: string; number?: string } }, player: { name: string; number?: string }) {
  return { ...img, player };
}

export function getSelectedPlayerNamesForPhoto(photo: Photo): string[] {
  return String((photo as any).playerNames || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

export function isPlayerSelectedForPhoto(photo: Photo, playerName: string): boolean {
  const key = String(playerName || '').trim().toLowerCase();
  return getSelectedPlayerNamesForPhoto(photo).some((name) => name.toLowerCase() === key);
}

/**
 * Upserts a photo in the photos state array by id. If the photo exists, it is updated; otherwise, it is added.
 * @param setPhotos The setPhotos state setter from useState
 * @param updatedPhoto The photo object to upsert
 */
export function upsertPhotoInState(setPhotos: Function, updatedPhoto: Photo) {
  setPhotos((prev: Photo[]) => {
    const idx = prev.findIndex((photo) => Number(photo.id) === Number(updatedPhoto.id));
    if (idx !== -1) {
      // Update existing photo
      return prev.map((photo) => (Number(photo.id) === Number(updatedPhoto.id) ? { ...photo, ...updatedPhoto } : photo));
    } else {
      // Add new photo
      return [...prev, updatedPhoto];
    }
  });
}


export async function handleTogglePlayerTag({
  photo,
  player,
  rosterPlayers,
  setPhotos,
  photoService,
  setUploadMessage,
}: {
  photo: Photo;
  player: { playerName: string; playerNumber?: string };
  rosterPlayers: Array<{ playerName: string; playerNumber?: string }>;
  setPhotos: Function;
  photoService: any;
  setUploadMessage: Function;
}) {
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

  upsertPhotoInState(setPhotos, optimisticPhoto);

  try {
    const updated = await photoService.updatePhotoPlayers(photo.id, selectedPlayers);
    const updatedPhoto: Photo = {
      ...optimisticPhoto,
      ...updated,
      playerNames: newPlayerNames,
      playerNumbers: newPlayerNumbers,
    };
    upsertPhotoInState(setPhotos, updatedPhoto);
    setUploadMessage && setUploadMessage({ type: 'success', text: 'Player tag updated.' });
  } catch (error) {
    upsertPhotoInState(setPhotos, photo);
    setUploadMessage && setUploadMessage({ type: 'error', text: 'Failed to update player tag.' });
  }
}

