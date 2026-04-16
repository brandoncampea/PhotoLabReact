import { AnalyticsData } from '../types';
import api from './api';

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
  trackAlbumView(albumId: number, albumName: string) {
    this.trackEvent('album_view', { albumId, albumName });
  },

  // Track photo view
  trackPhotoView(photoId: number, photoFileName: string, albumId: number, albumName: string) {
    this.trackEvent('photo_view', { photoId, photoFileName, albumId, albumName });
  },


  // Get analytics summary from backend
  async getSummary(timeRange?: string) {
    try {
      const response = await api.get('/analytics/summary' + (timeRange && timeRange !== 'all' ? `?range=${timeRange}` : ''));
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
      const response = await api.get('/analytics/details' + (timeRange && timeRange !== 'all' ? `?range=${timeRange}` : ''));
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
