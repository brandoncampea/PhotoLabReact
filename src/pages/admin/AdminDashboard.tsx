import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardChart from '../../components/DashboardChart';
import AdminLayout from '../../components/AdminLayout';
import './AdminDashboard.css';
import api from '../../services/api';

type DashboardStats = {
  totalRevenue: number;
  revenueComposition?: {
    totalSubtotal: number;
    totalTax: number;
    totalShipping: number;
    totalDiscounts: number;
    recomputedTotal: number;
  };
  grossMarginBreakdown?: {
    totalStudioRevenue: number;
    totalBaseRevenue: number;
    totalShippingMargin: number;
    totalStripeFees: number;
    totalGrossMargin: number;
  };
  totalOrders: number;
  totalCustomers: number;
  pendingOrders: number;
  batchOrders: number;
  discountOverview?: {
    discountedOrders: number;
    totalDiscountAmount: number;
    discountedRevenue: number;
  };
  topDiscountCodes?: Array<{
    code: string;
    uses: number;
    totalDiscountAmount: number;
    revenueInfluenced: number;
    lastUsedAt?: string | null;
  }>;
  analytics?: {
    totalVisitors: number;
    totalPageViews: number;
    albumViews: Array<{ albumId: number; albumName: string; opens: number; clicks: number; views: number }>;
    photoViews: Array<{ photoId: number; albumId: number; photoFileName: string; albumName: string; thumbnailUrl?: string | null; fullImageUrl?: string | null; opens: number; clicks: number; views: number }>;
  };
  recentOrders?: Array<{
    id: number;
    total: number;
    studioProfit?: number;
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
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [revenueRange, setRevenueRange] = useState<'day' | 'week' | 'month'>('day');
  const [ordersRange, setOrdersRange] = useState<'day' | 'week' | 'month'>('day');
  const [customersRange, setCustomersRange] = useState<'day' | 'week' | 'month'>('day');
  const [pendingRange, setPendingRange] = useState<'day' | 'week' | 'month'>('day');
  const [batchRange, setBatchRange] = useState<'day' | 'week' | 'month'>('day');
  const [analyticsRange, setAnalyticsRange] = useState<'today' | 'week' | 'month' | 'all'>('today');

  useEffect(() => {
    const fetchStats = async () => {
      const isInitialLoad = !stats;
      if (isInitialLoad) {
        setLoading(true);
      } else {
        setAnalyticsLoading(true);
      }
      try {
        const params = analyticsRange && analyticsRange !== 'all' ? { params: { range: analyticsRange } } : {};
        const response = await api.get('/admin/dashboard-stats', params);
        setStats(response.data);
      } catch (e) {
        if (!stats) {
          setStats(null);
        }
      } finally {
        if (isInitialLoad) {
          setLoading(false);
        } else {
          setAnalyticsLoading(false);
        }
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

  const totalVisitors = stats.analytics?.totalVisitors || 0;
  const totalPageViews = stats.analytics?.totalPageViews || 0;
  const showVisitorPageCards = totalVisitors > 0 || totalPageViews > 0;
  const totalAlbumOpens = stats.analytics?.albumViews?.reduce((sum, album) => sum + (album.opens || 0), 0) || 0;
  const totalAlbumClicks = stats.analytics?.albumViews?.reduce((sum, album) => sum + (album.clicks || 0), 0) || 0;
  const totalPhotoOpens = stats.analytics?.photoViews?.reduce((sum, photo) => sum + (photo.opens || 0), 0) || 0;
  const totalPhotoClicks = stats.analytics?.photoViews?.reduce((sum, photo) => sum + (photo.clicks || 0), 0) || 0;
  const totalMargin = Number(stats.grossMarginBreakdown?.totalGrossMargin || 0);
  const avgRevenuePerOrder = stats.totalOrders ? (stats.totalRevenue / stats.totalOrders) : 0;
  const avgMarginPerOrder = stats.totalOrders ? (totalMargin / stats.totalOrders) : 0;

  return (
    <AdminLayout>
      <div className="page-header">
        <h1 className="gradient-text">Admin Dashboard</h1>
        <p className="admin-dashboard-subtitle">
          Business overview, stats, and recent activity for your studio.
        </p>
      </div>

      <div className="dashboard-metrics tallydark-metrics admin-dashboard-metrics">
        <div className="dashboard-card tallydark-card admin-dashboard-card admin-dashboard-card--revenue" role="region" tabIndex={0}>
          <div className="dashboard-card-label">Total Revenue</div>
          <div className="dashboard-card-value revenue admin-dashboard-revenue-value">
            <span className="admin-dashboard-revenue-total">${stats.totalRevenue.toFixed(2)}</span>
            <span className="admin-dashboard-revenue-separator">|</span>
            <span className={`admin-dashboard-revenue-margin ${totalMargin >= 0 ? 'positive' : 'negative'}`}>
              Margin: ${totalMargin.toFixed(2)}
            </span>
          </div>
          <div className="dashboard-card-sub admin-dashboard-revenue-sub">
            <span>Avg: ${avgRevenuePerOrder.toFixed(2)} per order</span>
            <span className="admin-dashboard-revenue-sub-separator">|</span>
            <span className={avgMarginPerOrder >= 0 ? 'positive' : 'negative'}>Avg Margin: ${avgMarginPerOrder.toFixed(2)} per order</span>
          </div>
          {(!!stats.revenueComposition || !!stats.grossMarginBreakdown) && (
            <div className="admin-dashboard-revenue-breakdown">
              {!!stats.revenueComposition && (
                <div className="dashboard-card-sub" style={{ marginTop: 6, lineHeight: 1.35 }}>
                  <div>+ Subtotal: ${Number(stats.revenueComposition.totalSubtotal || 0).toFixed(2)}</div>
                  <div>+ Tax: ${Number(stats.revenueComposition.totalTax || 0).toFixed(2)}</div>
                  <div>+ Shipping: ${Number(stats.revenueComposition.totalShipping || 0).toFixed(2)}</div>
                  <div>- Discounts: ${Number(stats.revenueComposition.totalDiscounts || 0).toFixed(2)}</div>
                  <div style={{ marginTop: 2 }}>= Revenue: ${Number(stats.revenueComposition.recomputedTotal || 0).toFixed(2)}</div>
                </div>
              )}
              {!!stats.grossMarginBreakdown && (
                <div className="dashboard-card-sub" style={{ marginTop: 6, lineHeight: 1.35 }}>
                  <div style={{ opacity: 0.9 }}>Gross Margin:</div>
                  <div>+ Studio Price: ${Number(stats.grossMarginBreakdown.totalStudioRevenue || 0).toFixed(2)}</div>
                  <div>- Base Cost: ${Number(stats.grossMarginBreakdown.totalBaseRevenue || 0).toFixed(2)}</div>
                  <div>+ Shipping Margin: ${Number(stats.grossMarginBreakdown.totalShippingMargin || 0).toFixed(2)}</div>
                  <div>- Stripe Fees: ${Number(stats.grossMarginBreakdown.totalStripeFees || 0).toFixed(2)}</div>
                  <div style={{ marginTop: 2 }}>= Margin: ${Number(stats.grossMarginBreakdown.totalGrossMargin || 0).toFixed(2)}</div>
                </div>
              )}
            </div>
          )}
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
        <div className="dashboard-card tallydark-card admin-dashboard-card">
          <div
            className="dashboard-card-label dashboard-card-label-clickable"
            role="button"
            tabIndex={0}
            onClick={() => window.location.href = '/admin/orders'}
            onKeyDown={e => { if (e.key === 'Enter') window.location.href = '/admin/orders'; }}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            Total Orders
            <span aria-label="Go to Orders" style={{ fontSize: 18 }}>↗️</span>
          </div>
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
        <div className="dashboard-card tallydark-card admin-dashboard-card">
          <div
            className="dashboard-card-label dashboard-card-label-clickable"
            role="button"
            tabIndex={0}
            onClick={() => window.location.href = '/admin/customers'}
            onKeyDown={e => { if (e.key === 'Enter') window.location.href = '/admin/customers'; }}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            Total Customers
            <span aria-label="Go to Customers" style={{ fontSize: 18 }}>↗️</span>
          </div>
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
        <div className="dashboard-card tallydark-card admin-dashboard-card">
          <div
            className="dashboard-card-label dashboard-card-label-clickable"
            role="button"
            tabIndex={0}
            onClick={() => window.location.href = '/admin/orders?status=pending'}
            onKeyDown={e => { if (e.key === 'Enter') window.location.href = '/admin/orders?status=pending'; }}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            Pending Orders
            <span aria-label="Go to Pending Orders" style={{ fontSize: 18 }}>↗️</span>
          </div>
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

        <div className="dashboard-card tallydark-card admin-dashboard-card">
          <div
            className="dashboard-card-label dashboard-card-label-clickable"
            role="button"
            tabIndex={0}
            onClick={() => window.location.href = '/admin/orders'}
            onKeyDown={e => { if (e.key === 'Enter') window.location.href = '/admin/orders'; }}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            Batch Orders
            <span aria-label="Go to Orders" style={{ fontSize: 18 }}>↗️</span>
          </div>
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

      <div className="dashboard-widget tallydark-card admin-dashboard-widget" style={{ marginTop: 18 }}>
        <h2 className="admin-dashboard-section-title">Discount Analytics</h2>
        <div className="admin-dashboard-analytics-stats" style={{ marginBottom: 12 }}>
          <div className="admin-dashboard-analytics-stat">
            <div className="admin-dashboard-analytics-value">${Number(stats.discountOverview?.totalDiscountAmount || 0).toFixed(2)}</div>
            <div className="admin-dashboard-analytics-label">Total Discounts Given</div>
          </div>
          <div className="admin-dashboard-analytics-stat">
            <div className="admin-dashboard-analytics-value">{Number(stats.discountOverview?.discountedOrders || 0)}</div>
            <div className="admin-dashboard-analytics-label">Discounted Orders</div>
          </div>
          <div className="admin-dashboard-analytics-stat">
            <div className="admin-dashboard-analytics-value">${Number(stats.discountOverview?.discountedRevenue || 0).toFixed(2)}</div>
            <div className="admin-dashboard-analytics-label">Revenue with Discounts</div>
          </div>
        </div>

        <h3 style={{ margin: '0 0 10px 0', fontSize: '1rem' }}>Top Discount Codes</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Uses</th>
                <th>Total Discount</th>
                <th>Revenue Influenced</th>
                <th>Last Used</th>
              </tr>
            </thead>
            <tbody>
              {(stats.topDiscountCodes || []).length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center' }}>No discount usage yet.</td>
                </tr>
              ) : (
                (stats.topDiscountCodes || []).map((code) => (
                  <tr key={code.code}>
                    <td><strong>{code.code}</strong></td>
                    <td>{Number(code.uses || 0)}</td>
                    <td>${Number(code.totalDiscountAmount || 0).toFixed(2)}</td>
                    <td>${Number(code.revenueInfluenced || 0).toFixed(2)}</td>
                    <td>{code.lastUsedAt ? new Date(code.lastUsedAt).toLocaleDateString() : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
              type="button"
              className={
                'dashboard-pill' + (analyticsRange === range.value ? ' active' : '')
              }
              style={{ minWidth: 90, fontWeight: analyticsRange === range.value ? 600 : 400 }}
              onClick={(e) => {
                e.preventDefault();
                setAnalyticsRange(range.value as any);
              }}
              disabled={analyticsRange === range.value}
            >
              {range.label}
            </button>
          ))}
        </div>

        <div className="admin-dashboard-analytics-stats">
          {showVisitorPageCards && (
            <>
              <div className="admin-dashboard-analytics-stat">
                <div className="admin-dashboard-analytics-value">{totalVisitors.toLocaleString()}</div>
                <div className="admin-dashboard-analytics-label">Visitors</div>
              </div>
              <div className="admin-dashboard-analytics-stat">
                <div className="admin-dashboard-analytics-value">{totalPageViews.toLocaleString()}</div>
                <div className="admin-dashboard-analytics-label">Page Views</div>
              </div>
            </>
          )}
          <div className="admin-dashboard-analytics-stat">
            <div className="admin-dashboard-analytics-value">{(stats.analytics?.albumViews?.reduce((sum, a) => sum + a.views, 0) || 0).toLocaleString()}</div>
            <div className="admin-dashboard-analytics-label">Album Total</div>
            <div className="dashboard-card-sub">{totalAlbumOpens.toLocaleString()} opens • {totalAlbumClicks.toLocaleString()} clicks</div>
          </div>
          <div className="admin-dashboard-analytics-stat">
            <div className="admin-dashboard-analytics-value">{(stats.analytics?.photoViews?.reduce((sum, p) => sum + p.views, 0) || 0).toLocaleString()}</div>
            <div className="admin-dashboard-analytics-label">Photo Total</div>
            <div className="dashboard-card-sub">{totalPhotoOpens.toLocaleString()} opens • {totalPhotoClicks.toLocaleString()} clicks</div>
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
                  <span style={{ color: '#a0a0b8', fontSize: 12 }}>{album.opens} opens • {album.clicks} clicks</span>
                </li>
              ))}
              {!stats.analytics?.albumViews?.length && <li className="empty">No album activity yet</li>}
            </ul>
          </div>

          <div className="admin-dashboard-analytics-panel">
            <h3 className="admin-dashboard-analytics-title">Top Photos</h3>
            <ul className="admin-dashboard-analytics-list">
              {(stats.analytics?.photoViews || []).slice().sort((a, b) => b.views - a.views).slice(0, 5).map((photo) => {
                let previewSrc = '';
                // Match AlbumDetails behavior: prefer ID-based thumbnail endpoint
                if (photo.photoId) {
                  previewSrc = `/api/photos/${photo.photoId}/asset?variant=thumbnail`;
                } else if (photo.thumbnailUrl) {
                  if (photo.thumbnailUrl.startsWith('/api/') || photo.thumbnailUrl.startsWith('/uploads/') || photo.thumbnailUrl.startsWith('http')) {
                    previewSrc = photo.thumbnailUrl;
                  }
                }

                return (
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
                      {previewSrc && (
                        <span className="admin-dashboard-photo-hover-preview" role="tooltip">
                          <img
                            src={previewSrc}
                            alt={photo.photoFileName}
                          />
                        </span>
                      )}
                    </span>
                    <strong>{photo.views}</strong>
                    <span style={{ color: '#a0a0b8', fontSize: 12 }}>{photo.opens} opens • {photo.clicks} clicks</span>
                  </li>
                );
              })}
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
                  <th>Studio Profit</th>
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
                    <td
                      style={{
                        color: Number(order.studioProfit || 0) >= 0 ? '#86efac' : '#fca5a5',
                        fontWeight: 600,
                      }}
                    >
                      ${Number(order.studioProfit || 0).toFixed(2)}
                    </td>
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