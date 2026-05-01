import api from './api';
import { setStudioTimezone } from '../utils/studioDateTime';

export const profileService = {
  async getConfig(): Promise<any> {
    const response = await api.get('/profile');
    setStudioTimezone(response?.data?.timezone);
    return response.data;
  },

  async updateConfig(data: any): Promise<any> {
    const response = await api.put('/profile', data);
    setStudioTimezone(response?.data?.timezone || data?.timezone);
    return response.data;
  },

  async uploadLogo(file: File, studioId?: number): Promise<{ logoUrl: string }> {
    const formData = new FormData();
    formData.append('logo', file);
    if (studioId) {
      formData.append('studioId', String(studioId));
    }

    const response = await api.post('/profile/upload-logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
};
