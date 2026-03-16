
import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import { useAuth } from '../../contexts/AuthContext';
import { Order, DashboardStats } from '../../types';
import { analyticsService } from '../../services/analyticsService';
import { orderService } from '../../services/orderService';
import { albumService } from '../../services/albumService';
import api from '../../services/api';
import { studioFeatureService } from '../../services/studioFeatureService';
import '../../AdminStyles.css';

interface RevenueBreakdownSummary {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  totalItems: number;
  totalOrders: number;
}

interface RevenueByCategory {
  category: string;
  revenue: number;
  cost: number;
  profit: number;
  quantity: number;
  orderCount: number;
}

interface RevenueByAlbum {
  albumId: number;
  albumName: string;
  albumCategory: string;
  photoCount: number;
  revenue: number;
  cost: number;
  profit: number;
  quantity: number;
  orderCount: number;
}

interface RevenueByPhoto {
  albumId: number;
  albumName: string;
  photoId: number;
  fileName: string;
  thumbnailUrl?: string;
  revenue: number;
  cost: number;
  profit: number;
  quantity: number;
  orderCount: number;
}

interface RevenueBreakdown {
  summary: RevenueBreakdownSummary;
  byCategory: RevenueByCategory[];
  byAlbum: RevenueByAlbum[];
  byProduct: Array<{
    productId: number;
    productName: string;
    category: string;
    revenue: number;
    cost: number;
    profit: number;
    quantity: number;
    orderCount: number;
  }>;
  bySize: Array<{
    productId: number;
    productName: string;
    productSizeId: number;
    sizeName: string;
    revenue: number;
    cost: number;
    profit: number;
    quantity: number;
    orderCount: number;
  }>;
  byPhoto: RevenueByPhoto[];
}

interface StudioSubscriptionAccess {
  planId: string | null;
  planName: string | null;
  hasAdvancedAnalytics: boolean;
}

interface StudioProfitSummaryLite {
  totalOrders: number;
  totalStudioRevenue: number;
  totalStudioProfit: number;
}

const StudioAdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRevenueModal, setShowRevenueModal] = useState(false);
  const [revenueBreakdown, setRevenueBreakdown] = useState<RevenueBreakdown | null>(null);
  const [revenueBreakdownLoading, setRevenueBreakdownLoading] = useState(false);
  const [revenueBreakdownError, setRevenueBreakdownError] = useState('');
  const [selectedAlbumId, setSelectedAlbumId] = useState<number | null>(null);
  const [revenueFocus, setRevenueFocus] = useState<'revenue' | 'profit'>('revenue');
  const [subscriptionAccess, setSubscriptionAccess] = useState<StudioSubscriptionAccess>({
    planId: null,
    planName: null,
    hasAdvancedAnalytics: true,
  });
  const [studioProfitSummary, setStudioProfitSummary] = useState<StudioProfitSummaryLite | null>(null);
  const [analytics, setAnalytics] = useState<{ totalVisitors: number; totalPageViews: number; albumViews: number; photoViews: number } | null>(null);

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    const loadSubscriptionAccess = async () => {
      const effectiveStudioId = studioFeatureService.getEffectiveStudioId(user);
      if (!effectiveStudioId) {
        setSubscriptionAccess({ planId: null, planName: null, hasAdvancedAnalytics: true });
        return;
      }

      try {
        const response = await api.get(`/studios/${effectiveStudioId}/subscription`);
        const plan = response.data?.plan || null;
        const hasAdvancedAnalytics = Array.isArray(plan?.features) && plan.features.includes('Advanced analytics');
        setSubscriptionAccess({
          planId: plan?.id || null,
          planName: plan?.name || null,
          hasAdvancedAnalytics,
        });
      } catch (error) {
        setSubscriptionAccess({ planId: null, planName: null, hasAdvancedAnalytics: false });
      }
    };
    loadSubscriptionAccess();
  }, [user]);

  useEffect(() => {
    const loadStudioProfitSummary = async () => {
      const effectiveStudioId = studioFeatureService.getEffectiveStudioId(user);
      if (!effectiveStudioId || user?.role !== 'studio_admin') {
        setStudioProfitSummary(null);
        return;
      }

      try {
        const response = await api.get(`/studios/${effectiveStudioId}/profit`);
        setStudioProfitSummary({
          totalOrders: Number(response.data?.totalOrders) || 0,
          totalStudioRevenue: Number(response.data?.totalStudioRevenue) || 0,
          totalStudioProfit: Number(response.data?.totalStudioProfit) || 0,
        });
      } catch (error) {
        setStudioProfitSummary(null);
      }
    };
    loadStudioProfitSummary();
  }, [user]);

  const loadStats = async () => {
    try {
      const [ordersResult, customersResult, albumsResult] = await Promise.allSettled([
        orderService.getAdminOrders(),
        albumService.getAlbums(),
        albumService.getAlbums(),
      ]);

      const ordersData = ordersResult.status === 'fulfilled' ? ordersResult.value : [];
      const albums = albumsResult.status === 'fulfilled' ? albumsResult.value : [];

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
        totalCustomers: 0,
        pendingOrders,
        recentOrders,
        topAlbums,
      });
      setOrders(ordersData);
    } catch (error) {
      setLoading(false);
    } finally {
      setLoading(false);
    }
  };

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
      }
    };
    loadAnalytics();
    const interval = setInterval(loadAnalytics, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  const displayTotalRevenue = user?.role === 'studio_admin' && studioProfitSummary
    ? studioProfitSummary.totalStudioRevenue
    : (stats?.totalRevenue || 0);

  const displayTotalOrders = user?.role === 'studio_admin' && studioProfitSummary
    ? studioProfitSummary.totalOrders
    : (stats?.totalOrders || 0);

  const orderCompletionRate = displayTotalOrders
    ? ((displayTotalOrders - (stats?.pendingOrders || 0)) / displayTotalOrders * 100).toFixed(1)
    : '0';

  const averageOrderValue = displayTotalOrders
    ? (displayTotalRevenue / displayTotalOrders).toFixed(2)
    : '0.00';

  // Calculate total profit and cost
  const calculateProfit = () => {
    if (user?.role === 'studio_admin' && studioProfitSummary) {
      const revenue = displayTotalRevenue;
      const profit = Number(studioProfitSummary.totalStudioProfit) || 0;
      return {
        profit,
        cost: Math.max(0, revenue - profit),
        margin: revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0,
      };
    }

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

  const loadRevenueBreakdown = async () => {
    try {
      setRevenueBreakdownLoading(true);
      const effectiveStudioId = studioFeatureService.getEffectiveStudioId(user);
      const data = await analyticsService.getRevenueBreakdown(effectiveStudioId);
      setRevenueBreakdown(data);
      setSelectedAlbumId(data.byAlbum?.[0]?.albumId || null);
      setRevenueBreakdownError('');
    } catch (error) {
      const responseError = error as any;
      if (responseError?.response?.status === 403 && responseError?.response?.data?.code === 'ADVANCED_ANALYTICS_REQUIRED') {
        setRevenueBreakdownError(responseError.response.data.error || 'Advanced analytics require a higher subscription');
      } else {
        setRevenueBreakdownError('Failed to load revenue details');
      }
    } finally {
      setRevenueBreakdownLoading(false);
    }
  };

  const openRevenueModal = async (focus: 'revenue' | 'profit') => {
    setRevenueFocus(focus);
    setShowRevenueModal(true);
    if (!subscriptionAccess.hasAdvancedAnalytics) {
      setRevenueBreakdown(null);
      setRevenueBreakdownError('Advanced analytics require a Professional or Enterprise subscription');
      return;
    }
    await loadRevenueBreakdown();
  };

  const formatCurrency = (value: number) => `$${value.toFixed(2)}`;
  const albumPhotos = revenueBreakdown?.byPhoto.filter((photo) => photo.albumId === selectedAlbumId) || [];
  const selectedAlbum = revenueBreakdown?.byAlbum.find((album) => album.albumId === selectedAlbumId) || null;

  return (
    <AdminLayout>
      <div className="admin-page">
        <div className="page-header">
          <h1>🏢 Studio Admin Dashboard</h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            Studio-level business overview, analytics, and revenue/profit breakdowns.
          </p>
        </div>

        {/* Key Metrics */}
        <div className="dashboard-metrics">
          <div
            role="button"
            tabIndex={0}
            onClick={() => openRevenueModal('revenue')}
            onKeyDown={(e) => e.key === 'Enter' && openRevenueModal('revenue')}
            className="dashboard-card dashboard-card-revenue"
          >
            <span className="dashboard-card-icon">💰</span>
            <div className="dashboard-card-label">Total Revenue</div>
            <div className="dashboard-card-value">${displayTotalRevenue.toFixed(2)}</div>
            <div className="dashboard-card-sub">Avg: ${averageOrderValue} per order</div>
            <span className="dashboard-card-link">View revenue details →</span>
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={() => {}}
            className="dashboard-card dashboard-card-orders"
          >
            <span className="dashboard-card-icon">📦</span>
            <div className="dashboard-card-label">Total Orders</div>
            <div className="dashboard-card-value">{displayTotalOrders}</div>
            <div className="dashboard-card-sub">{orderCompletionRate}% completion rate</div>
            <span className="dashboard-card-link">Go to orders →</span>
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={() => {}}
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
            onClick={() => {}}
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
            onClick={() => openRevenueModal('profit')}
            onKeyDown={(e) => e.key === 'Enter' && openRevenueModal('profit')}
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

        {showRevenueModal && (
          <div className="modal-overlay" onClick={() => setShowRevenueModal(false)}>
            <div className="modal-content admin-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1100px', maxHeight: '90vh', overflowY: 'auto', padding: '2rem' }}>
              <div className="modal-header admin-modal-header">
                <h2>{revenueFocus === 'revenue' ? 'Revenue Details' : 'Profit Details'}</h2>
                <button onClick={() => setShowRevenueModal(false)} className="btn-close">×</button>
              </div>

              {revenueBreakdownLoading ? (
                <div className="loading" style={{ padding: '2rem 0' }}>Loading details...</div>
              ) : revenueBreakdownError ? (
                <div className="dashboard-widget" style={{ marginTop: '1rem' }}>
                  <h2><span>🔒</span> Advanced Analytics</h2>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>{revenueBreakdownError}</p>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                    {subscriptionAccess.planName
                      ? `Your current plan is ${subscriptionAccess.planName}.`
                      : 'Your current plan does not include advanced analytics.'}
                    {' '}Upgrade to Professional or Enterprise to unlock revenue and profit analytics by category, album, product, size, and photo.
                  </p>
                  <button className="btn btn-primary" onClick={() => {}}>
                    View Upgrade Options
                  </button>
                </div>
              ) : revenueBreakdown ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                    <div className="dashboard-widget" style={{ padding: '1rem' }}>
                      <div className="dashboard-card-label">Total Revenue</div>
                      <div className="dashboard-card-value" style={{ fontSize: '1.6rem' }}>{formatCurrency(revenueBreakdown.summary.totalRevenue)}</div>
                    </div>
                    <div className="dashboard-widget" style={{ padding: '1rem' }}>
                      <div className="dashboard-card-label">Total Cost</div>
                      <div className="dashboard-card-value" style={{ fontSize: '1.6rem', color: '#f59e0b' }}>{formatCurrency(revenueBreakdown.summary.totalCost)}</div>
                    </div>
                    <div className="dashboard-widget" style={{ padding: '1rem' }}>
                      <div className="dashboard-card-label">Total Profit</div>
                      <div className="dashboard-card-value" style={{ fontSize: '1.6rem', color: '#10b981' }}>{formatCurrency(revenueBreakdown.summary.totalProfit)}</div>
                    </div>
                    <div className="dashboard-widget" style={{ padding: '1rem' }}>
                      <div className="dashboard-card-label">Items Sold</div>
                      <div className="dashboard-card-value" style={{ fontSize: '1.6rem', color: 'var(--text-primary)' }}>{revenueBreakdown.summary.totalItems}</div>
                    </div>
                  </div>

                  <div className="dashboard-widget">
                    <h2><span>🏷️</span> Revenue by Category</h2>
                    {revenueBreakdown.byCategory.length === 0 ? (
                      <p style={{ color: 'var(--text-secondary)', margin: 0 }}>No category sales yet.</p>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Category</th>
                              <th>Orders</th>
                              <th>Items</th>
                              <th>Revenue</th>
                              <th>Cost</th>
                              <th>Profit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {revenueBreakdown.byCategory.map((row) => (
                              <tr key={row.category}>
                                <td>{row.category}</td>
                                <td>{row.orderCount}</td>
                                <td>{row.quantity}</td>
                                <td>{formatCurrency(row.revenue)}</td>
                                <td>{formatCurrency(row.cost)}</td>
                                <td style={{ color: row.profit >= 0 ? '#10b981' : 'var(--error-color)', fontWeight: 600 }}>{formatCurrency(row.profit)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="dashboard-widget">
                    <h2><span>📁</span> Revenue by Album</h2>
                    {revenueBreakdown.byAlbum.length === 0 ? (
                      <p style={{ color: 'var(--text-secondary)', margin: 0 }}>No album sales yet.</p>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Album</th>
                              <th>Category</th>
                              <th>Photos</th>
                              <th>Orders</th>
                              <th>Items</th>
                              <th>Revenue</th>
                              <th>Profit</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {revenueBreakdown.byAlbum.map((row) => (
                              <tr key={row.albumId} style={{ backgroundColor: row.albumId === selectedAlbumId ? 'rgba(124, 92, 255, 0.12)' : 'transparent' }}>
                                <td>{row.albumName}</td>
                                <td>{row.albumCategory}</td>
                                <td>{row.photoCount}</td>
                                <td>{row.orderCount}</td>
                                <td>{row.quantity}</td>
                                <td>{formatCurrency(row.revenue)}</td>
                                <td style={{ color: row.profit >= 0 ? '#10b981' : 'var(--error-color)', fontWeight: 600 }}>{formatCurrency(row.profit)}</td>
                                <td>
                                  <button className="btn btn-secondary btn-sm" onClick={() => setSelectedAlbumId(row.albumId)}>
                                    View Photos
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="dashboard-widget">
                    <h2><span>📦</span> Revenue by Product</h2>
                    {revenueBreakdown.byProduct.length === 0 ? (
                      <p style={{ color: 'var(--text-secondary)', margin: 0 }}>No product sales yet.</p>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Product</th>
                              <th>Category</th>
                              <th>Orders</th>
                              <th>Items</th>
                              <th>Revenue</th>
                              <th>Cost</th>
                              <th>Profit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {revenueBreakdown.byProduct.map((row) => (
                              <tr key={row.productId || row.productName}>
                                <td>{row.productName}</td>
                                <td>{row.category}</td>
                                <td>{row.orderCount}</td>
                                <td>{row.quantity}</td>
                                <td>{formatCurrency(row.revenue)}</td>
                                <td>{formatCurrency(row.cost)}</td>
                                <td style={{ color: row.profit >= 0 ? '#10b981' : 'var(--error-color)', fontWeight: 600 }}>{formatCurrency(row.profit)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="dashboard-widget">
                    <h2><span>📐</span> Revenue by Size</h2>
                    {revenueBreakdown.bySize.length === 0 ? (
                      <p style={{ color: 'var(--text-secondary)', margin: 0 }}>No size-level sales yet.</p>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Product</th>
                              <th>Size</th>
                              <th>Orders</th>
                              <th>Items</th>
                              <th>Revenue</th>
                              <th>Cost</th>
                              <th>Profit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {revenueBreakdown.bySize.map((row) => (
                              <tr key={`${row.productId}-${row.productSizeId}-${row.sizeName}`}>
                                <td>{row.productName}</td>
                                <td>{row.sizeName}</td>
                                <td>{row.orderCount}</td>
                                <td>{row.quantity}</td>
                                <td>{formatCurrency(row.revenue)}</td>
                                <td>{formatCurrency(row.cost)}</td>
                                <td style={{ color: row.profit >= 0 ? '#10b981' : 'var(--error-color)', fontWeight: 600 }}>{formatCurrency(row.profit)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="dashboard-widget">
                    <h2><span>🖼️</span> {selectedAlbum ? `Photo Revenue — ${selectedAlbum.albumName}` : 'Photo Revenue by Album'}</h2>
                    {!selectedAlbum ? (
                      <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Select an album above to see photo-level stats.</p>
                    ) : albumPhotos.length === 0 ? (
                      <p style={{ color: 'var(--text-secondary)', margin: 0 }}>No photo sales recorded for this album yet.</p>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Photo</th>
                              <th>Filename</th>
                              <th>Orders</th>
                              <th>Items</th>
                              <th>Revenue</th>
                              <th>Cost</th>
                              <th>Profit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {albumPhotos.map((row) => (
                              <tr key={row.photoId}>
                                <td>
                                  {row.thumbnailUrl ? (
                                    <img src={row.thumbnailUrl} alt={row.fileName} style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border-color)' }} />
                                  ) : '—'}
                                </td>
                                <td>{row.fileName}</td>
                                <td>{row.orderCount}</td>
                                <td>{row.quantity}</td>
                                <td>{formatCurrency(row.revenue)}</td>
                                <td>{formatCurrency(row.cost)}</td>
                                <td style={{ color: row.profit >= 0 ? '#10b981' : 'var(--error-color)', fontWeight: 600 }}>{formatCurrency(row.profit)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default StudioAdminDashboard;
