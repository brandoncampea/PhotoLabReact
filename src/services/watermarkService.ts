import axios from 'axios';
import api from './api';
import { Watermark } from '../types';

const API_URL = import.meta.env.VITE_API_URL || '/api';

// Module-level cache: keyed by studioId, TTL 5 minutes
const _watermarkCache: Map<number, { watermark: Watermark | null; fetchedAt: number }> = new Map();
const WATERMARK_CACHE_TTL_MS = 5 * 60 * 1000;
const _watermarkInFlight: Map<number, Promise<Watermark | null>> = new Map();

export const watermarkService = {
  async getDefaultWatermark(studioId: number): Promise<Watermark | null> {
    try {
      if (!studioId) throw new Error('studioId is required');

      // Return cached value if still fresh
      const cached = _watermarkCache.get(studioId);
      if (cached && Date.now() - cached.fetchedAt < WATERMARK_CACHE_TTL_MS) {
        return cached.watermark;
      }

      // Deduplicate concurrent calls for the same studioId
      if (_watermarkInFlight.has(studioId)) {
        return _watermarkInFlight.get(studioId)!;
      }

      const request = axios.get(`${API_URL}/watermarks/public-default?studioId=${studioId}`)
        .then(response => {
          const watermark = response.data || null;
          _watermarkCache.set(studioId, { watermark, fetchedAt: Date.now() });
          _watermarkInFlight.delete(studioId);
          return watermark as Watermark | null;
        })
        .catch(() => {
          _watermarkInFlight.delete(studioId);
          _watermarkCache.set(studioId, { watermark: null, fetchedAt: Date.now() });
          return null;
        });

      _watermarkInFlight.set(studioId, request);
      return request;
    } catch (error) {
      // No default watermark configured
      return null;
    }
  },

    async getWatermark(albumId: number): Promise<Watermark | null> {
      try {
        const timestamp = Date.now();
        if (!albumId) throw new Error('albumId is required');
        const response = await axios.get(`${API_URL}/watermarks/public?albumId=${albumId}&t=${timestamp}`);
        const watermark = response.data;
        if (watermark && watermark.imageUrl) {
          watermark.imageUrl = `${watermark.imageUrl}?t=${timestamp}`;
        }
        return watermark;
      } catch (error) {
        return null;
      }
  },

  async getAll(): Promise<Watermark[]> {
    const response = await api.get<Watermark[]>('/watermarks');
    return response.data;
  },

  async getById(id: number): Promise<Watermark> {
    const response = await api.get<Watermark>(`/watermarks/${id}`);
    return response.data;
  },

  async create(watermark: Omit<Watermark, 'id' | 'createdDate'>, file?: File): Promise<Watermark> {
    
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
        baseURL: process.env.VITE_API_URL || '/api',
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
    // ...existing code...
    
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
        baseURL: process.env.VITE_API_URL || '/api',
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
    // ...existing code...
    await api.delete(`/watermarks/${id}`);
  },
};
