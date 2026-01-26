import api from './api';
import { User } from '../types';

export const userAdminService = {
  async getAll(): Promise<User[]> {
    const response = await api.get<User[]>('/users');
    return response.data;
  },

  async toggleActive(id: number): Promise<User> {
    const response = await api.patch<User>(`/users/${id}/toggle-active`);
    return response.data;
  },

  async changeRole(id: number, role: string): Promise<User> {
    const response = await api.patch<User>(`/users/${id}/role`, { role });
    return response.data;
  },
};
