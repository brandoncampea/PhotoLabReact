import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Order, DashboardStats } from '../../types';
import { analyticsService } from '../../services/analyticsService';
import { orderService } from '../../services/orderService';
import { userAdminService } from '../../services/adminService';
import { albumService } from '../../services/albumService';


const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
    // Refresh stats every 30 seconds
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const loadStats = async () => {
    try {
      const [ordersResult, customersResult, albumsResult] = await Promise.allSettled([
        orderService.getAdminOrders(),
        userAdminService.getAll(),
        albumService.getAlbums(),
      ]);

      const ordersData = ordersResult.status === 'fulfilled' ? ordersResult.value : [];
      if (ordersResult.status !== 'fulfilled') {
        console.warn('Orders load failed:', ordersResult.reason);
      }

      const customers = customersResult.status === 'fulfilled' ? customersResult.value : [];
      if (customersResult.status !== 'fulfilled') {
        console.warn('Customers load failed (likely missing admin auth):', customersResult.reason);
      }

      const albums = albumsResult.status === 'fulfilled' ? albumsResult.value : [];
      if (albumsResult.status !== 'fulfilled') {
        console.warn('Albums load failed:', albumsResult.reason);
      }

      const totalRevenue = ordersData.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
      const pendingOrders = ordersData.filter(order => (order.status || '').toLowerCase() === 'pending').length;
      const totalOrders = ordersData.length;
      const recentOrders = [...ordersData]
        .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime())
        .slice(0, 5);

      const albumOrderCounts = new Map<number, { albumId: number; orderCount: number; albumName: string }>();
      ordersData.forEach(order => {
        order.items?.forEach(item => {
          const albumId = item.photo?.albumId;
          if (!albumId) return;
          const albumName = albums.find(a => a.id === albumId)?.name || `Album #${albumId}`;
          const existing = albumOrderCounts.get(albumId) || { albumId, orderCount: 0, albumName };
          existing.orderCount += 1;
          albumOrderCounts.set(albumId, existing);
        });
      });

      const topAlbums = Array.from(albumOrderCounts.values())
        .sort((a, b) => b.orderCount - a.orderCount)
        .slice(0, 6)
        .map(entry => {
          const album = albums.find(a => a.id === entry.albumId);
          if (!album) return null;
          return { album, orderCount: entry.orderCount };
        })
        .filter((entry): entry is { album: typeof albums[number]; orderCount: number } => entry !== null);

      setStats({
        totalOrders,
        totalRevenue,
        totalCustomers: customers.length,
        pendingOrders,
        recentOrders,
        topAlbums,
      });
      setOrders(ordersData);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const [analytics, setAnalytics] = useState<{ totalVisitors: number; totalPageViews: number; albumViews: number; photoViews: number } | null>(null);

  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        const summary = await analyticsService.getSummary();
        setAnalytics({
          totalVisitors: summary.totalVisits || 0,
          totalPageViews: summary.totalPageViews || 0,
          albumViews: summary.albumViews || 0,
          photoViews: summary.photoViews || 0,
        });
      } catch (error) {
        console.error('Failed to load analytics:', error);
      }
    };
    loadAnalytics();
    const interval = setInterval(loadAnalytics, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  const orderCompletionRate = stats?.totalOrders 
    ? ((stats.totalOrders - stats.pendingOrders) / stats.totalOrders * 100).toFixed(1) 
    : '0';

  const averageOrderValue = stats?.totalOrders 
    ? (stats.totalRevenue / stats.totalOrders).toFixed(2) 
    : '0.00';

  // Calculate total profit and cost
  const calculateProfit = () => {
    let totalCost = 0;
    orders.forEach(order => {
      order.items?.forEach(item => {
        if (item.cost !== undefined) {
          totalCost += item.cost * item.quantity;
        }
      });
    });
    const revenue = stats?.totalRevenue || 0;
    const profit = revenue - totalCost;
    return { profit, cost: totalCost, margin: revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0 };
  };

  const profitData = calculateProfit();

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>📊 Dashboard</h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Welcome back! Here's what's happening with your business today.
        </p>
      </div>

      {/* Key Metrics */}
      <div className="dashboard-metrics">
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate('/admin/analytics')}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/admin/analytics')}
          className="dashboard-card dashboard-card-revenue"
        >
          <span className="dashboard-card-icon">💰</span>
          <div className="dashboard-card-label">Total Revenue</div>
          <div className="dashboard-card-value">${stats?.totalRevenue.toFixed(2) || '0.00'}</div>
          <div className="dashboard-card-sub">Avg: ${averageOrderValue} per order</div>
          <span className="dashboard-card-link">View analytics →</span>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate('/admin/orders')}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/admin/orders')}
          className="dashboard-card dashboard-card-orders"
        >
          <span className="dashboard-card-icon">📦</span>
          <div className="dashboard-card-label">Total Orders</div>
          <div className="dashboard-card-value">{stats?.totalOrders || 0}</div>
          <div className="dashboard-card-sub">{orderCompletionRate}% completion rate</div>
          <span className="dashboard-card-link">Go to orders →</span>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate('/admin/customers')}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/admin/customers')}
          className="dashboard-card dashboard-card-customers"
        >
          <span className="dashboard-card-icon">👥</span>
          <div className="dashboard-card-label">Total Customers</div>
          <div className="dashboard-card-value">{stats?.totalCustomers || 0}</div>
          <div className="dashboard-card-sub">Active user accounts</div>
          <span className="dashboard-card-link">View customers →</span>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate('/admin/orders')}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/admin/orders')}
          className="dashboard-card dashboard-card-pending"
        >
          <span className="dashboard-card-icon">⏳</span>
          <div className="dashboard-card-label">Pending Orders</div>
          <div className="dashboard-card-value">{stats?.pendingOrders || 0}</div>
          <div className="dashboard-card-sub">Requires attention</div>
          <span className="dashboard-card-link">Review pending →</span>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate('/admin/analytics')}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/admin/analytics')}
          className="dashboard-card dashboard-card-profit"
        >
          <span className="dashboard-card-icon">📈</span>
          <div className="dashboard-card-label">Total Profit</div>
          <div className="dashboard-card-value">${profitData.profit.toFixed(2)}</div>
          <div className="dashboard-card-sub">{profitData.margin}% margin</div>
          <span className="dashboard-card-link">See profit details →</span>
        </div>
      </div>

      {/* Analytics Overview + Order Status */}
      <div className="dashboard-two-col">
        {/* Traffic Overview */}
        <div className="dashboard-widget">
          <h2><span>📈</span> Traffic Overview</h2>
          <div className="dashboard-mini-stats">
            <div className="dashboard-mini-stat">
              <div className="dashboard-mini-stat-label">Total Visitors</div>
              <div className="dashboard-mini-stat-value accent-blue">{analytics?.totalVisitors || 0}</div>
            </div>
            <div className="dashboard-mini-stat">
              <div className="dashboard-mini-stat-label">Page Views</div>
              <div className="dashboard-mini-stat-value accent-purple">{analytics?.totalPageViews || 0}</div>
            </div>
            <div className="dashboard-mini-stat">
              <div className="dashboard-mini-stat-label">Albums Viewed</div>
              <div className="dashboard-mini-stat-value accent-green">{analytics?.albumViews || 0}</div>
            </div>
            <div className="dashboard-mini-stat">
              <div className="dashboard-mini-stat-label">Photos Viewed</div>
              <div className="dashboard-mini-stat-value accent-orange">{analytics?.photoViews || 0}</div>
            </div>
          </div>
        </div>

        {/* Order Status */}
        <div className="dashboard-widget">
          <h2><span>📊</span> Order Status</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="dashboard-progress-item">
              <div className="dashboard-progress-label-row">
                <span style={{ fontWeight: 500 }}>Completed</span>
                <span>{stats?.totalOrders ? stats.totalOrders - stats.pendingOrders : 0}</span>
              </div>
              <div className="dashboard-progress-track">
                <div
                  className="dashboard-progress-fill accent-green"
                  style={{ width: `${stats?.totalOrders ? ((stats.totalOrders - stats.pendingOrders) / stats.totalOrders * 100) : 0}%` }}
                />
              </div>
            </div>
            <div className="dashboard-progress-item">
              <div className="dashboard-progress-label-row">
                <span style={{ fontWeight: 500 }}>Pending</span>
                <span>{stats?.pendingOrders || 0}</span>
              </div>
              <div className="dashboard-progress-track">
                <div
                  className="dashboard-progress-fill accent-orange"
                  style={{ width: `${stats?.totalOrders ? (stats.pendingOrders / stats.totalOrders * 100) : 0}%` }}
                />
              </div>
            </div>
            <div className="dashboard-completion-ring">
              <svg width="120" height="120">
                <circle cx="60" cy="60" r="50" fill="none" stroke="var(--border-color)" strokeWidth="10" />
                <circle
                  cx="60" cy="60" r="50" fill="none"
                  stroke="#4caf50" strokeWidth="10"
                  strokeDasharray={`${2 * Math.PI * 50 * parseFloat(orderCompletionRate) / 100} ${2 * Math.PI * 50}`}
                  strokeLinecap="round"
                  transform="rotate(-90 60 60)"
                />
                <text x="60" y="60" textAnchor="middle" dy=".3em" style={{ fontSize: '1.5rem', fontWeight: 'bold', fill: '#4caf50' }}>
                  {orderCompletionRate}%
                </text>
              </svg>
              <div className="dashboard-completion-ring-label">Completion Rate</div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Albums */}
      <div className="dashboard-widget" style={{ marginBottom: '2rem' }}>
        <h2><span>🔥</span> Most Popular Albums</h2>
        {!stats?.topAlbums || stats.topAlbums.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', padding: '2rem' }}>
            No album orders yet. Sales will appear here once customers purchase.
          </p>
        ) : (
          <div className="dashboard-albums-grid">
            {stats.topAlbums.slice(0, 6).map((entry) => (
              <div key={entry.album.id} className="dashboard-album-card">
                <div className="dashboard-album-name">📁 {entry.album.name}</div>
                <div className="dashboard-album-count">{entry.orderCount}</div>
                <div className="dashboard-album-count-label">orders</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="dashboard-widget">
        <h2><span>⚡</span> Quick Actions</h2>
        <div className="dashboard-actions-grid">
          <a href="/admin/orders"    className="btn btn-primary"    style={{ textDecoration: 'none', textAlign: 'center' }}>📦 Manage Orders</a>
          <a href="/admin/albums"    className="btn btn-primary"    style={{ textDecoration: 'none', textAlign: 'center' }}>📁 Manage Albums</a>
          <a href="/admin/products"  className="btn btn-primary"    style={{ textDecoration: 'none', textAlign: 'center' }}>🛍️ Manage Products</a>
          <a href="/admin/customers" className="btn btn-primary"    style={{ textDecoration: 'none', textAlign: 'center' }}>👥 View Customers</a>
          <a href="/admin/analytics" className="btn btn-secondary"  style={{ textDecoration: 'none', textAlign: 'center' }}>📈 View Analytics</a>
          <a href="/admin/shipping"  className="btn btn-secondary"  style={{ textDecoration: 'none', textAlign: 'center' }}>🚚 Shipping Settings</a>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
