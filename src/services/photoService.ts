import api from './api';
import { mockApi } from './mockApi';
import { Photo } from '../types';

const useMockApi = import.meta.env.VITE_USE_MOCK_API === 'true';

export const photoService = {
  async getPhotosByAlbum(albumId: number): Promise<Photo[]> {
    if (useMockApi) {
      return mockApi.photos.getPhotosByAlbum(albumId);
    }
    const response = await api.get<Photo[]>(`/albums/${albumId}/photos`);
    return response.data;
  },

  async getPhoto(id: number): Promise<Photo> {
    if (useMockApi) {
      return mockApi.photos.getPhoto(id);
    }
    const response = await api.get<Photo>(`/photos/${id}`);
    return response.data;
  },
};
