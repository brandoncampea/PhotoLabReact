



import React, { useEffect, useState } from 'react';

import { DashboardStats } from '../../types';

const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/admin/dashboard-stats');
        if (!response.ok) throw new Error('Failed to fetch dashboard stats');
        const data = await response.json();
        setStats(data);
      } catch (e) {
        // handle error
        setStats(null);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  // Only show real data, no placeholders
  if (!stats) {
    return <div className="loading">No dashboard data available.</div>;
  }

  return (
    <div className="admin-page dark-bg" style={{ minHeight: '100vh', padding: '2rem' }}>
      <div className="page-header">
        <h1 className="gradient-text">Admin Dashboard</h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Business overview, stats, and quick actions for your studio.
        </p>
      </div>

      {/* Key Metrics - Responsive 2 column grid, no mock icons */}
      <div className="dashboard-metrics" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '2.5rem',
        marginBottom: '2.5rem',
        alignItems: 'stretch',
      }}>
        <div
          className="dashboard-card dashboard-card-revenue dark-card"
          role="button"
          tabIndex={0}
          style={{ cursor: 'pointer' }}
          onClick={() => window.location.href = '/admin/analytics'}
          onKeyDown={e => { if (e.key === 'Enter') window.location.href = '/admin/analytics'; }}
        >
          <div className="dashboard-card-label" style={{ fontWeight: 600, fontSize: '1.1rem' }}>Total Revenue</div>
          <div className="dashboard-card-value" style={{ fontSize: '2.2rem', fontWeight: 700 }}>${stats.totalRevenue.toFixed(2)}</div>
          <div className="dashboard-card-sub" style={{ color: '#a78bfa', fontSize: '1rem' }}>Avg: ${stats.totalOrders ? (stats.totalRevenue / stats.totalOrders).toFixed(2) : '0.00'} per order</div>
        </div>
        <div
          className="dashboard-card dashboard-card-orders dark-card"
          role="button"
          tabIndex={0}
          style={{ cursor: 'pointer' }}
          onClick={() => window.location.href = '/admin/orders'}
          onKeyDown={e => { if (e.key === 'Enter') window.location.href = '/admin/orders'; }}
        >
          <div className="dashboard-card-label" style={{ fontWeight: 600, fontSize: '1.1rem' }}>Total Orders</div>
          <div className="dashboard-card-value" style={{ fontSize: '2.2rem', fontWeight: 700 }}>{stats.totalOrders}</div>
          <div className="dashboard-card-sub" style={{ color: '#a78bfa', fontSize: '1rem' }}>{stats.totalOrders ? (((stats.totalOrders - (stats.pendingOrders || 0)) / stats.totalOrders) * 100).toFixed(1) : '0'}% completion rate</div>
        </div>
        <div
          className="dashboard-card dashboard-card-customers dark-card"
          role="button"
          tabIndex={0}
          style={{ cursor: 'pointer' }}
          onClick={() => window.location.href = '/admin/customers'}
          onKeyDown={e => { if (e.key === 'Enter') window.location.href = '/admin/customers'; }}
        >
          <div className="dashboard-card-label" style={{ fontWeight: 600, fontSize: '1.1rem' }}>Total Customers</div>
          <div className="dashboard-card-value" style={{ fontSize: '2.2rem', fontWeight: 700 }}>{stats.totalCustomers}</div>
          <div className="dashboard-card-sub" style={{ color: '#a78bfa', fontSize: '1rem' }}>Active user accounts</div>
        </div>
        <div
          className="dashboard-card dashboard-card-pending dark-card"
          role="button"
          tabIndex={0}
          style={{ cursor: 'pointer' }}
          onClick={() => window.location.href = '/admin/orders?status=pending'}
          onKeyDown={e => { if (e.key === 'Enter') window.location.href = '/admin/orders?status=pending'; }}
        >
          <div className="dashboard-card-label" style={{ fontWeight: 600, fontSize: '1.1rem' }}>Pending Orders</div>
          <div className="dashboard-card-value" style={{ fontSize: '2.2rem', fontWeight: 700 }}>{stats.pendingOrders}</div>
          <div className="dashboard-card-sub" style={{ color: '#a78bfa', fontSize: '1rem' }}>Requires attention</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="dashboard-widget dark-card">
        <h2 style={{ fontWeight: 600, fontSize: '1.1rem' }}>Quick Actions</h2>
        <div className="dashboard-actions-grid">
          <a href="/admin/orders"    className="btn btn-primary"    style={{ textDecoration: 'none', textAlign: 'center' }}>Manage Orders</a>
          <a href="/admin/albums"    className="btn btn-primary"    style={{ textDecoration: 'none', textAlign: 'center' }}>Manage Albums</a>
          <a href="/admin/products"  className="btn btn-primary"    style={{ textDecoration: 'none', textAlign: 'center' }}>Manage Products</a>
          <a href="/admin/customers" className="btn btn-primary"    style={{ textDecoration: 'none', textAlign: 'center' }}>View Customers</a>
          <a href="/admin/analytics" className="btn btn-secondary"  style={{ textDecoration: 'none', textAlign: 'center' }}>View Analytics</a>
          <a href="/admin/shipping"  className="btn btn-secondary"  style={{ textDecoration: 'none', textAlign: 'center' }}>Shipping Settings</a>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;