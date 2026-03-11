import { AnalyticsData, ActivityLog } from '../types';
import api from './api';

// In-memory storage for demo purposes
let totalVisitors = 0;
let totalPageViews = 0;
let albumViewsMap = new Map<number, { albumName: string; views: number; lastViewed: string }>();
let photoViewsMap = new Map<number, { photoFileName: string; albumId: number; albumName: string; views: number; lastViewed: string }>();
let activityLog: ActivityLog[] = [];
let activityIdCounter = 1;

const MAX_ACTIVITY_LOGS = 100;

export const analyticsService = {
  // Track event on backend
  async trackEvent(eventType: string, eventData?: any) {
    try {
      await api.post('/analytics/track', { eventType, eventData });
    } catch (error) {
      console.warn('Failed to track event:', error);
    }
  },

  // Track site visit
  trackVisit() {
    totalVisitors++;
    totalPageViews++;
    this.trackEvent('site_visit');
    
    const activity: ActivityLog = {
      id: activityIdCounter++,
      type: 'visit',
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
    };
    
    activityLog.unshift(activity);
    if (activityLog.length > MAX_ACTIVITY_LOGS) {
      activityLog = activityLog.slice(0, MAX_ACTIVITY_LOGS);
    }
    
    console.log('📊 Analytics: Site visit tracked');
  },

  // Track album view
  trackAlbumView(albumId: number, albumName: string) {
    totalPageViews++;
    this.trackEvent('album_view', { albumId, albumName });
    
    const existing = albumViewsMap.get(albumId);
    if (existing) {
      albumViewsMap.set(albumId, {
        ...existing,
        views: existing.views + 1,
        lastViewed: new Date().toISOString(),
      });
    } else {
      albumViewsMap.set(albumId, {
        albumName,
        views: 1,
        lastViewed: new Date().toISOString(),
      });
    }
    
    const activity: ActivityLog = {
      id: activityIdCounter++,
      type: 'album_view',
      timestamp: new Date().toISOString(),
      albumId,
      albumName,
    };
    
    activityLog.unshift(activity);
    if (activityLog.length > MAX_ACTIVITY_LOGS) {
      activityLog = activityLog.slice(0, MAX_ACTIVITY_LOGS);
    }
    
    console.log(`📊 Analytics: Album view tracked - ${albumName}`);
  },

  // Track photo view
  trackPhotoView(photoId: number, photoFileName: string, albumId: number, albumName: string) {
    totalPageViews++;
    this.trackEvent('photo_view', { photoId, photoFileName, albumId, albumName });
    
    const existing = photoViewsMap.get(photoId);
    if (existing) {
      photoViewsMap.set(photoId, {
        ...existing,
        views: existing.views + 1,
        lastViewed: new Date().toISOString(),
      });
    } else {
      photoViewsMap.set(photoId, {
        photoFileName,
        albumId,
        albumName,
        views: 1,
        lastViewed: new Date().toISOString(),
      });
    }
    
    const activity: ActivityLog = {
      id: activityIdCounter++,
      type: 'photo_view',
      timestamp: new Date().toISOString(),
      photoId,
      photoFileName,
      albumId,
      albumName,
    };
    
    activityLog.unshift(activity);
    if (activityLog.length > MAX_ACTIVITY_LOGS) {
      activityLog = activityLog.slice(0, MAX_ACTIVITY_LOGS);
    }
    
    console.log(`📊 Analytics: Photo view tracked - ${photoFileName}`);
  },

  // Get analytics summary from backend
  async getSummary() {
    try {
      const response = await api.get('/analytics/summary');
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
  async getDetails() {
    try {
      const response = await api.get('/analytics/details');
      return response.data;
    } catch (error) {
      console.warn('Failed to load analytics details:', error);
      return { albumViews: [], photoViews: [], recentActivity: [] };
    }
  },

  // Get all analytics data
  async getAnalytics(): Promise<AnalyticsData> {
    const [summary, details] = await Promise.all([
      this.getSummary(),
      this.getDetails(),
    ]);

    return {
      totalVisitors: summary.totalVisits || 0,
      totalPageViews: summary.totalPageViews || 0,
      albumViews: details.albumViews || [],
      photoViews: details.photoViews || [],
      recentActivity: details.recentActivity || [],
    };
  },

  // Reset analytics (for testing)
  reset() {
    totalVisitors = 0;
    totalPageViews = 0;
    albumViewsMap.clear();
    photoViewsMap.clear();
    activityLog = [];
    activityIdCounter = 1;
    console.log('📊 Analytics: Reset');
  },
};
