// Notify backend after direct-to-Blob upload to save photo metadata and blob URL
export async function recordPhotoBlob({
  albumId,
  fileName,
  blobUrl,
  description,
  metadata,
  width,
  height,
  fileSizeBytes,
  playerName,
  playerNumber,
}: {
  albumId: number;
  fileName: string;
  blobUrl: string;
  description?: string;
  metadata?: any;
  width?: number;
  height?: number;
  fileSizeBytes?: number;
  playerName?: string;
  playerNumber?: string;
}): Promise<{ id: number }> {
  const response = await api.post('/photos/record-blob', {
    albumId,
    fileName,
    blobUrl,
    description,
    metadata,
    width,
    height,
    fileSizeBytes,
    playerName,
    playerNumber,
  });
  return response.data;
}
// Get SAS URL for a blob from backend
async function getSasUrl(blobName: string): Promise<string> {
  // Always use /api/blob-sas for SAS URL fetch for compatibility
  const response = await api.get<{ sasUrl?: string; url?: string }>(`/blob-sas`, { params: { blobName } });
  // Prefer sasUrl, fallback to url for legacy support
  return response.data.sasUrl || response.data.url || '';
}

// Upload a file directly to Azure Blob Storage using SAS URL
export async function uploadFileToAzureBlob({
  file,
  blobName,
  onProgress,
}: {
  file: File;
  blobName: string;
  onProgress?: (percent: number) => void;
}): Promise<string> {
  const sasUrl = await getSasUrl(blobName);
  // Removed debug logging
  const uploadOptions = onProgress
    ? {
        onProgress: (ev: { loadedBytes: number }) => {
          const percent = Math.round((ev.loadedBytes / file.size) * 100);
          onProgress(percent);
        },
      }
    : {};
  try {
    const { BlockBlobClient } = await import('@azure/storage-blob');
    const directBlobClient = new BlockBlobClient(sasUrl);
    await directBlobClient.uploadBrowserData(file, uploadOptions);
    // ...existing code...
    return directBlobClient.url;
  } catch (err) {
    // ...existing code...
    throw err;
  }
}

import api from './api';
import { Photo } from '../types';
import { extractPlayerNamesFromFilename } from '../utils/playerTagging';


const normalizeRecommendations = (data: any) => {
  const mapRec = (rec: any) => {
    const scoreRaw = rec.score ?? rec.recommendationScore ?? 0;
    const score = typeof scoreRaw === 'number'
      ? (scoreRaw <= 1 ? Math.round(scoreRaw * 100) : Math.round(scoreRaw))
      : 0;
    return {
      id: rec.id ?? rec.productId ?? rec.product_id ?? rec.product?.id ?? Math.random(),
      name: rec.name ?? rec.productName ?? rec.product?.name ?? 'Product',
      price: rec.price ?? rec.basePrice ?? rec.product?.price ?? 0,
      reasons: rec.reasons ?? [],
      matchQuality: rec.matchQuality ?? 'good',
      recommendationScore: score,
      category: rec.category ?? 'Other',
      description: rec.description,
      options: rec.options,
    };
  };

  return {
    photo: data.photo,
    recommendations: Array.isArray(data.recommendations)
      ? data.recommendations.map(mapRec)
      : [],
  };
};



const photoService = {
        async notifyWatchers(albumId: number): Promise<{ notified: number }> {
          const response = await api.post<{ notified: number }>(`/photos/album/${albumId}/notify-watchers`);
          return response.data;
        },

        async deleteAllPhotos(albumId: number): Promise<{ deleted: number }> {
          const response = await api.delete<{ deleted: number }>(`/photos/album/${albumId}/all`);
          return response.data;
        },

        async tagAllFromFilenames(albumId: number, photos: Array<{ id: number, fileName: string }>): Promise<{ tagged: number }> {
          // For each photo, extract player name from filename
          const updates = photos.map(photo => {
            const names = extractPlayerNamesFromFilename(photo.fileName);
            return names.length > 0 ? { id: photo.id, playerNames: names } : null;
          }).filter(Boolean);
          if (updates.length === 0) return { tagged: 0 };
          const response = await api.post<{ updated: number }>(`/photos/batch-update-players`, { updates });
          return { tagged: response.data.updated };
        },

        async detectAll(albumId: number): Promise<{ detected: number }> {
          const response = await api.post<{ detected: number }>(`/photos/album/${albumId}/detect-all`);
          return response.data;
        },

        async setAsCover(photoId: number): Promise<{ coverSet: boolean }> {
          const response = await api.post<{ coverSet: boolean }>(`/photos/${photoId}/set-cover`);
          return response.data;
        },

        async detectPhoto(photoId: number): Promise<{ detected: boolean }> {
          const response = await api.post<{ detected: boolean }>(`/photos/${photoId}/detect`);
          return response.data;
        },
      async clearAllTagsInAlbum(albumId: number): Promise<{ cleared: number }> {
        const response = await api.post<{ cleared: number }>(`/photos/album/${albumId}/clear-tags`);
        return response.data;
      },
    async batchUpdatePhotoPlayers(updates: Array<{ id: number; playerNames: string }>): Promise<{ updated: number }> {
      const response = await api.post<{ updated: number }>(`/photos/batch-update-players`, { updates });
      return response.data;
    },
  async updatePhoto(id: number, payload: {
    description?: string;
    metadata?: Record<string, any> | null;
    playerNames?: string[] | string | null;
    playerNumbers?: string[] | string | null;
  }): Promise<Photo> {
    const response = await api.put<Photo>(`/photos/${id}`, payload);
    return response.data;
  },

  async getPhotoDetections(photoId: number): Promise<{
    photoId: number;
    detectedNumbers: string[];
    usedCachedDetections?: boolean;
    detectedNumbersUpdatedAt?: string | null;
    numberMatchingAvailable?: boolean;
    rosterPlayersWithNumbersCount?: number;
    faceMatchingAvailable?: boolean;
    faceMatches: Array<{ playerName: string; playerNumber?: string | null; distance: number }>;
    numberMatches: Array<{ playerName: string; playerNumber?: string | null; matchedNumber: string }>;
    suggestions: Array<{ playerName: string; playerNumber?: string | null; reasons: string[]; confidence: number }>;
    currentlyTagged: { playerNames: string[]; playerNumbers: string[] };
  }> {
    const response = await api.get(`/photos/${photoId}/detections`);
    return response.data;
  },

  async getAlbumRoster(albumId: number): Promise<Array<{ playerName: string; playerNumber?: string }>> {
    const response = await api.get<Array<{ playerName: string; playerNumber?: string }>>(`/photos/album/${albumId}/roster`);
    return response.data;
  },

  async getPhotosByAlbum(albumId: number, playerName?: string): Promise<Photo[]> {
    const url = playerName 
      ? `/photos/album/${albumId}?playerName=${encodeURIComponent(playerName)}`
      : `/photos/album/${albumId}`;
    const response = await api.get<Photo[]>(url);
    return response.data;
  },

  async getPhoto(id: number): Promise<Photo> {
    const response = await api.get<Photo>(`/photos/${id}`);
    return response.data;
  },

  async updatePhotoTag(id: number, playerName: string | null, playerNumber?: string | null): Promise<Photo> {
    const response = await api.put<Photo>(`/photos/${id}`, {
      playerNames: playerName,
      playerNumbers: playerNumber || null,
    });
    return response.data;
  },

  async updatePhotoPlayers(id: number, players: Array<{ playerName: string; playerNumber?: string | null }>): Promise<Photo> {
    const names = players.map((p) => p.playerName).filter(Boolean);
    const numbers = players.map((p) => p.playerNumber || '').filter(Boolean);
    const response = await api.put<Photo>(`/photos/${id}`, {
      playerNames: names,
      playerNumbers: numbers,
    });
    return response.data;
  },

  async uploadPlayerNamesCsv(albumId: number, file: File): Promise<{ message: string; rosterName?: string; rowsParsed: number; photosUpdated: number; totalPhotos: number; rosterPlayersSaved?: number; facialRecognitionTrained?: number }> {
    const formData = new FormData();
    formData.append('csv', file);
    
    const response = await api.post<{ message: string; rosterName?: string; rowsParsed: number; photosUpdated: number; totalPhotos: number; rosterPlayersSaved?: number; facialRecognitionTrained?: number }>(
      `/photos/album/${albumId}/upload-players`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },


  async deletePhoto(id: number): Promise<void> {
    try {
      await api.delete(`/photos/${id}`);
    } catch (error: any) {
      // Ignore 404 Not Found errors (photo already deleted)
      if (error?.response?.status === 404) return;
      throw error;
    }
  },

  async getRecommendations(photoId: number): Promise<{
    photo: {
      id: number;
      fileName: string;
      width: number;
      height: number;
      aspectRatio: string;
      orientation: string;
      megapixels: string;
    };
    recommendations: Array<{
      id: number;
      name: string;
      category: string;
      price: number;
      description?: string;
      recommendationScore: number;
      reasons: string[];
      matchQuality: 'excellent' | 'good' | 'fair';
    }>;
  }> {
    const response = await api.get(`/photos/${photoId}/recommendations`);
    return normalizeRecommendations(response.data);
    },

    async getPhotoAspectRatio(photoId: number): Promise<{ aspectRatio: number }> {
      const response = await api.get<{ aspectRatio: number }>(`/photos/${photoId}/aspect-ratio`);
      return response.data;
  },
};

export { photoService };
