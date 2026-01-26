import axios from 'axios';
import api from './api';
import { Watermark } from '../types';
import { adminMockApi } from './adminMockApi';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API === 'true';

export const watermarkService = {
  async getDefaultWatermark(): Promise<Watermark | null> {
    if (USE_MOCK_API) {
      const watermarks = await adminMockApi.watermarks.getAll();
      return watermarks.find(w => w.isDefault) || null;
    } else {
        try {
          const timestamp = Date.now();
          const response = await axios.get(`${API_URL}/watermarks/default?t=${timestamp}`);
          const watermark = response.data;
          // Add timestamp to image URL to bust browser cache
          if (watermark && watermark.imageUrl) {
            watermark.imageUrl = `${watermark.imageUrl}?t=${timestamp}`;
          }
          return watermark;
        } catch (error) {
          // No default watermark configured
          return null;
        }
    }
  },

  async getAll(): Promise<Watermark[]> {
    if (USE_MOCK_API) {
      return adminMockApi.watermarks.getAll();
    }
    const response = await api.get<Watermark[]>('/watermarks');
    return response.data;
  },

  async getById(id: number): Promise<Watermark> {
    if (USE_MOCK_API) {
      const watermarks = await adminMockApi.watermarks.getAll();
      const watermark = watermarks.find(w => w.id === id);
      if (!watermark) throw new Error('Watermark not found');
      return watermark;
    }
    const response = await api.get<Watermark>(`/watermarks/${id}`);
    return response.data;
  },

  async create(watermark: Omit<Watermark, 'id' | 'createdDate'>, file?: File): Promise<Watermark> {
    if (USE_MOCK_API) {
      return adminMockApi.watermarks.create(watermark);
    }
    
    if (file) {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('name', watermark.name);
      formData.append('position', watermark.position);
      formData.append('opacity', watermark.opacity.toString());
      formData.append('isDefault', watermark.isDefault.toString());
      formData.append('tiled', watermark.tiled.toString());
      
      // Create a new axios instance for this request without transformRequest
      const instance = axios.create({
        baseURL: import.meta.env.VITE_API_URL || '/api',
        timeout: 30000,
      });
      
      // Add auth token
      const token = localStorage.getItem('authToken');
      if (token) {
        instance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await instance.post<Watermark>('/watermarks', formData);
      return response.data;
    }
    
    const response = await api.post<Watermark>('/watermarks', watermark);
    return response.data;
  },

  async update(id: number, watermark: Partial<Watermark>, file?: File): Promise<Watermark> {
    if (USE_MOCK_API) {
      return adminMockApi.watermarks.update(id, watermark);
    }
    
    if (file) {
      const formData = new FormData();
      formData.append('image', file);
      if (watermark.name) formData.append('name', watermark.name);
      if (watermark.position) formData.append('position', watermark.position);
      if (watermark.opacity !== undefined) formData.append('opacity', watermark.opacity.toString());
      if (watermark.isDefault !== undefined) formData.append('isDefault', watermark.isDefault.toString());
      if (watermark.tiled !== undefined) formData.append('tiled', watermark.tiled.toString());
      
      // Create a new axios instance for this request without transformRequest
      const instance = axios.create({
        baseURL: import.meta.env.VITE_API_URL || '/api',
        timeout: 30000,
      });
      
      // Add auth token
      const token = localStorage.getItem('authToken');
      if (token) {
        instance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await instance.put<Watermark>(`/watermarks/${id}`, formData);
      return response.data;
    }
    
    const response = await api.put<Watermark>(`/watermarks/${id}`, watermark);
    return response.data;
  },

  async delete(id: number): Promise<void> {
    if (USE_MOCK_API) {
      await adminMockApi.watermarks.delete(id);
      return;
    }
    await api.delete(`/watermarks/${id}`);
  },
};
