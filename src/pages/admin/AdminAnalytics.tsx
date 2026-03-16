import React, { useState, useEffect } from 'react';
import { AnalyticsData } from '../../types';
import { analyticsService } from '../../services/analyticsService';
import AdminLayout from '../../components/AdminLayout';

const AdminAnalytics: React.FC = () => {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAllAlbums, setShowAllAlbums] = useState(false);
  const [showAllPhotos, setShowAllPhotos] = useState(false);

  useEffect(() => {
    loadAnalytics();
    // Refresh every 10 seconds
    const interval = setInterval(loadAnalytics, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadAnalytics = () => {
    try {
      analyticsService.getAnalytics().then(data => {
      setAnalytics(data);
        setLoading(false);
      }).catch(error => {
        console.error('Failed to load analytics:', error);
        setLoading(false);
      });
    } catch (error) {
      console.error('Failed to load analytics:', error);
      setLoading(false);
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'visit': return '🌐';
      case 'page_view': return '📄';
      case 'album_view': return '📁';
      case 'photo_view': return '🖼️';
      default: return '📊';
    }
  };

  const getActivityDescription = (activity: any) => {
    switch (activity.type) {
      case 'visit':
        return 'Site visit';
      case 'page_view':
        return `Viewed page: ${activity.path || 'Unknown route'}`;
      case 'album_view':
        return `Viewed album: ${activity.albumName}`;
      case 'photo_view':
        return `Viewed photo: ${activity.photoFileName} in ${activity.albumName}`;
      default:
        return 'Unknown activity';
    }
  };

  if (loading) {
    return <div className="loading">Loading analytics...</div>;
  }

  if (!analytics) {
    return <div className="error">Failed to load analytics data</div>;
  }

  const sortedAlbumViews = [...analytics.albumViews].sort((a, b) => b.views - a.views);
  const sortedPhotoViews = [...analytics.photoViews].sort((a, b) => b.views - a.views);
  const topAlbums = showAllAlbums ? sortedAlbumViews : sortedAlbumViews.slice(0, 5);
  const topPhotos = showAllPhotos ? sortedPhotoViews : sortedPhotoViews.slice(0, 5);

  const formatNumber = (value: number) => value.toLocaleString();

  const renderThumbnail = (src: string | undefined, alt: string, fallback: string) => (
    <div className="analytics-thumb">
      {src ? <img src={src} alt={alt} /> : <span>{fallback}</span>}
    </div>
  );

  return (
    <AdminLayout>
      <div className="page-header">
        <h1>📊 Analytics</h1>
        <p className="muted-text" style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
          Track visitor behavior and popular content
        </p>
      </div>

      {/* Overview Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="analytics-stat-card analytics-stat-card-blue">
          <div className="analytics-stat-value">
            {formatNumber(analytics.totalVisitors)}
          </div>
          <div className="analytics-stat-label">
            Total Visitors
          </div>
        </div>

        <div className="analytics-stat-card analytics-stat-card-purple">
          <div className="analytics-stat-value">
            {formatNumber(analytics.totalPageViews)}
          </div>
          <div className="analytics-stat-label">
            Total Page Views
          </div>
        </div>

        <div className="analytics-stat-card analytics-stat-card-green">
          <div className="analytics-stat-value">
            {formatNumber(analytics.albumViews.reduce((sum, a) => sum + a.views, 0))}
          </div>
          <div className="analytics-stat-label">
            Album Views
          </div>
        </div>

        <div className="analytics-stat-card analytics-stat-card-orange">
          <div className="analytics-stat-value">
            {formatNumber(analytics.photoViews.reduce((sum, p) => sum + p.views, 0))}
          </div>
          <div className="analytics-stat-label">
            Photo Views
          </div>
        </div>
      </div>

      <div className="analytics-two-col">
        {/* Top Albums */}
        <div>
          <div className="analytics-section-header">
            <h2 style={{ fontSize: '1.3rem', marginBottom: '1rem' }}>📁 Top Albums</h2>
            {sortedAlbumViews.length > 5 && (
              <button className="btn btn-secondary" onClick={() => setShowAllAlbums((value) => !value)}>
                {showAllAlbums ? 'Show Top 5' : `View All (${sortedAlbumViews.length})`}
              </button>
            )}
          </div>
          {analytics.albumViews.length === 0 ? (
            <p className="muted-text" style={{ fontStyle: 'italic' }}>No album views yet</p>
          ) : (
            <div className="analytics-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Album</th>
                    <th>Cover</th>
                    <th style={{ textAlign: 'center' }}>Views</th>
                    <th>Last Viewed</th>
                  </tr>
                </thead>
                <tbody>
                  {topAlbums.map((album) => (
                    <tr key={album.albumId}>
                      <td>
                        <strong>{album.albumName}</strong>
                      </td>
                      <td>
                        {renderThumbnail(album.coverImageUrl, `${album.albumName} cover`, '📁')}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="analytics-view-badge" style={{ backgroundColor: 'var(--primary-color)' }}>
                          {formatNumber(album.views)}
                        </span>
                      </td>
                      <td className="muted-text" style={{ fontSize: '0.85rem' }}>
                        {formatDateTime(album.lastViewed)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top Photos */}
        <div>
          <div className="analytics-section-header">
            <h2 style={{ fontSize: '1.3rem', marginBottom: '1rem' }}>🖼️ Top Photos</h2>
            {sortedPhotoViews.length > 5 && (
              <button className="btn btn-secondary" onClick={() => setShowAllPhotos((value) => !value)}>
                {showAllPhotos ? 'Show Top 5' : `View All (${sortedPhotoViews.length})`}
              </button>
            )}
          </div>
          {analytics.photoViews.length === 0 ? (
            <p className="muted-text" style={{ fontStyle: 'italic' }}>No photo views yet</p>
          ) : (
            <div className="analytics-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Photo</th>
                    <th>Preview</th>
                    <th style={{ textAlign: 'center' }}>Views</th>
                    <th>Last Viewed</th>
                  </tr>
                </thead>
                <tbody>
                  {topPhotos.map((photo) => (
                    <tr key={photo.photoId}>
                      <td>
                        <div>
                          <strong>{photo.photoFileName}</strong>
                          <div className="muted-text" style={{ fontSize: '0.8rem' }}>
                            in {photo.albumName}
                          </div>
                        </div>
                      </td>
                      <td>
                        {renderThumbnail(photo.thumbnailUrl || photo.fullImageUrl, photo.photoFileName, '🖼️')}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="analytics-view-badge" style={{ backgroundColor: '#16a34a' }}>
                          {formatNumber(photo.views)}
                        </span>
                      </td>
                      <td className="muted-text" style={{ fontSize: '0.85rem' }}>
                        {formatDateTime(photo.lastViewed)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.3rem', marginBottom: '1rem' }}>🕐 Recent Activity</h2>
        {analytics.recentActivity.length === 0 ? (
          <p className="muted-text" style={{ fontStyle: 'italic' }}>No recent activity</p>
        ) : (
          <div className="analytics-activity-feed">
            {analytics.recentActivity.map((activity) => (
              <div 
                key={activity.id}
                className="analytics-activity-item"
              >
                <span style={{ fontSize: '1.5rem', marginRight: '1rem' }}>
                  {getActivityIcon(activity.type)}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>
                    {getActivityDescription(activity)}
                  </div>
                  <div className="muted-text" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    {formatDateTime(activity.timestamp)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </AdminLayout>
  );
};

export default AdminAnalytics;
