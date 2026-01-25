import api from './api';
import { mockApi } from './mockApi';
import { Photo } from '../types';

const useMockApi = import.meta.env.VITE_USE_MOCK_API === 'true';

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
    return response.data;
  },
};
