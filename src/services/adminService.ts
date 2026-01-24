import api from './api';
import { adminMockApi } from './adminMockApi';
import { ProfileConfig, Watermark, DiscountCode } from '../types';

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
