import axios from 'axios';
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
          const response = await axios.get(`${API_URL}/watermarks/default`);
          return response.data;
        } catch (error) {
          // No default watermark configured
          return null;
        }
    }
  },
};
