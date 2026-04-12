import { Photo } from '../types';

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

export function upsertPhotoInState(setPhotos: Function, updatedPhoto: Photo) {
  setPhotos((prev: Photo[]) => prev.map((photo) => (Number(photo.id) === Number(updatedPhoto.id) ? { ...photo, ...updatedPhoto } : photo)));
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

// Add more shared tagging helpers as needed
