import api from './api';
import { User } from '../types';

export type PaymentVendor = 'stripe';
export type LabVendor = 'roes' | 'whcc' | 'mpix';

export interface StudioFeatureSettings {
  paymentVendors: PaymentVendor[];
  labVendors: LabVendor[];
}

type StudioFeatureMap = Record<number, StudioFeatureSettings>;

const STORAGE_KEY = 'photolab_studio_feature_settings';

const defaultSettings: StudioFeatureSettings = {
  paymentVendors: ['stripe'],
  labVendors: ['roes', 'whcc', 'mpix'],
};

const readMap = (): StudioFeatureMap => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StudioFeatureMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeMap = (map: StudioFeatureMap) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
};

export const studioFeatureService = {
  getDefaultSettings(): StudioFeatureSettings {
    return {
      paymentVendors: [...defaultSettings.paymentVendors],
      labVendors: [...defaultSettings.labVendors],
    };
  },

  getCachedStudioSettings(studioId?: number): StudioFeatureSettings {
    if (!studioId) return this.getDefaultSettings();
    const map = readMap();
    const current = map[studioId];
    if (!current) return this.getDefaultSettings();

    return {
      paymentVendors:
        current.paymentVendors?.length > 0
          ? [...current.paymentVendors]
          : [...defaultSettings.paymentVendors],
      labVendors:
        current.labVendors?.length > 0
          ? [...current.labVendors]
          : [...defaultSettings.labVendors],
    };
  },

  getEffectiveStudioId(user: User | null): number | undefined {
    const viewAsStudioId = Number(localStorage.getItem('viewAsStudioId'));
    if (Number.isInteger(viewAsStudioId) && viewAsStudioId > 0) {
      return viewAsStudioId;
    }
    return user?.studioId;
  },

  async getStudioSettings(studioId?: number): Promise<StudioFeatureSettings> {
    if (!studioId) return this.getDefaultSettings();
    try {
      const response = await api.get<Partial<StudioFeatureSettings>>(`/studios/${studioId}/features`);
      const merged: StudioFeatureSettings = {
        paymentVendors:
          response.data.paymentVendors && response.data.paymentVendors.length > 0
            ? (response.data.paymentVendors as PaymentVendor[])
            : [...defaultSettings.paymentVendors],
        labVendors:
          response.data.labVendors && response.data.labVendors.length > 0
            ? (response.data.labVendors as LabVendor[])
            : [...defaultSettings.labVendors],
      };

      const map = readMap();
      map[studioId] = merged;
      writeMap(map);
      return merged;
    } catch {
      return this.getCachedStudioSettings(studioId);
    }
  },

  async saveStudioSettings(studioId: number, settings: StudioFeatureSettings) {
    await api.put(`/studios/${studioId}/features`, settings);
    const map = readMap();
    map[studioId] = {
      paymentVendors: [...settings.paymentVendors],
      labVendors: [...settings.labVendors],
    };
    writeMap(map);
  },
};
