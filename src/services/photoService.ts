
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

  async uploadPlayerNamesCsv(albumId: number, file: File): Promise<{ message: string; rowsParsed: number; photosUpdated: number; totalPhotos: number }> {
    const formData = new FormData();
    formData.append('csv', file);
    
    const response = await api.post<{ message: string; rowsParsed: number; photosUpdated: number; totalPhotos: number }>(
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
    options?: {
      batchSize?: number;
      concurrency?: number;
      maxRetries?: number;
      onProgress?: (completed: number, total: number) => void;
    }
  ): Promise<{
    uploadedPhotos: Photo[];
    failedFiles: string[];
    retriedBatches: number;
    totalFiles: number;
  }> {
    const totalFiles = files.length;
    if (totalFiles === 0) {
      return { uploadedPhotos: [], failedFiles: [], retriedBatches: 0, totalFiles: 0 };
    }

    const batchSize = Math.max(1, options?.batchSize ?? 10);
    const concurrency = Math.max(1, options?.concurrency ?? 3);
    const maxRetries = Math.max(0, options?.maxRetries ?? 2);

    const batches = [] as Array<{ files: File[]; descriptions?: string[] }>;
    for (let i = 0; i < files.length; i += batchSize) {
      const batchFiles = files.slice(i, i + batchSize);
      const batchDescriptions = descriptions?.slice(i, i + batchSize);
      batches.push({ files: batchFiles, descriptions: batchDescriptions });
    }

    const uploadSingleBatch = async (batchFiles: File[], batchDescriptions?: string[]): Promise<Photo[]> => {
      const formData = new FormData();
      formData.append('albumId', String(albumId));
      batchFiles.forEach((file) => formData.append('photos', file));
      if (batchDescriptions && batchDescriptions.length) {
        formData.append('descriptions', JSON.stringify(batchDescriptions));
      }
      const response = await api.post<Photo[]>(`/photos/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    };

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const uploadedPhotos: Photo[] = [];
    const failedFiles: string[] = [];
    let retriedBatches = 0;
    let completedFiles = 0;
    let batchIndex = 0;

    const worker = async () => {
      while (batchIndex < batches.length) {
        const currentIndex = batchIndex;
        batchIndex += 1;
        const batch = batches[currentIndex];

        let attempt = 0;
        let success = false;

        while (!success && attempt <= maxRetries) {
          try {
            if (attempt > 0) {
              retriedBatches += 1;
              await sleep(Math.min(1000 * attempt, 3000));
            }
            const uploaded = await uploadSingleBatch(batch.files, batch.descriptions);
            uploadedPhotos.push(...uploaded);
            success = true;
          } catch {
            attempt += 1;
            if (attempt > maxRetries) {
              failedFiles.push(...batch.files.map((file) => file.name));
            }
          }
        }

        completedFiles += batch.files.length;
        options?.onProgress?.(Math.min(completedFiles, totalFiles), totalFiles);
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, () => worker()));

    return {
      uploadedPhotos,
      failedFiles,
      retriedBatches,
      totalFiles,
    };
  },

  async deletePhoto(id: number): Promise<void> {
    await api.delete(`/photos/${id}`);
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
};
