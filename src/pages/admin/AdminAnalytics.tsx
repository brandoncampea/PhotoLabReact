import React, { useState, useEffect } from 'react';
import { AnalyticsData } from '../../types';
import { analyticsService } from '../../services/analyticsService';

const AdminAnalytics: React.FC = () => {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
    // Refresh every 10 seconds
    const interval = setInterval(loadAnalytics, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadAnalytics = () => {
    try {
      const data = analyticsService.getAnalytics();
      setAnalytics(data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
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
      case 'album_view': return '📁';
      case 'photo_view': return '🖼️';
      default: return '📊';
    }
  };

  const getActivityDescription = (activity: any) => {
    switch (activity.type) {
      case 'visit':
        return 'Site visit';
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

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>📊 Analytics</h1>
        <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.5rem' }}>
          Track visitor behavior and popular content
        </p>
      </div>

      {/* Overview Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div style={{
          padding: '1.5rem',
          backgroundColor: '#e3f2fd',
          borderRadius: '8px',
          border: '2px solid #4169E1'
        }}>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#4169E1' }}>
            {analytics.totalVisitors}
          </div>
          <div style={{ fontSize: '1rem', color: '#666', marginTop: '0.5rem' }}>
            Total Visitors
          </div>
        </div>

        <div style={{
          padding: '1.5rem',
          backgroundColor: '#f3e5f5',
          borderRadius: '8px',
          border: '2px solid #9c27b0'
        }}>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#9c27b0' }}>
            {analytics.totalPageViews}
          </div>
          <div style={{ fontSize: '1rem', color: '#666', marginTop: '0.5rem' }}>
            Total Page Views
          </div>
        </div>

        <div style={{
          padding: '1.5rem',
          backgroundColor: '#e8f5e9',
          borderRadius: '8px',
          border: '2px solid #4caf50'
        }}>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#4caf50' }}>
            {analytics.albumViews.length}
          </div>
          <div style={{ fontSize: '1rem', color: '#666', marginTop: '0.5rem' }}>
            Albums Viewed
          </div>
        </div>

        <div style={{
          padding: '1.5rem',
          backgroundColor: '#fff3e0',
          borderRadius: '8px',
          border: '2px solid #ff9800'
        }}>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#ff9800' }}>
            {analytics.photoViews.length}
          </div>
          <div style={{ fontSize: '1rem', color: '#666', marginTop: '0.5rem' }}>
            Photos Viewed
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        {/* Top Albums */}
        <div>
          <h2 style={{ fontSize: '1.3rem', marginBottom: '1rem' }}>📁 Top Albums</h2>
          {analytics.albumViews.length === 0 ? (
            <p style={{ color: '#999', fontStyle: 'italic' }}>No album views yet</p>
          ) : (
            <div style={{ backgroundColor: '#f8f9fa', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#e9ecef', borderBottom: '2px solid #dee2e6' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Album</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>Views</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Last Viewed</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.albumViews.slice(0, 10).map((album) => (
                    <tr key={album.albumId} style={{ borderBottom: '1px solid #dee2e6' }}>
                      <td style={{ padding: '0.75rem' }}>
                        <strong>{album.albumName}</strong>
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        <span style={{
                          padding: '0.25rem 0.75rem',
                          backgroundColor: '#4169E1',
                          color: 'white',
                          borderRadius: '12px',
                          fontSize: '0.9rem',
                          fontWeight: 'bold'
                        }}>
                          {album.views}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', fontSize: '0.85rem', color: '#666' }}>
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
          <h2 style={{ fontSize: '1.3rem', marginBottom: '1rem' }}>🖼️ Top Photos</h2>
          {analytics.photoViews.length === 0 ? (
            <p style={{ color: '#999', fontStyle: 'italic' }}>No photo views yet</p>
          ) : (
            <div style={{ backgroundColor: '#f8f9fa', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#e9ecef', borderBottom: '2px solid #dee2e6' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Photo</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>Views</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Last Viewed</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.photoViews.slice(0, 10).map((photo) => (
                    <tr key={photo.photoId} style={{ borderBottom: '1px solid #dee2e6' }}>
                      <td style={{ padding: '0.75rem' }}>
                        <div>
                          <strong>{photo.photoFileName}</strong>
                          <div style={{ fontSize: '0.8rem', color: '#999' }}>
                            in {photo.albumName}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        <span style={{
                          padding: '0.25rem 0.75rem',
                          backgroundColor: '#4caf50',
                          color: 'white',
                          borderRadius: '12px',
                          fontSize: '0.9rem',
                          fontWeight: 'bold'
                        }}>
                          {photo.views}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', fontSize: '0.85rem', color: '#666' }}>
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
          <p style={{ color: '#999', fontStyle: 'italic' }}>No recent activity</p>
        ) : (
          <div style={{ backgroundColor: '#f8f9fa', borderRadius: '8px', padding: '1rem', maxHeight: '400px', overflowY: 'auto' }}>
            {analytics.recentActivity.map((activity) => (
              <div 
                key={activity.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0.75rem',
                  marginBottom: '0.5rem',
                  backgroundColor: 'white',
                  borderRadius: '6px',
                  border: '1px solid #dee2e6'
                }}
              >
                <span style={{ fontSize: '1.5rem', marginRight: '1rem' }}>
                  {getActivityIcon(activity.type)}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>
                    {getActivityDescription(activity)}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#999', marginTop: '0.25rem' }}>
                    {formatDateTime(activity.timestamp)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{
        marginTop: '2rem',
        padding: '1rem',
        backgroundColor: '#fff3cd',
        borderRadius: '8px',
        border: '1px solid #ffc107',
        fontSize: '0.9rem'
      }}>
        <strong>📝 Note:</strong> Analytics data is stored in browser memory and will reset when the page is refreshed. 
        In production, this data would be persisted to a database for long-term tracking.
      </div>
    </div>
  );
};

export default AdminAnalytics;
