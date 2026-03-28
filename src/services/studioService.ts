import api from './api';

export interface Studio {
  id: number;
  name: string;
  // ...other fields as needed
}

export const studioService = {
  async getStudio(studioId: number): Promise<Studio> {
    const response = await api.get<Studio>(`/studios/${studioId}`);
    return response.data;
  },
  async getAll(): Promise<Studio[]> {
    const response = await api.get<Studio[]>(`/studios`);
    return response.data;
  },
};
