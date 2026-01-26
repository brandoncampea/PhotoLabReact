import api from './api';
import { mockApi } from './mockApi';
import { adminMockApi } from './adminMockApi';
import { Photo } from '../types';

const useMockApi = import.meta.env.VITE_USE_MOCK_API === 'true';

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

const buildMockRecommendations = (photoId: number) => normalizeRecommendations({
  photo: {
    id: photoId,
    fileName: `photo-${photoId}.jpg`,
    width: 3000,
    height: 2000,
    aspectRatio: '3:2',
    orientation: 'landscape',
    megapixels: '6 MP',
  },
  recommendations: [
    {
      id: 201,
      name: '8x10 Print',
      category: 'Prints',
      price: 9.99,
      description: 'Classic matte finish',
      recommendationScore: 0.92,
      reasons: ['Fits 3:2 crop well', 'Great for portraits and teams'],
      matchQuality: 'excellent',
    },
    {
      id: 202,
      name: '5x7 Print',
      category: 'Prints',
      price: 6.99,
      description: 'Lustre paper',
      recommendationScore: 0.83,
      reasons: ['Minimal cropping needed'],
      matchQuality: 'good',
    },
    {
      id: 203,
      name: 'Digital Download',
      category: 'Digital',
      price: 14.99,
      description: 'Full-resolution file',
      recommendationScore: 0.78,
      reasons: ['Best for sharing and archiving'],
      matchQuality: 'good',
    },
  ],
});

export const photoService = {
  async getPhotosByAlbum(albumId: number, playerName?: string): Promise<Photo[]> {
    if (useMockApi) {
      return mockApi.photos.getPhotosByAlbum(albumId);
    }
    const url = playerName 
      ? `/photos/album/${albumId}?playerName=${encodeURIComponent(playerName)}`
      : `/photos/album/${albumId}`;
    const response = await api.get<Photo[]>(url);
    return response.data;
  },

  async getPhoto(id: number): Promise<Photo> {
    if (useMockApi) {
      return mockApi.photos.getPhoto(id);
    }
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
    if (useMockApi) {
      const filesWithMeta = files.map((file, idx) => ({ file, metadata: undefined, description: descriptions?.[idx] }));
      // adminMockApi has the upload helper
      // @ts-ignore
      const { adminMockApi } = await import('./adminMockApi');
      // @ts-ignore
      return adminMockApi.photos.upload(albumId, filesWithMeta);
    }
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
    if (useMockApi) {
      await adminMockApi.photos.delete(id);
      return;
    }
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
    try {
      const response = await api.get(`/photos/${photoId}/recommendations`);
      return normalizeRecommendations(response.data);
    } catch (error: any) {
      const is404 = error?.response?.status === 404;
      if (useMockApi || is404) {
        console.warn('Using mock recommendations for photo', photoId, '(mock API or 404)');
        return buildMockRecommendations(photoId);
      }
      throw error;
    }
  },
};
