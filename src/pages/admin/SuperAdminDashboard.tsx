

import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Order, DashboardStats } from '../../types';
import { analyticsService } from '../../services/analyticsService';
import { orderService } from '../../services/orderService';
import { userAdminService } from '../../services/adminService';
import { albumService } from '../../services/albumService';
// ...existing code...
import '../../PhotoLabStyles.css';

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

interface RevenueByAlbum {
  albumId: number;
  albumName: string;
  revenue: number;
  cost: number;
  profit: number;
  quantity: number;
  orderCount: number;
}

interface RevenueByPhoto {
  photoId: number;
  albumId: number;
  photoName: string;
  revenue: number;
  cost: number;
  profit: number;
  quantity: number;
  orderCount: number;
}

const SuperAdminDashboard: React.FC = () => {
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
  const [analytics, setAnalytics] = useState<{ totalVisitors: number; totalPageViews: number; albumViews: number; photoViews: number } | null>(null);

  useEffect(() => {
    loadStats();
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
      const customers = customersResult.status === 'fulfilled' ? customersResult.value : [];
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

  const displayTotalRevenue = stats?.totalRevenue || 0;
  const displayTotalOrders = stats?.totalOrders || 0;
  const orderCompletionRate = displayTotalOrders
    ? ((displayTotalOrders - (stats?.pendingOrders || 0)) / displayTotalOrders * 100).toFixed(1)
    : '0';
  const averageOrderValue = displayTotalOrders
    ? (displayTotalRevenue / displayTotalOrders).toFixed(2)
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

  const loadRevenueBreakdown = async () => {
    try {
      setRevenueBreakdownLoading(true);
      const data = await analyticsService.getRevenueBreakdown();
      setRevenueBreakdown(data);
      setSelectedAlbumId(data.byAlbum?.[0]?.albumId || null);
      setRevenueBreakdownError('');
    } catch (error) {
      console.error('Failed to load revenue breakdown:', error);
      setRevenueBreakdownError('Failed to load revenue details');
    } finally {
      setRevenueBreakdownLoading(false);
    }
  };

  const openRevenueModal = async (focus: 'revenue' | 'profit') => {
    setRevenueFocus(focus);
    setShowRevenueModal(true);
    await loadRevenueBreakdown();
  };

  const formatCurrency = (value: number) => `$${value.toFixed(2)}`;
  const albumPhotos = revenueBreakdown?.byPhoto.filter((photo) => photo.albumId === selectedAlbumId) || [];
  const selectedAlbum = revenueBreakdown?.byAlbum.find((album) => album.albumId === selectedAlbumId) || null;

  return (
    <div className="admin-page dark-bg" style={{ minHeight: '100vh', padding: '0 0 2rem 0' }}>
      <div className="page-header">
        <h1 className="gradient-text" data-testid="superadmin-dashboard-heading">🛡️ Super Admin Dashboard</h1>
        <input
          type="text"
          placeholder="Search..."
          className="superadmin-dashboard-search dark-card"
          data-testid="superadmin-dashboard-search"
        />

        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Global business overview and advanced analytics for all labs and studios.
        </p>
      </div>
      {/* Key Metrics */}
      <div className="dashboard-metrics">
        <div
          role="button"
          tabIndex={0}
          onClick={() => openRevenueModal('revenue')}
          onKeyDown={(e) => e.key === 'Enter' && openRevenueModal('revenue')}
          className="dashboard-card dashboard-card-revenue dark-card"
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
          className="dashboard-card dashboard-card-orders dark-card"
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
          className="dashboard-card dashboard-card-customers dark-card"
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
          className="dashboard-card dashboard-card-pending dark-card"
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
          className="dashboard-card dashboard-card-profit dark-card"
        >
          <span className="dashboard-card-icon">📈</span>
          <div className="dashboard-card-label">Total Profit</div>
          <div className="dashboard-card-value">${profitData.profit.toFixed(2)}</div>
          <div className="dashboard-card-sub">{profitData.margin}% margin</div>
          <span className="dashboard-card-link">See profit details →</span>
        </div>
      </div>
      {/* ...existing dashboard JSX continues here (analytics, tables, etc.)... */}
    </div>
  );
}

export default SuperAdminDashboard;