
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

  async uploadPhotos(albumId: number, files: File[], descriptions?: string[]): Promise<Photo[]> {
    const formData = new FormData();
    formData.append('albumId', String(albumId));
    files.forEach((file) => formData.append('photos', file));
    if (descriptions && descriptions.length) {
      formData.append('descriptions', JSON.stringify(descriptions));
    }
    const response = await api.post<Photo[]>(`/photos/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
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
