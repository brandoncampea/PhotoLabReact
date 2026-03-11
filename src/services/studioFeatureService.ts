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

  getStudioSettings(studioId?: number): StudioFeatureSettings {
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

  saveStudioSettings(studioId: number, settings: StudioFeatureSettings) {
    const map = readMap();
    map[studioId] = {
      paymentVendors: [...settings.paymentVendors],
      labVendors: [...settings.labVendors],
    };
    writeMap(map);
  },

  isPaymentVendorAvailable(user: User | null, vendor: PaymentVendor): boolean {
    if (!user || user.role !== 'studio_admin') return true;
    const settings = this.getStudioSettings(user.studioId);
    return settings.paymentVendors.includes(vendor);
  },

  isLabVendorAvailable(user: User | null, vendor: LabVendor): boolean {
    if (!user || user.role !== 'studio_admin') return true;
    const settings = this.getStudioSettings(user.studioId);
    return settings.labVendors.includes(vendor);
  },
};
