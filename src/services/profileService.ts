import api from './api';
import { setStudioTimezone } from '../utils/studioDateTime';
import { LandingPage } from '../types';

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

  async getLandingPage(): Promise<LandingPage> {
    const response = await api.get('/profile/landing-page');
    return response.data;
  },

  async updateLandingPage(htmlContent: string): Promise<LandingPage> {
    const response = await api.put('/profile/landing-page', { htmlContent });
    return response.data;
  },

  async resetLandingPage(): Promise<LandingPage> {
    const response = await api.post('/profile/landing-page/reset', {});
    return response.data;
  },
};
