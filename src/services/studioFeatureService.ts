import api from './api';
import { User } from '../types';

export type PaymentVendor = 'stripe';
export type LabVendor = 'roes' | 'whcc' | 'mpix';

export interface StudioFeatureSettings {
  paymentVendors: PaymentVendor[];
  labVendors: LabVendor[];
}

const STORAGE_KEY = 'photolab_studio_feature_settings';

const defaultSettings: StudioFeatureSettings = {
  paymentVendors: ['stripe'],
  labVendors: ['roes', 'whcc', 'mpix'],
};

const readSettings = (): StudioFeatureSettings | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StudioFeatureSettings>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      paymentVendors:
        Array.isArray(parsed.paymentVendors) && parsed.paymentVendors.length > 0
          ? (parsed.paymentVendors as PaymentVendor[])
          : [...defaultSettings.paymentVendors],
      labVendors:
        Array.isArray(parsed.labVendors) && parsed.labVendors.length > 0
          ? (parsed.labVendors as LabVendor[])
          : [...defaultSettings.labVendors],
    };
  } catch {
    return null;
  }
};

const writeSettings = (settings: StudioFeatureSettings) => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      paymentVendors: [...settings.paymentVendors],
      labVendors: [...settings.labVendors],
    })
  );
};

export const studioFeatureService = {
  getDefaultSettings(): StudioFeatureSettings {
    return {
      paymentVendors: [...defaultSettings.paymentVendors],
      labVendors: [...defaultSettings.labVendors],
    };
  },

  getCachedStudioSettings(): StudioFeatureSettings {
    const current = readSettings();
    if (!current) return this.getDefaultSettings();
    return {
      paymentVendors: [...current.paymentVendors],
      labVendors: [...current.labVendors],
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

      writeSettings(merged);
      return merged;
    } catch {
      return this.getCachedStudioSettings();
    }
  },

  async saveStudioSettings(studioId: number, settings: StudioFeatureSettings) {
    await api.put(`/studios/${studioId}/features`, settings);
    writeSettings(settings);
  },
};
