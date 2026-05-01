const STUDIO_TIMEZONE_KEY = 'studioTimezone';

export const getBrowserTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

export const getStudioTimezone = (): string => {
  if (typeof window === 'undefined') return 'UTC';
  const stored = String(localStorage.getItem(STUDIO_TIMEZONE_KEY) || '').trim();
  return stored || getBrowserTimezone();
};

export const setStudioTimezone = (timezone?: string | null) => {
  if (typeof window === 'undefined') return;
  const value = String(timezone || '').trim();
  if (value) {
    localStorage.setItem(STUDIO_TIMEZONE_KEY, value);
  }
};

const safeDate = (value: Date | string | number | null | undefined): Date | null => {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDateInStudioTimezone = (
  value: Date | string | number | null | undefined,
  timezone = getStudioTimezone(),
  locale?: string,
) => {
  const date = safeDate(value);
  if (!date) return '';
  try {
    return date.toLocaleDateString(locale, { timeZone: timezone });
  } catch {
    return date.toLocaleDateString(locale);
  }
};

export const formatDateTimeInStudioTimezone = (
  value: Date | string | number | null | undefined,
  timezone = getStudioTimezone(),
  locale?: string,
) => {
  const date = safeDate(value);
  if (!date) return '';
  try {
    return date.toLocaleString(locale, { timeZone: timezone });
  } catch {
    return date.toLocaleString(locale);
  }
};

const fallbackTimezones = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export const getAvailableTimezones = (): string[] => {
  try {
    const zones = (Intl as any)?.supportedValuesOf?.('timeZone');
    if (Array.isArray(zones) && zones.length) return zones;
  } catch {
    // ignore
  }
  return fallbackTimezones;
};
