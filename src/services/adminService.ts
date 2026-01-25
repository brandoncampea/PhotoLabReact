import api from './api';
import { adminMockApi } from './adminMockApi';
import { ProfileConfig, Watermark, DiscountCode, UserAccount } from '../types';

const useMockApi = import.meta.env.VITE_USE_MOCK_API === 'true';

export const profileService = {
  async getProfile(): Promise<ProfileConfig> {
    if (useMockApi) {
      return adminMockApi.profile.getConfig();
    }
    try {
      const response = await api.get<ProfileConfig>('/profile');
      return response.data;
    } catch (error) {
      console.error('Error fetching profile:', error);
      throw error;
    }
  },

  async updateProfile(data: Partial<ProfileConfig>): Promise<ProfileConfig> {
    if (useMockApi) {
      return adminMockApi.profile.updateConfig(data);
    }
    try {
      const response = await api.put<ProfileConfig>('/profile', data);
      return response.data;
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
  },
};

export const watermarkService = {
  async getWatermarks(): Promise<Watermark[]> {
    if (useMockApi) {
      return adminMockApi.watermarks.getAll();
    }
    try {
      const response = await api.get<Watermark[]>('/watermarks');
      return response.data;
    } catch (error) {
      console.error('Error fetching watermarks:', error);
      throw error;
    }
  },

  async createWatermark(data: Partial<Watermark>): Promise<Watermark> {
    if (useMockApi) {
      return adminMockApi.watermarks.create(data);
    }
    try {
      const response = await api.post<Watermark>('/watermarks', data);
      return response.data;
    } catch (error) {
      console.error('Error creating watermark:', error);
      throw error;
    }
  },

  async updateWatermark(id: number, data: Partial<Watermark>): Promise<Watermark> {
    if (useMockApi) {
      return adminMockApi.watermarks.update(id, data);
    }
    try {
      const response = await api.put<Watermark>(`/watermarks/${id}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating watermark:', error);
      throw error;
    }
  },

  async deleteWatermark(id: number): Promise<void> {
    if (useMockApi) {
      return adminMockApi.watermarks.delete(id);
    }
    try {
      await api.delete(`/watermarks/${id}`);
    } catch (error) {
      console.error('Error deleting watermark:', error);
      throw error;
    }
  },
};

export const discountCodeService = {
  async getDiscountCodes(): Promise<DiscountCode[]> {
    if (useMockApi) {
      return adminMockApi.discountCodes.getAll();
    }
    try {
      const response = await api.get<DiscountCode[]>('/discount-codes');
      return response.data;
    } catch (error) {
      console.error('Error fetching discount codes:', error);
      throw error;
    }
  },

  async createDiscountCode(data: Partial<DiscountCode>): Promise<DiscountCode> {
    if (useMockApi) {
      return adminMockApi.discountCodes.create(data);
    }
    try {
      const response = await api.post<DiscountCode>('/discount-codes', data);
      return response.data;
    } catch (error) {
      console.error('Error creating discount code:', error);
      throw error;
    }
  },

  async updateDiscountCode(id: number, data: Partial<DiscountCode>): Promise<DiscountCode> {
    if (useMockApi) {
      return adminMockApi.discountCodes.update(id, data);
    }
    try {
      const response = await api.put<DiscountCode>(`/discount-codes/${id}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating discount code:', error);
      throw error;
    }
  },

  async deleteDiscountCode(id: number): Promise<void> {
    if (useMockApi) {
      return adminMockApi.discountCodes.delete(id);
    }
    try {
      await api.delete(`/discount-codes/${id}`);
    } catch (error) {
      console.error('Error deleting discount code:', error);
      throw error;
    }
  },
};

export const userAdminService = {
  async getAll(): Promise<UserAccount[]> {
    const response = await api.get('/users');
    const users = response.data as Array<{ id: number; email: string; name: string; role: 'customer' | 'admin'; isActive: boolean; createdAt: string; lastLoginAt?: string; totalOrders: number; totalSpent: number }>;
    return users.map(u => {
      const parts = (u.name || '').trim().split(' ');
      const firstName = parts.shift() || '';
      const lastName = parts.join(' ').trim();
      return {
        id: u.id,
        email: u.email,
        firstName,
        lastName,
        role: u.role,
        registeredDate: u.createdAt,
        totalOrders: u.totalOrders || 0,
        totalSpent: u.totalSpent || 0,
        isActive: !!u.isActive,
        lastLoginDate: u.lastLoginAt || undefined,
      } as UserAccount;
    });
  },

  async changeRole(id: number, role: 'customer' | 'admin'): Promise<UserAccount> {
    const response = await api.put(`/users/${id}`, { role });
    const u = response.data as { id: number; email: string; name: string; role: 'customer' | 'admin'; isActive: boolean; createdAt: string; lastLoginAt?: string; totalOrders?: number; totalSpent?: number };
    const parts = (u.name || '').trim().split(' ');
    const firstName = parts.shift() || '';
    const lastName = parts.join(' ').trim();
    return {
      id: u.id,
      email: u.email,
      firstName,
      lastName,
      role: u.role,
      registeredDate: u.createdAt,
      totalOrders: u.totalOrders || 0,
      totalSpent: u.totalSpent || 0,
      isActive: !!u.isActive,
      lastLoginDate: u.lastLoginAt || undefined,
    } as UserAccount;
  },

  async toggleActive(id: number, isActive: boolean): Promise<UserAccount> {
    const response = await api.put(`/users/${id}`, { isActive: !isActive });
    const u = response.data as { id: number; email: string; name: string; role: 'customer' | 'admin'; isActive: boolean; createdAt: string; lastLoginAt?: string; totalOrders?: number; totalSpent?: number };
    const parts = (u.name || '').trim().split(' ');
    const firstName = parts.shift() || '';
    const lastName = parts.join(' ').trim();
    return {
      id: u.id,
      email: u.email,
      firstName,
      lastName,
      role: u.role,
      registeredDate: u.createdAt,
      totalOrders: u.totalOrders || 0,
      totalSpent: u.totalSpent || 0,
      isActive: !!u.isActive,
      lastLoginDate: u.lastLoginAt || undefined,
    } as UserAccount;
  },
};
