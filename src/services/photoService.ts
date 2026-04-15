// Helper for chunked upload
async function uploadFileInChunks({
  file,
  albumId,
  chunkSize = 1024 * 1024 * 2, // 2MB
  onProgress,
  description,
  duplicateMode = 'allow',
  metadata,
}) {
  const totalChunks = Math.ceil(file.size / chunkSize);
  const fileId = `${albumId}_${file.name}_${file.size}_${file.lastModified}`;
  let uploaded = 0;
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(file.size, start + chunkSize);
    const chunk = file.slice(start, end);
    const formData = new FormData();
    formData.append('fileId', fileId);
    formData.append('chunkIndex', String(i));
    formData.append('totalChunks', String(totalChunks));
    formData.append('chunk', chunk);
    await api.post('/photos/chunked-upload/upload-chunk', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    uploaded += chunk.size;
    if (onProgress) {
      const percent = Math.round((uploaded / file.size) * 100);
      onProgress(percent);
    }
  }
  // Assemble chunks
  const assemblePayload = {
    fileId,
    totalChunks,
    fileName: file.name,
    albumId,
    mimetype: file.type,
    description,
    metadata,
    duplicateMode,
  };
  const response = await api.post('/photos/chunked-upload/assemble-chunks', assemblePayload);
  return response.data;
}

import api from './api';
import { Photo } from '../types';


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


export const photoService = {
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

  async uploadPhotos(
    albumId: number,
    files: File[],
    descriptions?: string[],
    duplicateMode: 'allow' | 'skip' | 'overwrite' = 'allow',
    onProgress?: (percent: number) => void
  ): Promise<Photo[]> {
    // Use chunked upload for files > 8MB, otherwise normal upload
    const CHUNK_THRESHOLD = 8 * 1024 * 1024;
    const results: Photo[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const desc = descriptions?.[i] || '';
      if (file.size > CHUNK_THRESHOLD) {
        const photo = await uploadFileInChunks({
          file,
          albumId,
          description: desc,
          duplicateMode,
          onProgress: (percent) => {
            if (onProgress) onProgress(percent);
          },
        });
        results.push(photo);
      } else {
        const formData = new FormData();
        formData.append('albumId', String(albumId));
        formData.append('duplicateMode', duplicateMode);
        formData.append('photos', file);
        if (desc) {
          formData.append('descriptions', JSON.stringify([desc]));
        }
        const response = await api.post<Photo[]>(`/photos/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (event) => {
            if (!onProgress) return;
            const total = event.total || 0;
            if (!total) return;
            const percent = Math.min(100, Math.max(0, Math.round((event.loaded / total) * 100)));
            onProgress(percent);
          },
        });
        if (Array.isArray(response.data)) results.push(...response.data);
      }
    }
    return results;
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
