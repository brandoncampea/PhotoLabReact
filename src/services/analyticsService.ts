import { AnalyticsData } from '../types';
import api from './api';
import { getStudioTimezone } from '../utils/studioDateTime';

// Returns the UTC offset in ms for a given timezone at a given instant
function getTzOffsetMs(tz: string, date: Date): number {
  const utcMs = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  const tzMs = new Date(date.toLocaleString('en-US', { timeZone: tz })).getTime();
  return utcMs - tzMs;
}

// Returns the UTC Date representing midnight of a given YYYY-MM-DD date string in the given timezone
function midnightInTzToUtc(dateStr: string, tz: string): Date {
  const approx = new Date(dateStr + 'T12:00:00Z');
  const offsetMs = getTzOffsetMs(tz, approx);
  return new Date(new Date(dateStr + 'T00:00:00Z').getTime() + offsetMs);
}

// Returns { startDate, endDate? } as UTC ISO strings for the given range in the studio's timezone
export function getAnalyticsRangeParams(range: string): { startDate?: string; endDate?: string } {
  if (!range || range === 'all') return {};
  const tz = getStudioTimezone();
  const now = new Date();
  const todayStr = now.toLocaleDateString('sv', { timeZone: tz }); // "YYYY-MM-DD"

  if (range === 'today') {
    const start = midnightInTzToUtc(todayStr, tz);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }

  if (range === 'week') {
    const d = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    const dayStr = d.toLocaleDateString('sv', { timeZone: tz });
    return { startDate: midnightInTzToUtc(dayStr, tz).toISOString() };
  }

  if (range === 'month') {
    const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dayStr = d.toLocaleDateString('sv', { timeZone: tz });
    return { startDate: midnightInTzToUtc(dayStr, tz).toISOString() };
  }

  return {};
}

const VISITOR_SESSION_KEY = 'photolab_analytics_visitor_session_id';

const getSessionId = () => {
  let sessionId = sessionStorage.getItem(VISITOR_SESSION_KEY);
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(VISITOR_SESSION_KEY, sessionId);
  }
  return sessionId;
};

export const analyticsService = {
  // Track event on backend
  async trackEvent(eventType: string, eventData?: any) {
    try {
      await api.post('/analytics/track', { eventType, eventData });
    } catch (error) {
      console.warn('Failed to track event:', error);
    }
  },

  // Track unique site visit once per browser session
  trackVisit() {
    const alreadyTracked = sessionStorage.getItem(`${VISITOR_SESSION_KEY}_tracked`);
    if (!alreadyTracked) {
      this.trackEvent('site_visit', {
        sessionId: getSessionId(),
        userAgent: navigator.userAgent,
      });
      sessionStorage.setItem(`${VISITOR_SESSION_KEY}_tracked`, 'true');
    }
  },

  trackPageView(path: string) {
    this.trackEvent('page_view', {
      sessionId: getSessionId(),
      path,
      userAgent: navigator.userAgent,
    });
  },

  // Track album view
  trackAlbumView(albumId: number, albumName: string, studioId?: number) {
    this.trackEvent('album_view', {
      albumId,
      albumName,
      studioId: studioId || undefined,
    });
  },

  // Track photo view
  trackPhotoView(photoId: number, photoFileName: string, albumId: number, albumName: string, studioId?: number) {
    this.trackEvent('photo_view', {
      photoId,
      photoFileName,
      albumId,
      albumName,
      studioId: studioId || undefined,
    });
  },

  // Track click on album card from the albums grid
  trackAlbumCardClick(albumId: number, albumName: string, studioId?: number) {
    this.trackEvent('album_card_click', {
      albumId,
      albumName,
      studioId: studioId || undefined,
      path: window.location.pathname + window.location.search,
    });
  },

  // Track click on a photo thumbnail within album details
  trackPhotoThumbnailClick(photoId: number, photoFileName: string, albumId: number, albumName: string, studioId?: number) {
    this.trackEvent('photo_thumbnail_click', {
      photoId,
      photoFileName,
      albumId,
      albumName,
      studioId: studioId || undefined,
      path: window.location.pathname + window.location.search,
    });
  },


  // Get analytics summary from backend
  async getSummary(timeRange?: string) {
    try {
      const rangeParams = getAnalyticsRangeParams(timeRange || 'all');
      const params = new URLSearchParams();
      if (timeRange && timeRange !== 'all') params.set('range', timeRange);
      if (rangeParams.startDate) params.set('startDate', rangeParams.startDate);
      if (rangeParams.endDate) params.set('endDate', rangeParams.endDate);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const response = await api.get('/analytics/summary' + qs);
      return response.data;
    } catch (error) {
      console.warn('Failed to load analytics summary:', error);
      return {
        totalVisits: 0,
        albumViews: 0,
        photoViews: 0,
        totalPageViews: 0,
      };
    }
  },


  // Get full analytics details (per-album/per-photo) from backend
  async getDetails(timeRange?: string) {
    try {
      const rangeParams = getAnalyticsRangeParams(timeRange || 'all');
      const params = new URLSearchParams();
      if (timeRange && timeRange !== 'all') params.set('range', timeRange);
      if (rangeParams.startDate) params.set('startDate', rangeParams.startDate);
      if (rangeParams.endDate) params.set('endDate', rangeParams.endDate);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const response = await api.get('/analytics/details' + qs);
      return response.data;
    } catch (error) {
      console.warn('Failed to load analytics details:', error);
      return { albumViews: [], photoViews: [], recentActivity: [] };
    }
  },

  async getRevenueBreakdown() {
    try {
      const response = await api.get('/analytics/revenue-breakdown');
      return response.data;
    } catch (error) {
      console.warn('Failed to load revenue breakdown:', error);
      if ((error as any)?.response?.status === 403) {
        throw error;
      }
      return {
        summary: { totalRevenue: 0, totalCost: 0, totalProfit: 0, totalItems: 0, totalOrders: 0 },
        byCategory: [],
        byAlbum: [],
        byProduct: [],
        bySize: [],
        byPhoto: [],
      };
    }
  },


  // Get all analytics data
  async getAnalytics(timeRange?: string): Promise<AnalyticsData> {
    const [summary, details] = await Promise.all([
      this.getSummary(timeRange),
      this.getDetails(timeRange),
    ]);

    return {
      totalVisitors: summary.totalVisits || 0,
      totalPageViews: summary.totalPageViews || 0,
      albumViews: details.albumViews || [],
      photoViews: details.photoViews || [],
      recentActivity: details.recentActivity || [],
    };
  },

};
