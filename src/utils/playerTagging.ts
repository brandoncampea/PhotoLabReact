// Deduplicate images by file name (last occurrence wins)
export function deduplicateImagesByFileName<T extends { file: File }>(images: T[]): T[] {
  const seen = new Map<string, T>();
  for (const img of images) {
    seen.set(img.file.name, img);
  }
  return Array.from(seen.values());
}
import { Photo } from '../types';

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

