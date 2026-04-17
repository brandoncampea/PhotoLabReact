
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardChart from '../../components/DashboardChart';
import AdminLayout from '../../components/AdminLayout';
import './AdminDashboard.css';

type DashboardStats = {
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
  pendingOrders: number;
  batchOrders: number;
  analytics?: {
    totalVisitors: number;
    totalPageViews: number;
    albumViews: Array<{ albumId: number; albumName: string; views: number }>;
    photoViews: Array<{ photoId: number; albumId: number; photoFileName: string; albumName: string; thumbnailUrl?: string | null; fullImageUrl?: string | null; views: number }>;
  };
  recentOrders?: Array<{
    id: number;
    total: number;
    status: string;
    created_at: string;
    customer_email?: string;
  }>;
  revenueSeries?: Record<'day' | 'week' | 'month', { data: number[]; labels: string[] }>;
  ordersSeries?: Record<'day' | 'week' | 'month', { data: number[]; labels: string[] }>;
  customersSeries?: Record<'day' | 'week' | 'month', { data: number[]; labels: string[] }>;
  pendingOrdersSeries?: Record<'day' | 'week' | 'month', { data: number[]; labels: string[] }>;
  batchOrdersSeries?: Record<'day' | 'week' | 'month', { data: number[]; labels: string[] }>;
};

const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [revenueRange, setRevenueRange] = useState<'day' | 'week' | 'month'>('month');
  const [ordersRange, setOrdersRange] = useState<'day' | 'week' | 'month'>('month');
  const [customersRange, setCustomersRange] = useState<'day' | 'week' | 'month'>('month');
  const [pendingRange, setPendingRange] = useState<'day' | 'week' | 'month'>('month');
  const [batchRange, setBatchRange] = useState<'day' | 'week' | 'month'>('month');
  const [analyticsRange, setAnalyticsRange] = useState<'today' | 'week' | 'month' | 'all'>('all');

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const statsResponse = await fetch(`/api/admin/dashboard-stats${analyticsRange && analyticsRange !== 'all' ? `?range=${analyticsRange}` : ''}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!statsResponse.ok) throw new Error('Failed to fetch dashboard stats');
        const data = await statsResponse.json();
        setStats(data);
      } catch (e) {
        setStats(null);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [analyticsRange]);

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  // Only show real data, no placeholders
  if (!stats) {
    return <div className="loading">No dashboard data available.</div>;
  }

  return (
    <AdminLayout>
      <div className="page-header">
        <h1 className="gradient-text">Admin Dashboard</h1>
        <p className="admin-dashboard-subtitle">
          Business overview, stats, and recent activity for your studio.
        </p>
      </div>

      <div className="dashboard-metrics tallydark-metrics admin-dashboard-metrics">
        <div className="dashboard-card tallydark-card admin-dashboard-card" role="region" tabIndex={0}>
          <div className="dashboard-card-label">Total Revenue</div>
          <div className="dashboard-card-value revenue">${stats.totalRevenue.toFixed(2)}</div>
          <div className="dashboard-card-sub">Avg: ${stats.totalOrders ? (stats.totalRevenue / stats.totalOrders).toFixed(2) : '0.00'} per order</div>
          <div className="dashboard-range-controls">
            <button className="dashboard-pill" onClick={() => setRevenueRange('day')} disabled={revenueRange === 'day'}>Day</button>
            <button className="dashboard-pill" onClick={() => setRevenueRange('week')} disabled={revenueRange === 'week'}>Week</button>
            <button className="dashboard-pill" onClick={() => setRevenueRange('month')} disabled={revenueRange === 'month'}>Month</button>
          </div>
          <DashboardChart
            data={stats.revenueSeries?.[revenueRange]?.data || []}
            labels={stats.revenueSeries?.[revenueRange]?.labels || []}
            label="Revenue"
          />
        </div>
        <div className="dashboard-card tallydark-card admin-dashboard-card" role="button" tabIndex={0}
          onClick={() => window.location.href = '/admin/orders'}
          onKeyDown={e => { if (e.key === 'Enter') window.location.href = '/admin/orders'; }}
        >
          <div className="dashboard-card-label">Total Orders</div>
          <div className="dashboard-card-value orders">{stats.totalOrders}</div>
          <div className="dashboard-card-sub">{stats.totalOrders ? (((stats.totalOrders - (stats.pendingOrders || 0)) / stats.totalOrders) * 100).toFixed(1) : '0'}% completion rate</div>
          <div className="dashboard-range-controls">
            <button className="dashboard-pill" onClick={() => setOrdersRange('day')} disabled={ordersRange === 'day'}>Day</button>
            <button className="dashboard-pill" onClick={() => setOrdersRange('week')} disabled={ordersRange === 'week'}>Week</button>
            <button className="dashboard-pill" onClick={() => setOrdersRange('month')} disabled={ordersRange === 'month'}>Month</button>
          </div>
          <DashboardChart
            data={stats.ordersSeries?.[ordersRange]?.data || []}
            labels={stats.ordersSeries?.[ordersRange]?.labels || []}
            label="Orders"
          />
        </div>
        <div className="dashboard-card tallydark-card admin-dashboard-card" role="button" tabIndex={0}
          onClick={() => window.location.href = '/admin/customers'}
          onKeyDown={e => { if (e.key === 'Enter') window.location.href = '/admin/customers'; }}
        >
          <div className="dashboard-card-label">Total Customers</div>
          <div className="dashboard-card-value customers">{stats.totalCustomers}</div>
          <div className="dashboard-card-sub">Active user accounts</div>
          <div className="dashboard-range-controls">
            <button className="dashboard-pill" onClick={() => setCustomersRange('day')} disabled={customersRange === 'day'}>Day</button>
            <button className="dashboard-pill" onClick={() => setCustomersRange('week')} disabled={customersRange === 'week'}>Week</button>
            <button className="dashboard-pill" onClick={() => setCustomersRange('month')} disabled={customersRange === 'month'}>Month</button>
          </div>
          <DashboardChart
            data={stats.customersSeries?.[customersRange]?.data || []}
            labels={stats.customersSeries?.[customersRange]?.labels || []}
            label="New Customers"
          />
        </div>
        <div className="dashboard-card tallydark-card admin-dashboard-card" role="button" tabIndex={0}
          onClick={() => window.location.href = '/admin/orders?status=pending'}
          onKeyDown={e => { if (e.key === 'Enter') window.location.href = '/admin/orders?status=pending'; }}
        >
          <div className="dashboard-card-label">Pending Orders</div>
          <div className="dashboard-card-value pending">{stats.pendingOrders}</div>
          <div className="dashboard-card-sub">Requires attention</div>
          <div className="dashboard-range-controls">
            <button className="dashboard-pill" onClick={() => setPendingRange('day')} disabled={pendingRange === 'day'}>Day</button>
            <button className="dashboard-pill" onClick={() => setPendingRange('week')} disabled={pendingRange === 'week'}>Week</button>
            <button className="dashboard-pill" onClick={() => setPendingRange('month')} disabled={pendingRange === 'month'}>Month</button>
          </div>
          <DashboardChart
            data={stats.pendingOrdersSeries?.[pendingRange]?.data || []}
            labels={stats.pendingOrdersSeries?.[pendingRange]?.labels || []}
            label="Pending Orders"
          />
        </div>

        <div className="dashboard-card tallydark-card admin-dashboard-card" role="button" tabIndex={0}
          onClick={() => window.location.href = '/admin/orders'}
          onKeyDown={e => { if (e.key === 'Enter') window.location.href = '/admin/orders'; }}
        >
          <div className="dashboard-card-label">Batch Orders</div>
          <div className="dashboard-card-value batch">{stats.batchOrders || 0}</div>
          <div className="dashboard-card-sub">Orders queued for batch fulfillment</div>
          <div className="dashboard-range-controls">
            <button className="dashboard-pill" onClick={() => setBatchRange('day')} disabled={batchRange === 'day'}>Day</button>
            <button className="dashboard-pill" onClick={() => setBatchRange('week')} disabled={batchRange === 'week'}>Week</button>
            <button className="dashboard-pill" onClick={() => setBatchRange('month')} disabled={batchRange === 'month'}>Month</button>
          </div>
          <DashboardChart
            data={stats.batchOrdersSeries?.[batchRange]?.data || []}
            labels={stats.batchOrdersSeries?.[batchRange]?.labels || []}
            label="Batch Orders"
          />
        </div>
      </div>

      <div className="dashboard-widget tallydark-card admin-dashboard-widget">
        <h2 className="admin-dashboard-section-title">Analytics</h2>

        {/* Analytics Time Range Controls */}
        <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontWeight: 500, marginRight: 8 }}>Time Range:</span>
          {[
            { label: 'Today', value: 'today' },
            { label: 'This Week', value: 'week' },
            { label: 'This Month', value: 'month' },
            { label: 'All Time', value: 'all' },
          ].map((range) => (
            <button
              key={range.value}
              className={
                'dashboard-pill' + (analyticsRange === range.value ? ' active' : '')
              }
              style={{ minWidth: 90, fontWeight: analyticsRange === range.value ? 600 : 400 }}
              onClick={() => setAnalyticsRange(range.value as any)}
              disabled={loading && analyticsRange === range.value}
            >
              {range.label}
            </button>
          ))}
        </div>

        <div className="admin-dashboard-analytics-stats">
          <div className="admin-dashboard-analytics-stat">
            <div className="admin-dashboard-analytics-value">{(stats.analytics?.totalVisitors || 0).toLocaleString()}</div>
            <div className="admin-dashboard-analytics-label">Visitors</div>
          </div>
          <div className="admin-dashboard-analytics-stat">
            <div className="admin-dashboard-analytics-value">{(stats.analytics?.totalPageViews || 0).toLocaleString()}</div>
            <div className="admin-dashboard-analytics-label">Page Views</div>
          </div>
          <div className="admin-dashboard-analytics-stat">
            <div className="admin-dashboard-analytics-value">{(stats.analytics?.albumViews?.reduce((sum, a) => sum + a.views, 0) || 0).toLocaleString()}</div>
            <div className="admin-dashboard-analytics-label">Album Views</div>
          </div>
          <div className="admin-dashboard-analytics-stat">
            <div className="admin-dashboard-analytics-value">{(stats.analytics?.photoViews?.reduce((sum, p) => sum + p.views, 0) || 0).toLocaleString()}</div>
            <div className="admin-dashboard-analytics-label">Photo Views</div>
          </div>
        </div>

        <div className="admin-dashboard-analytics-grid">
          <div className="admin-dashboard-analytics-panel">
            <h3 className="admin-dashboard-analytics-title">Top Albums</h3>
            <ul className="admin-dashboard-analytics-list">
              {(stats.analytics?.albumViews || []).slice().sort((a, b) => b.views - a.views).slice(0, 5).map((album) => (
                <li key={album.albumId}>
                  <span>
                    <Link className="admin-dashboard-analytics-link" to={`/albums/${album.albumId}`}>
                      {album.albumName}
                    </Link>
                  </span>
                  <strong>{album.views}</strong>
                </li>
              ))}
              {!stats.analytics?.albumViews?.length && <li className="empty">No album activity yet</li>}
            </ul>
          </div>

          <div className="admin-dashboard-analytics-panel">
            <h3 className="admin-dashboard-analytics-title">Top Photos</h3>
            <ul className="admin-dashboard-analytics-list">
              {(stats.analytics?.photoViews || []).slice().sort((a, b) => b.views - a.views).slice(0, 5).map((photo) => (
                <li key={photo.photoId}>
                  <span className="admin-dashboard-photo-hover-wrap">
                    <Link
                      className="admin-dashboard-analytics-link"
                      to={photo.albumId ? `/albums/${photo.albumId}?photo=${photo.photoId}` : '#'}
                      onClick={(event) => {
                        if (!photo.albumId) event.preventDefault();
                      }}
                    >
                      {photo.photoFileName}
                    </Link>
                    {(photo.thumbnailUrl || photo.fullImageUrl) && (
                      <span className="admin-dashboard-photo-hover-preview" role="tooltip">
                        {/* Always use SAS-protected URL for Azure blobs */}
                        <img src={useSasUrl((photo.thumbnailUrl || photo.fullImageUrl) || '')} alt={photo.photoFileName} />
                      </span>
                    )}
                  </span>
                  <strong>{photo.views}</strong>
                </li>
              ))}
              {!stats.analytics?.photoViews?.length && <li className="empty">No photo activity yet</li>}
            </ul>
          </div>
        </div>
      </div>

      <div className="dashboard-widget tallydark-card admin-dashboard-widget">
        <h2 className="admin-dashboard-section-title">Recent Orders</h2>
        {(stats.recentOrders?.length || 0) === 0 ? (
          <p className="admin-dashboard-empty">No recent orders found for this studio.</p>
        ) : (
          <div className="admin-dashboard-table-wrap">
            <table className="admin-dashboard-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentOrders!.map((order) => (
                  <tr key={order.id}>
                    <td>#{order.id}</td>
                    <td>{order.customer_email || 'Unknown'}</td>
                    <td>
                      <span className={`admin-dashboard-status ${String(order.status || '').toLowerCase()}`}>
                        {order.status || 'Unknown'}
                      </span>
                    </td>
                    <td>${Number(order.total || 0).toFixed(2)}</td>
                    <td>{new Date(order.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>
    </AdminLayout>
  );
};

export default AdminDashboard;