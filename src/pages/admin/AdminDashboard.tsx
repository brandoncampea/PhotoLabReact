import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardChart from '../../components/DashboardChart';
import AdminLayout from '../../components/AdminLayout';
import StudioOnboardingChecklist from '../../components/StudioOnboardingChecklist';
import './AdminDashboard.css';
import api from '../../services/api';
import { photoService } from '../../services/photoService';

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
  taxSeries?: Record<'day' | 'week' | 'month', { data: number[]; labels: string[] }>;
  ordersSeries?: Record<'day' | 'week' | 'month', { data: number[]; labels: string[] }>;
  customersSeries?: Record<'day' | 'week' | 'month', { data: number[]; labels: string[] }>;
  pendingOrdersSeries?: Record<'day' | 'week' | 'month', { data: number[]; labels: string[] }>;
  batchOrdersSeries?: Record<'day' | 'week' | 'month', { data: number[]; labels: string[] }>;
  schedulingStats?: {
    totalBookings: number;
    pendingBookings: number;
    approvedBookings: number;
    upcomingBookings: number;
    bookingRevenue: number;
    platformFees: number;
    bookingStripeFees: number;
    studioPayouts: number;
    upcomingBookingsList: {
      id: number;
      customerName: string;
      customerEmail: string;
      slotDate: string;
      startTime: string;
      sessionTypeName: string;
      paymentStatus: string;
      paymentAmount: number;
    }[];
  };
};

type PackageStats = {
  exists: boolean;
  summary: {
    totalOrders: number;
    ordersWithPackages: number;
    adoptionRate: number;
    packageRevenue: number;
    individualRevenue: number;
    packageRevenueShare: number;
  } | null;
  topPackages: { packageName: string; orderCount: number; totalSold: number; totalRevenue: number }[];
};

type ShareStats = {
  exists: boolean;
  summary: {
    totalCodes: number;
    totalVisits: number;
    totalOrders: number;
    last7Days: number;
    last30Days: number;
    conversionRate: number;
  } | null;
  topAlbums: { albumId: number; albumName: string; totalCodes: number; totalVisits: number; totalOrders: number }[];
  topCodes: { code: string; label: string; albumId: number; albumName: string; totalVisits: number; totalOrders: number }[];
};

type FavoritesStats = {
  exists: boolean;
  summary: {
    totalFavorites: number;
    last7Days: number;
    last30Days: number;
    uniqueSessions: number;
    emailCaptures: number;
  } | null;
  conversion: {
    totalFavoritedPhotos: number;
    purchasedFavoritedPhotos: number;
    rate: number;
  } | null;
  topPhotos: { photoId: number; fileName: string; playerNames?: string; albumName: string; albumId: number; favoriteCount: number }[];
  topAlbums: { albumId: number; albumName: string; favoriteCount: number; uniquePhotos: number; uniqueSessions: number }[];
  topPlayers: { playerNames: string; favoriteCount: number; uniquePhotos: number; uniqueSessions: number }[];
  watchlist?: {
    summary: { totalWatches: number; uniqueWatchers: number; uniquePlayers: number; last7Days: number; last30Days: number } | null;
    topPlayers: { playerName: string; watcherCount: number }[];
    topSchools: { schoolName: string; watcherCount: number }[];
    topCategories: { category: string; watcherCount: number }[];
  };
};

const AdminDashboard: React.FC = () => {
  // Customers with Cart state
  const [customersWithCart, setCustomersWithCart] = useState<number | null>(null);
  const [customersWithCartLoading, setCustomersWithCartLoading] = useState(false);
  const [customersWithCartError, setCustomersWithCartError] = useState('');
  const [pendingTagCounts, setPendingTagCounts] = useState<Record<string, number>>({});
  const [pendingTagCountsLoading, setPendingTagCountsLoading] = useState(false);
  const [pendingTagCountsError, setPendingTagCountsError] = useState('');

  useEffect(() => {
    const fetchCustomersWithCart = async () => {
      setCustomersWithCartLoading(true);
      setCustomersWithCartError('');
      try {
        const res = await api.get('/studio-dashboard/customers-with-cart');
        setCustomersWithCart(res.data.count ?? 0);
      } catch (err) {
        setCustomersWithCartError('Failed to load cart data');
      } finally {
        setCustomersWithCartLoading(false);
      }
    };

    const fetchPendingTagCounts = async () => {
      setPendingTagCountsLoading(true);
      setPendingTagCountsError('');
      try {
        const counts = await photoService.getPendingTagSuggestionCounts();
        setPendingTagCounts(counts || {});
      } catch (err) {
        setPendingTagCounts({});
        setPendingTagCountsError('Unable to load player tag review queue');
      } finally {
        setPendingTagCountsLoading(false);
      }
    };

    const fetchFavStats = async () => {
      try {
        const res = await api.get('/admin/favorites-stats');
        setFavStats(res.data || null);
      } catch {
        setFavStats(null);
      }
    };

    const fetchShareStats = async () => {
      try {
        const res = await api.get('/admin/share-stats');
        setShareStats(res.data || null);
      } catch {
        setShareStats(null);
      }
    };

    const fetchPackageStats = async () => {
      try {
        const res = await api.get('/admin/package-stats');
        setPackageStats(res.data || null);
      } catch {
        setPackageStats(null);
      }
    };

    fetchCustomersWithCart();
    fetchPendingTagCounts();
    fetchFavStats();
    fetchShareStats();
    fetchPackageStats();
  }, []);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setAnalyticsLoading] = useState(false);
  const [favStats, setFavStats] = useState<FavoritesStats | null>(null);
  const [shareStats, setShareStats] = useState<ShareStats | null>(null);
  const [packageStats, setPackageStats] = useState<PackageStats | null>(null);
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
  const totalTax = Number(stats.revenueComposition?.totalTax || 0);
  const totalRevenue = Number(stats.totalRevenue || 0);
  const totalRevenueExTax = Math.max(0, totalRevenue - totalTax);
  const bookingRevenue = Number(stats.schedulingStats?.bookingRevenue ?? 0);
  const bookingStripeFees = Number(stats.schedulingStats?.bookingStripeFees ?? 0);
  const bookingPlatformFees = Number(stats.schedulingStats?.platformFees ?? 0);
  const totalCombinedRevenue = totalRevenueExTax + bookingRevenue;
  const totalBaseCost = Number(stats.grossMarginBreakdown?.totalBaseRevenue || 0);
  const totalShippingMargin = Number(stats.grossMarginBreakdown?.totalShippingMargin || 0);
  const totalStripeFees = Number(stats.grossMarginBreakdown?.totalStripeFees || 0);
  const totalMargin = totalRevenueExTax - totalBaseCost + totalShippingMargin - totalStripeFees
    + bookingRevenue - bookingStripeFees - bookingPlatformFees;
  const avgRevenuePerOrder = stats.totalOrders ? (totalRevenueExTax / stats.totalOrders) : 0;
  const avgMarginPerOrder = stats.totalOrders ? (totalMargin / stats.totalOrders) : 0;
  const revenueSeries = stats.revenueSeries?.[revenueRange] || { labels: [], data: [] };
  const taxSeriesForRevenue = stats.taxSeries?.[revenueRange] || { labels: [], data: [] };
  const taxByLabelForRevenue = new Map<string, number>();
  taxSeriesForRevenue.labels.forEach((label, idx) => {
    taxByLabelForRevenue.set(label, Number(taxSeriesForRevenue.data[idx] || 0));
  });
  const revenueExTaxSeries = {
    labels: revenueSeries.labels,
    data: revenueSeries.labels.map((label, idx) => Math.max(0, Number(revenueSeries.data[idx] || 0) - Number(taxByLabelForRevenue.get(label) || 0))),
  };
  const pendingTagTotal = Object.values(pendingTagCounts).reduce((sum, count) => sum + Number(count || 0), 0);
  const pendingTagAlbumCount = Object.values(pendingTagCounts).filter((count) => Number(count || 0) > 0).length;

  return (
    <AdminLayout>
      <div className="page-header">
        <h1 className="gradient-text">Admin Dashboard</h1>
        <p className="admin-dashboard-subtitle">
          Business overview, stats, and recent activity for your studio.
        </p>
      </div>

      <StudioOnboardingChecklist />

      <div className="dashboard-widget tallydark-card admin-dashboard-widget" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h2 className="admin-dashboard-section-title" style={{ margin: 0 }}>👤 Player Tag Review</h2>
            <div className="dashboard-card-sub" style={{ marginTop: 4 }}>Customer-submitted player tags waiting for studio review.</div>
          </div>
          <a className="dashboard-pill" href="/admin/albums" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Open Albums Review</a>
        </div>
        <div className="admin-dashboard-analytics-stats">
          <div className="admin-dashboard-analytics-stat">
            <div className="admin-dashboard-analytics-value" style={{ color: pendingTagTotal > 0 ? '#fbbf24' : undefined }}>
              {pendingTagCountsLoading ? 'Loading...' : pendingTagCountsError ? '—' : pendingTagTotal}
            </div>
            <div className="admin-dashboard-analytics-label">Pending Tags</div>
          </div>
          <div className="admin-dashboard-analytics-stat">
            <div className="admin-dashboard-analytics-value">{pendingTagAlbumCount}</div>
            <div className="admin-dashboard-analytics-label">Affected Albums</div>
          </div>
          <div className="admin-dashboard-analytics-stat" style={{ alignItems: 'flex-start' }}>
            <div className="admin-dashboard-analytics-value" style={{ fontSize: 18, lineHeight: 1.3, textAlign: 'left' }}>Why it matters</div>
            <div className="dashboard-card-sub" style={{ textAlign: 'left', marginTop: 6, lineHeight: 1.5 }}>
              Review suggestions before they’re applied to photos so tag data stays accurate and studio-owned.
            </div>
          </div>
        </div>
        {pendingTagCountsError && !pendingTagCountsLoading && (
          <div className="error-message" style={{ marginTop: 12 }}>{pendingTagCountsError}</div>
        )}
      </div>

      <div className="dashboard-metrics tallydark-metrics admin-dashboard-metrics">

          {/* ...other dashboard cards... */}
                <div className="dashboard-card tallydark-card admin-dashboard-card" role="region" tabIndex={0}>
                  <div className="dashboard-card-label">Customers With Products In Cart</div>
                  <div className="dashboard-card-value" style={{ fontSize: 32, fontWeight: 700, color: 'var(--primary-color)' }}>
                    {customersWithCartLoading ? (
                      <span style={{ color: 'var(--text-secondary)' }}>Loading...</span>
                    ) : customersWithCartError ? (
                      <span style={{ color: 'var(--error-color)' }}>{customersWithCartError}</span>
                    ) : (
                      <span>{customersWithCart ?? 0}</span>
                    )}
                  </div>
                  <div className="dashboard-card-sub">
                    <span style={{ fontSize: 18, color: 'var(--text-secondary)' }}>{customersWithCart === 1 ? 'customer has' : 'customers have'} products in their cart</span>
                  </div>
                </div>
        <div className="dashboard-card tallydark-card admin-dashboard-card admin-dashboard-card--revenue" role="region" tabIndex={0}>
          <div className="dashboard-card-label">Total Revenue</div>
          <div className="dashboard-card-value revenue admin-dashboard-revenue-value">
            <span className="admin-dashboard-revenue-total">${totalCombinedRevenue.toFixed(2)}</span>
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
                  <div style={{ marginTop: 2 }}>= Gross: ${Number(stats.revenueComposition.recomputedTotal || 0).toFixed(2)}</div>
                  <div style={{ marginTop: 2 }}>= Revenue (ex Tax): ${totalRevenueExTax.toFixed(2)}</div>
                  {bookingRevenue > 0 && <div style={{ marginTop: 2 }}>+ Booking revenue: ${bookingRevenue.toFixed(2)}</div>}
                </div>
              )}
              {!!stats.grossMarginBreakdown && (
                <div className="dashboard-card-sub" style={{ marginTop: 6, lineHeight: 1.35 }}>
                  <div style={{ opacity: 0.9 }}>Gross Margin (custom logic):</div>
                  <div>Revenue (ex Tax): ${totalRevenueExTax.toFixed(2)}</div>
                  <div>- Base Cost: ${totalBaseCost.toFixed(2)}</div>
                  <div>+ Shipping Margin: ${totalShippingMargin.toFixed(2)}</div>
                  <div>- Stripe Fees: ${totalStripeFees.toFixed(2)} (orders)</div>
                  {bookingRevenue > 0 && <div>+ Bookings: ${bookingRevenue.toFixed(2)} − ${bookingStripeFees.toFixed(2)} stripe − ${bookingPlatformFees.toFixed(2)} platform</div>}
                  <div style={{ marginTop: 2 }}>= Margin: ${totalMargin.toFixed(2)}</div>
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
            data={revenueExTaxSeries.data}
            labels={revenueExTaxSeries.labels}
            label="Revenue (ex tax)"
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

        <div className="dashboard-card tallydark-card admin-dashboard-card">
          <div className="dashboard-card-label"><Link to="/admin/scheduling" style={{ color: 'inherit', textDecoration: 'none' }}>📅 Bookings ↗</Link></div>
          <div className="dashboard-card-value">{stats.schedulingStats?.totalBookings ?? 0}</div>
          <div className="dashboard-card-sub">{stats.schedulingStats?.upcomingBookings ?? 0} upcoming · {stats.schedulingStats?.approvedBookings ?? 0} approved</div>
          {(stats.schedulingStats?.pendingBookings ?? 0) > 0 && (
            <div style={{ marginTop: 8, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '6px 10px', fontSize: '0.8rem', color: '#f59e0b', fontWeight: 700 }}>
              {stats.schedulingStats!.pendingBookings} pending review
            </div>
          )}
          {(stats.schedulingStats?.upcomingBookingsList?.length ?? 0) > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: '0.75rem', color: '#6b6b80', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Upcoming</div>
              {stats.schedulingStats!.upcomingBookingsList.map(bk => (
                <div key={bk.id} style={{ background: 'rgba(124,92,255,0.07)', border: '1px solid rgba(124,92,255,0.18)', borderRadius: 8, padding: '7px 10px', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: '#a78bfa', fontWeight: 700 }}>
                      {bk.slotDate ? new Date(bk.slotDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                      {bk.startTime ? ` · ${bk.startTime}` : ''}
                    </span>
                    {bk.paymentStatus === 'paid' && <span style={{ fontSize: '0.7rem', background: 'rgba(34,197,94,0.12)', color: '#22c55e', borderRadius: 4, padding: '1px 5px' }}>paid</span>}
                  </div>
                  <div style={{ color: '#e0e0f0', marginTop: 2 }}>{bk.customerName}</div>
                  {bk.sessionTypeName && <div style={{ color: '#6b6b80', fontSize: '0.75rem' }}>{bk.sessionTypeName}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dashboard-card tallydark-card admin-dashboard-card">
          <div className="dashboard-card-label"><Link to="/admin/scheduling" style={{ color: 'inherit', textDecoration: 'none' }}>💳 Booking Revenue ↗</Link></div>
          <div className="dashboard-card-value">${bookingRevenue.toFixed(2)}</div>
          <div className="dashboard-card-sub">From paid session bookings</div>
          <div style={{ marginTop: 10, fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b6b80' }}>
              <span>Stripe fees (est.)</span>
              <span style={{ color: '#f59e0b' }}>−${bookingStripeFees.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b6b80' }}>
              <span>Platform fees</span>
              <span style={{ color: '#f59e0b' }}>−${bookingPlatformFees.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#bdbdbd', fontWeight: 700, borderTop: '1px solid #3a3656', paddingTop: 4 }}>
              <span>Studio payout</span>
              <span style={{ color: '#22c55e' }}>${Number(stats.schedulingStats?.studioPayouts ?? 0).toFixed(2)}</span>
            </div>
          </div>
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

      {/* ── Favorites ─────────────────────────────────────────────────── */}
      {favStats?.exists && favStats.summary && (
        <div className="dashboard-widget tallydark-card admin-dashboard-widget">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '1rem' }}>
            <span style={{ fontSize: '1.1rem' }}>❤️</span>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#4a4a6a', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Favorites</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(124,92,255,0.12)', marginLeft: '0.3rem' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
            {[
              { label: 'Total Saved', value: favStats.summary.totalFavorites.toLocaleString(), color: '#f472b6' },
              { label: 'Last 7 Days', value: `+${favStats.summary.last7Days.toLocaleString()}`, color: '#c4b5fd' },
              { label: 'Last 30 Days', value: `+${favStats.summary.last30Days.toLocaleString()}`, color: '#c4b5fd' },
              { label: 'Unique Sessions', value: favStats.summary.uniqueSessions.toLocaleString(), color: '#7ee787' },
              { label: 'Email Captures', value: favStats.summary.emailCaptures.toLocaleString(), color: '#ffa657' },
              {
                label: 'Conversion Rate',
                value: `${favStats.conversion?.rate ?? 0}%`,
                color: '#58d8a3',
                sub: `${favStats.conversion?.purchasedFavoritedPhotos ?? 0} of ${favStats.conversion?.totalFavoritedPhotos ?? 0} photos purchased`,
              },
            ].map(({ label, value, color, sub }) => (
              <div key={label} className="admin-dashboard-card" style={{ padding: '1rem 1.1rem' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#8b8ba0', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{value}</div>
                {sub && <div style={{ fontSize: '0.72rem', color: '#5a5a72', marginTop: 2 }}>{sub}</div>}
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.85rem' }}>
            <div className="admin-dashboard-card" style={{ padding: '1rem 1.1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#8b8ba0', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>📸 Top Favorited Photos</div>
              {favStats.topPhotos.length === 0 ? (
                <div style={{ color: '#5a5a72', fontSize: '0.82rem' }}>No data yet</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {favStats.topPhotos.map((p) => (
                    <div key={p.photoId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <img src={`/api/photos/${p.photoId}/asset?variant=thumbnail`} alt={p.fileName} style={{ width: 38, height: 38, objectFit: 'cover', borderRadius: 6, flexShrink: 0, border: '1px solid rgba(124,92,255,0.2)' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', color: '#c9c9e0', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.playerNames || p.fileName}</div>
                        <div style={{ fontSize: '0.7rem', color: '#5a5a72', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.albumName}</div>
                      </div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#f472b6', flexShrink: 0 }}>❤️ {p.favoriteCount}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="admin-dashboard-card" style={{ padding: '1rem 1.1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#8b8ba0', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>📂 Top Favorited Albums</div>
              {favStats.topAlbums.length === 0 ? (
                <div style={{ color: '#5a5a72', fontSize: '0.82rem' }}>No data yet</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {favStats.topAlbums.map((a) => (
                    <div key={a.albumId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', color: '#c9c9e0', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.albumName}</div>
                        <div style={{ fontSize: '0.7rem', color: '#5a5a72' }}>{a.uniquePhotos} photos · {a.uniqueSessions} sessions</div>
                      </div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#f472b6', flexShrink: 0 }}>❤️ {a.favoriteCount}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="admin-dashboard-card" style={{ padding: '1rem 1.1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#8b8ba0', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>🏅 Top Favorited Players</div>
              {favStats.topPlayers.length === 0 ? (
                <div style={{ color: '#5a5a72', fontSize: '0.82rem' }}>No data yet</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {favStats.topPlayers.map((p, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(124,92,255,0.15)', border: '1px solid rgba(124,92,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, color: '#c4b5fd', flexShrink: 0 }}>{i + 1}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', color: '#c9c9e0', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.playerNames}</div>
                        <div style={{ fontSize: '0.7rem', color: '#5a5a72' }}>{p.uniquePhotos} photos · {p.uniqueSessions} sessions</div>
                      </div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#f472b6', flexShrink: 0 }}>❤️ {p.favoriteCount}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Watchlists ─────────────────────────────────────────────── */}
          {favStats?.watchlist && (favStats.watchlist.topPlayers.length > 0 || favStats.watchlist.topSchools.length > 0) && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', margin: '1.25rem 0 0.75rem' }}>
                <span style={{ fontSize: '1rem' }}>👁️</span>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#4a4a6a', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Tracked Players &amp; Schools</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(124,92,255,0.12)', marginLeft: '0.3rem' }} />
              </div>

              {favStats.watchlist.summary && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: '0.85rem', marginBottom: '1rem' }}>
                  {[
                    { label: 'Total Watches', value: favStats.watchlist.summary.totalWatches.toLocaleString(), color: '#7dd3fc' },
                    { label: 'Unique Watchers', value: favStats.watchlist.summary.uniqueWatchers.toLocaleString(), color: '#c4b5fd' },
                    { label: 'Unique Players', value: favStats.watchlist.summary.uniquePlayers.toLocaleString(), color: '#7ee787' },
                    { label: 'Last 7 Days', value: `+${favStats.watchlist.summary.last7Days.toLocaleString()}`, color: '#c4b5fd' },
                    { label: 'Last 30 Days', value: `+${favStats.watchlist.summary.last30Days.toLocaleString()}`, color: '#c4b5fd' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="admin-dashboard-card" style={{ padding: '1rem 1.1rem' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#8b8ba0', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: '1.6rem', fontWeight: 800, color, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{value}</div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.85rem' }}>
                {favStats.watchlist.topPlayers.length > 0 && (
                  <div className="admin-dashboard-card" style={{ padding: '1rem 1.1rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#8b8ba0', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>🏃 Top Watched Players</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {favStats.watchlist.topPlayers.map((p, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(125,211,252,0.12)', border: '1px solid rgba(125,211,252,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, color: '#7dd3fc', flexShrink: 0 }}>{i + 1}</div>
                          <div style={{ flex: 1, minWidth: 0, fontSize: '0.8rem', color: '#c9c9e0', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.playerName}</div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#7dd3fc', flexShrink: 0 }}>{p.watcherCount} watchers</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {favStats.watchlist.topSchools.length > 0 && (
                  <div className="admin-dashboard-card" style={{ padding: '1rem 1.1rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#8b8ba0', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>🏫 Top Watched Schools</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {favStats.watchlist.topSchools.map((s, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(125,211,252,0.12)', border: '1px solid rgba(125,211,252,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, color: '#7dd3fc', flexShrink: 0 }}>{i + 1}</div>
                          <div style={{ flex: 1, minWidth: 0, fontSize: '0.8rem', color: '#c9c9e0', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.schoolName}</div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#7dd3fc', flexShrink: 0 }}>{s.watcherCount} watchers</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {favStats.watchlist.topCategories.length > 0 && (
                  <div className="admin-dashboard-card" style={{ padding: '1rem 1.1rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#8b8ba0', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>🏷️ Top Watched Categories</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {favStats.watchlist.topCategories.map((c, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(125,211,252,0.12)', border: '1px solid rgba(125,211,252,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, color: '#7dd3fc', flexShrink: 0 }}>{i + 1}</div>
                          <div style={{ flex: 1, minWidth: 0, fontSize: '0.8rem', color: '#c9c9e0', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.category}</div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#7dd3fc', flexShrink: 0 }}>{c.watcherCount} watchers</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Package Sales ────────────────────────────────────────────── */}
      {packageStats?.exists && packageStats.summary && packageStats.summary.ordersWithPackages > 0 && (
        <div className="dashboard-widget tallydark-card admin-dashboard-widget">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '1rem' }}>
            <span style={{ fontSize: '1.1rem' }}>📦</span>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#4a4a6a', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Package Sales</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(124,92,255,0.12)', marginLeft: '0.3rem' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
            {[
              { label: 'Orders w/ Packages', value: packageStats.summary.ordersWithPackages.toLocaleString(), color: '#c4b5fd' },
              { label: 'Package Adoption', value: `${packageStats.summary.adoptionRate}%`, color: '#7dd3fc' },
              { label: 'Package Revenue', value: `$${packageStats.summary.packageRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: '#7ee787' },
              { label: 'Individual Revenue', value: `$${packageStats.summary.individualRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: '#ffa657' },
              { label: 'Package Rev Share', value: `${packageStats.summary.packageRevenueShare}%`, color: '#58d8a3' },
            ].map(({ label, value, color }) => (
              <div key={label} className="admin-dashboard-card" style={{ padding: '1rem 1.1rem' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#8b8ba0', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{value}</div>
              </div>
            ))}
          </div>

          {packageStats.topPackages.length > 0 && (
            <div className="admin-dashboard-card" style={{ padding: '1rem 1.1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#8b8ba0', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>📦 Top Packages</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {packageStats.topPackages.map((pkg, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(196,181,253,0.12)', border: '1px solid rgba(196,181,253,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, color: '#c4b5fd', flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.8rem', color: '#c9c9e0', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pkg.packageName}</div>
                      <div style={{ fontSize: '0.7rem', color: '#5a5a72' }}>{pkg.orderCount} order{pkg.orderCount !== 1 ? 's' : ''} · {pkg.totalSold} sold</div>
                    </div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#7ee787', flexShrink: 0 }}>${pkg.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Share Links ──────────────────────────────────────────────── */}
      {shareStats?.exists && shareStats.summary && (
        <div className="dashboard-widget tallydark-card admin-dashboard-widget">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '1rem' }}>
            <span style={{ fontSize: '1.1rem' }}>🔗</span>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#4a4a6a', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Share Links</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(124,92,255,0.12)', marginLeft: '0.3rem' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
            {[
              { label: 'Total Links', value: shareStats.summary.totalCodes.toLocaleString(), color: '#7dd3fc' },
              { label: 'Referral Visits', value: shareStats.summary.totalVisits.toLocaleString(), color: '#c4b5fd' },
              { label: 'Orders via Shares', value: shareStats.summary.totalOrders.toLocaleString(), color: '#7ee787' },
              { label: 'Last 7 Days', value: `+${shareStats.summary.last7Days.toLocaleString()}`, color: '#c4b5fd' },
              { label: 'Last 30 Days', value: `+${shareStats.summary.last30Days.toLocaleString()}`, color: '#c4b5fd' },
              { label: 'Visit → Order Rate', value: `${shareStats.summary.conversionRate}%`, color: '#58d8a3' },
            ].map(({ label, value, color }) => (
              <div key={label} className="admin-dashboard-card" style={{ padding: '1rem 1.1rem' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#8b8ba0', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.85rem' }}>
            {shareStats.topAlbums.length > 0 && (
              <div className="admin-dashboard-card" style={{ padding: '1rem 1.1rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#8b8ba0', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>📂 Top Albums by Shares</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {shareStats.topAlbums.map((a, i) => (
                    <div key={a.albumId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(125,211,252,0.12)', border: '1px solid rgba(125,211,252,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, color: '#7dd3fc', flexShrink: 0 }}>{i + 1}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', color: '#c9c9e0', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <Link to={`/albums/${a.albumId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{a.albumName}</Link>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#5a5a72' }}>{a.totalCodes} link{a.totalCodes !== 1 ? 's' : ''} · {a.totalOrders} order{a.totalOrders !== 1 ? 's' : ''}</div>
                      </div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#7dd3fc', flexShrink: 0 }}>{a.totalVisits.toLocaleString()} visits</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {shareStats.topCodes.length > 0 && (
              <div className="admin-dashboard-card" style={{ padding: '1rem 1.1rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#8b8ba0', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>🔗 Top Performing Links</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {shareStats.topCodes.map((c, i) => (
                    <div key={c.code} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(125,211,252,0.12)', border: '1px solid rgba(125,211,252,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, color: '#7dd3fc', flexShrink: 0 }}>{i + 1}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', color: '#c9c9e0', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {c.label || c.code}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#5a5a72', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.albumName} · {c.totalOrders} order{c.totalOrders !== 1 ? 's' : ''}</div>
                      </div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#7dd3fc', flexShrink: 0 }}>{c.totalVisits.toLocaleString()} visits</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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