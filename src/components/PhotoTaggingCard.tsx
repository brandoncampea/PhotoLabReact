import React from 'react';
import { Photo } from '../types';

// Props for the reusable photo tagging card
interface PhotoTaggingCardProps {
  photo: Photo;
  rosterPlayers: Array<{ playerName: string; playerNumber?: string }>;
  detection: any;
  detectingPhotoId: number | null;
  selectedFaceBoxId: string | null;
  playerSearch: string;
  onDetectPlayers: (photo: Photo) => void;
  onClearPhotoTags: (photo: Photo) => void;
  onTogglePlayerTag: (photo: Photo, player: { playerName: string; playerNumber?: string }) => void;
  onAssignPlayerToSelectedFace: (photo: Photo, player: { playerName: string; playerNumber?: string }) => void;
  onSelectFaceBox: (faceBoxId: string) => void;
  onPlayerSearchChange: (value: string) => void;
}


const PhotoTaggingCard: React.FC<PhotoTaggingCardProps> = ({
  photo,
  rosterPlayers,
  detection,
  detectingPhotoId,
  selectedFaceBoxId,
  playerSearch,
  onDetectPlayers,
  onClearPhotoTags,
  onTogglePlayerTag,
  onAssignPlayerToSelectedFace,
  // Removed unused onSelectFaceBox prop
  onPlayerSearchChange,
}) => {
  // Helper to check if a player is selected for a photo
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

  return (
    <div className="photo-info">
      {/* Show auto-tag chips (current tags on the photo) */}
      {!!(photo as any).playerNames && (
        <div style={{ margin: '0.35rem 0 0 0' }}>
          <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.82rem', color: '#f5b041', fontWeight: 600 }}>
            👤 {(photo as any).playerNames}
          </p>
          {/* Existing tags as chips, not clickable */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {getSelectedPlayerNamesForPhoto(photo).map((playerName) => (
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
                title={playerName}
              >
                {playerName}
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
              onClick={() => onDetectPlayers(photo)}
              disabled={detectingPhotoId === photo.id}
              style={{ padding: '0.12rem 0.45rem', fontSize: '0.72rem', lineHeight: 1.2 }}
              title="Detect faces and numbers for this photo"
            >
              {detectingPhotoId === photo.id ? 'Detecting…' : 'Detect'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onClearPhotoTags(photo)}
              disabled={!((photo as any).playerNames || '').trim()}
              style={{ padding: '0.12rem 0.45rem', fontSize: '0.72rem', lineHeight: 1.2 }}
              title="Clear all tags for this photo"
            >
              Clear all
            </button>
          </div>
        </div>

        {detection && (
          <div style={{ marginBottom: '0.45rem' }}>
            {detection.suggestions.length > 0 && (
              <div style={{ fontSize: '0.72rem', color: '#7ee0b7', marginBottom: '0.25rem' }}>
                Suggested players:
              </div>
            )}
            {detection.detectedNumbers.length > 0 && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                OCR numbers: {detection.detectedNumbers.join(', ')}{detection.usedCachedDetections ? ' (cached)' : ''}
              </div>
            )}
            {detection.detectedNumbers.length === 0 && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                OCR numbers: none found{detection.usedCachedDetections ? ' (cached)' : ''}
              </div>
            )}
            {detection.detectedNumbers.length > 0 && !detection.numberMatchingAvailable && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Number matching: roster has no jersey numbers saved yet
              </div>
            )}
            {detection.faceDetectionError && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Face boxes: {detection.faceDetectionError}
              </div>
            )}
            {!detection.faceMatchingAvailable && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Face matching: no trained face signatures available yet
              </div>
            )}
            {detection.faceMatchingAvailable && detection.faceMatches.length === 0 && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Face matching: no close matches found
              </div>
            )}
            {detection.suggestions.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {detection.suggestions.map((suggestion: any, idx: number) => {
                  const selected = isPlayerSelectedForPhoto(photo, suggestion.playerName);
                  return (
                    <button
                      key={`${photo.id}-suggestion-${idx}-${suggestion.playerName}`}
                      type="button"
                      onClick={() => selectedFaceBoxId
                        ? onAssignPlayerToSelectedFace(photo, { playerName: suggestion.playerName, playerNumber: suggestion.playerNumber || undefined })
                        : onTogglePlayerTag(photo, { playerName: suggestion.playerName, playerNumber: suggestion.playerNumber || undefined })}
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

            {detection.faceBoxes.length > 0 && (
              <div style={{ marginTop: '0.55rem', marginBottom: '0.45rem' }}>
                <div style={{ fontSize: '0.72rem', color: '#7ee0b7', marginBottom: '0.35rem' }}>
                  Detected faces: click a box, then click a player to tag that face.
                </div>
                {/* FaceBoxPreview must be imported and used here if needed */}
                {/* <FaceBoxPreview ...props /> */}
                <div style={{ marginTop: '0.35rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  Selected face: {selectedFaceBoxId || 'none'}
                </div>
              </div>
            )}
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
              value={playerSearch}
              onChange={(e) => onPlayerSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const raw = (playerSearch ?? '').trim();
                  if (!raw) return;
                  const exact = rosterPlayers.find(
                    (p) => p.playerName.toLowerCase() === raw.toLowerCase()
                  );
                  const player = exact ?? { playerName: raw };
                  if (selectedFaceBoxId) {
                    onAssignPlayerToSelectedFace(photo, player);
                  } else {
                    onTogglePlayerTag(photo, player);
                  }
                  onPlayerSearchChange('');
                }
                if (e.key === 'Escape') {
                  onPlayerSearchChange('');
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
              const raw = (playerSearch ?? '').trim();
              if (!raw) return null;
              const exactMatch = rosterPlayers.some(
                (p) => p.playerName.toLowerCase() === raw.toLowerCase()
              );
              if (exactMatch) return null;
              return (
                <button
                  type="button"
                  onClick={() => {
                    const player = { playerName: raw };
                    if (selectedFaceBoxId) {
                      onAssignPlayerToSelectedFace(photo, player);
                    } else {
                      onTogglePlayerTag(photo, player);
                    }
                    onPlayerSearchChange('');
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
          {/* Only search/manual entry is available. Roster chips are not rendered. */}
          {rosterPlayers.length === 0 && (
            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              No roster loaded. Type a name above and press Enter to tag.
            </div>
          )}

          {/* REMOVE: Roster chips block below search box (full list of player names as chips) */}
        </div>
      </div>
    </div>
  );
};

export default PhotoTaggingCard;
