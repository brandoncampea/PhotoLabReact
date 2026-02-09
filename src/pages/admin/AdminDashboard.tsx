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
        const totalPageViews = (summary.albumViews || 0) + (summary.photoViews || 0) + (summary.totalVisits || 0);
        setAnalytics({
          totalVisitors: summary.totalVisits || 0,
          totalPageViews,
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
        <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.5rem' }}>
          Welcome back! Here's what's happening with your business today.
        </p>
      </div>


      
      {/* Key Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate('/admin/analytics')}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/admin/analytics')}
          style={{
            padding: '1.5rem',
            backgroundColor: '#e3f2fd',
            borderRadius: '12px',
            border: '2px solid #4169E1',
            position: 'relative',
            overflow: 'hidden',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease'
          }}
          className="dashboard-card"
        >
          <div style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '2rem', opacity: 0.2 }}>💰</div>
          <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem', fontWeight: 500 }}>Total Revenue</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#4169E1' }}>
            ${stats?.totalRevenue.toFixed(2) || '0.00'}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.5rem' }}>
            Avg: ${averageOrderValue} per order
          </div>
          <div style={{ fontSize: '0.8rem', color: '#4169E1', marginTop: '0.75rem', fontWeight: 600 }}>View analytics →</div>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate('/admin/orders')}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/admin/orders')}
          style={{
            padding: '1.5rem',
            backgroundColor: '#e8f5e9',
            borderRadius: '12px',
            border: '2px solid #4caf50',
            position: 'relative',
            overflow: 'hidden',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease'
          }}
          className="dashboard-card"
        >
          <div style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '2rem', opacity: 0.2 }}>📦</div>
          <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem', fontWeight: 500 }}>Total Orders</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#4caf50' }}>
            {stats?.totalOrders || 0}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.5rem' }}>
            {orderCompletionRate}% completion rate
          </div>
          <div style={{ fontSize: '0.8rem', color: '#2e7d32', marginTop: '0.75rem', fontWeight: 600 }}>Go to orders →</div>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate('/admin/customers')}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/admin/customers')}
          style={{
            padding: '1.5rem',
            backgroundColor: '#f3e5f5',
            borderRadius: '12px',
            border: '2px solid #9c27b0',
            position: 'relative',
            overflow: 'hidden',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease'
          }}
          className="dashboard-card"
        >
          <div style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '2rem', opacity: 0.2 }}>👥</div>
          <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem', fontWeight: 500 }}>Total Customers</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#9c27b0' }}>
            {stats?.totalCustomers || 0}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.5rem' }}>
            Active user accounts
          </div>
          <div style={{ fontSize: '0.8rem', color: '#7b1fa2', marginTop: '0.75rem', fontWeight: 600 }}>View customers →</div>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate('/admin/orders')}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/admin/orders')}
          style={{
            padding: '1.5rem',
            backgroundColor: '#fff3e0',
            borderRadius: '12px',
            border: '2px solid #ff9800',
            position: 'relative',
            overflow: 'hidden',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease'
          }}
          className="dashboard-card"
        >
          <div style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '2rem', opacity: 0.2 }}>⏳</div>
          <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem', fontWeight: 500 }}>Pending Orders</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ff9800' }}>
            {stats?.pendingOrders || 0}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.5rem' }}>
            Requires attention
          </div>
          <div style={{ fontSize: '0.8rem', color: '#ef6c00', marginTop: '0.75rem', fontWeight: 600 }}>Review pending →</div>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate('/admin/analytics')}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/admin/analytics')}
          style={{
            padding: '1.5rem',
            backgroundColor: '#f1f8e9',
            borderRadius: '12px',
            border: '2px solid #689f38',
            position: 'relative',
            overflow: 'hidden',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease'
          }}
          className="dashboard-card"
        >
          <div style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '2rem', opacity: 0.2 }}>📈</div>
          <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem', fontWeight: 500 }}>Total Profit</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#689f38' }}>
            ${profitData.profit.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.5rem' }}>
            {profitData.margin}% margin
          </div>
          <div style={{ fontSize: '0.8rem', color: '#558b2f', marginTop: '0.75rem', fontWeight: 600 }}>See profit details →</div>
        </div>
      </div>

      {/* Analytics Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
        {/* Visitor Stats */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '1.5rem',
          border: '1px solid #e0e0e0'
        }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>📈</span> Traffic Overview
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem' }}>Total Visitors</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#4169E1' }}>{analytics?.totalVisitors || 0}</div>
            </div>
            <div style={{ padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem' }}>Page Views</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#9c27b0' }}>{analytics?.totalPageViews || 0}</div>
            </div>
            <div style={{ padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem' }}>Albums Viewed</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#4caf50' }}>{analytics?.albumViews || 0}</div>
            </div>
            <div style={{ padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem' }}>Photos Viewed</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#ff9800' }}>{analytics?.photoViews || 0}</div>
            </div>
          </div>
        </div>

        {/* Order Status Breakdown */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '1.5rem',
          border: '1px solid #e0e0e0'
        }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>📊</span> Order Status
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Completed Orders Bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                <span style={{ fontWeight: 500 }}>Completed</span>
                <span style={{ color: '#666' }}>{stats?.totalOrders ? stats.totalOrders - stats.pendingOrders : 0}</span>
              </div>
              <div style={{ height: '24px', backgroundColor: '#e0e0e0', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${stats?.totalOrders ? ((stats.totalOrders - stats.pendingOrders) / stats.totalOrders * 100) : 0}%`,
                  backgroundColor: '#4caf50',
                  transition: 'width 0.3s ease'
                }}></div>
              </div>
            </div>

            {/* Pending Orders Bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                <span style={{ fontWeight: 500 }}>Pending</span>
                <span style={{ color: '#666' }}>{stats?.pendingOrders || 0}</span>
              </div>
              <div style={{ height: '24px', backgroundColor: '#e0e0e0', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${stats?.totalOrders ? (stats.pendingOrders / stats.totalOrders * 100) : 0}%`,
                  backgroundColor: '#ff9800',
                  transition: 'width 0.3s ease'
                }}></div>
              </div>
            </div>

            {/* Completion Rate Circle */}
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <svg width="120" height="120">
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="#e0e0e0"
                    strokeWidth="10"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="#4caf50"
                    strokeWidth="10"
                    strokeDasharray={`${2 * Math.PI * 50 * parseFloat(orderCompletionRate) / 100} ${2 * Math.PI * 50}`}
                    strokeLinecap="round"
                    transform="rotate(-90 60 60)"
                  />
                  <text x="60" y="60" textAnchor="middle" dy=".3em" style={{ fontSize: '1.5rem', fontWeight: 'bold', fill: '#4caf50' }}>
                    {orderCompletionRate}%
                  </text>
                </svg>
                <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.5rem' }}>Completion Rate</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Albums */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '1.5rem',
          border: '1px solid #e0e0e0'
        }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🔥</span> Most Popular Albums
          </h2>
          {!stats?.topAlbums || stats.topAlbums.length === 0 ? (
            <p style={{ color: '#999', fontStyle: 'italic', textAlign: 'center', padding: '2rem' }}>
              No album orders yet. Sales will appear here once customers purchase.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
              {stats.topAlbums.slice(0, 6).map((entry) => (
                <div key={entry.album.id} style={{
                  padding: '1rem',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '8px',
                  border: '2px solid #e0e0e0',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}>
                  <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem' }}>📁 {entry.album.name}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#4169E1' }}>{entry.orderCount}</div>
                  <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem' }}>orders</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '1.5rem',
        border: '1px solid #e0e0e0'
      }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>⚡</span> Quick Actions
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <a href="/admin/orders" className="btn btn-primary" style={{ textDecoration: 'none', textAlign: 'center' }}>
            📦 Manage Orders
          </a>
          <a href="/admin/albums" className="btn btn-primary" style={{ textDecoration: 'none', textAlign: 'center' }}>
            📁 Manage Albums
          </a>
          <a href="/admin/products" className="btn btn-primary" style={{ textDecoration: 'none', textAlign: 'center' }}>
            🛍️ Manage Products
          </a>
          <a href="/admin/customers" className="btn btn-primary" style={{ textDecoration: 'none', textAlign: 'center' }}>
            👥 View Customers
          </a>
          <a href="/admin/analytics" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>
            📈 View Analytics
          </a>
          <a href="/admin/shipping" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>
            🚚 Shipping Settings
          </a>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
