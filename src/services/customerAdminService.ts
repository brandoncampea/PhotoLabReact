import api from './api';
import { Customer } from '../types';

export const customerAdminService = {
  async getAll(): Promise<Customer[]> {
    const response = await api.get('/users');
    return response.data;
  },

  async toggleActive(id: number, isActive?: boolean): Promise<void> {
    // Fetch current user to get current status if not provided
    let newStatus = isActive;
    if (typeof isActive === 'undefined') {
      const user = await api.get(`/users/${id}`);
      newStatus = !user.data.isActive;
    }
    await api.put(`/users/${id}`, { isActive: newStatus });
  },
};
