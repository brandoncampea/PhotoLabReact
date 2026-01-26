import api from './api';

export const profileService = {
  async getConfig(): Promise<any> {
    const response = await api.get('/profile');
    return response.data;
  },

  async updateConfig(data: any): Promise<any> {
    const response = await api.put('/profile', data);
    return response.data;
  },
};
