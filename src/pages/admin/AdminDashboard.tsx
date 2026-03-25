






import React, { useEffect, useState } from 'react';
import DashboardChart from '../../components/DashboardChart';
import AdminLayout from '../../components/AdminLayout';



const AdminDashboard: React.FC = () => {
  // All hooks must be at the top level
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // Chart range state for each widget
  const [revenueRange, setRevenueRange] = useState<'day' | 'week' | 'month'>('month');
  const [ordersRange, setOrdersRange] = useState<'day' | 'week' | 'month'>('month');
  const [customersRange, setCustomersRange] = useState<'day' | 'week' | 'month'>('month');
  const [pendingRange, setPendingRange] = useState<'day' | 'week' | 'month'>('month');

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/admin/dashboard-stats');
        if (!response.ok) throw new Error('Failed to fetch dashboard stats');
        const data = await response.json();
        setStats(data);
      } catch (e) {
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
    <AdminLayout>
      <div className="page-header">
        <h1 className="gradient-text">Admin Dashboard</h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Business overview, stats, and quick actions for your studio.
        </p>
      </div>

      {/* Key Metrics - Responsive 2 column grid, modern card style */}
      <div className="dashboard-metrics tallydark-metrics">
        {/* Revenue Widget */}
        <div className="dashboard-card tallydark-card" role="region" tabIndex={0}>
          {/* Icon removed */}
          <div className="dashboard-card-label">Total Revenue</div>
          <div className="dashboard-card-value">${stats.totalRevenue.toFixed(2)}</div>
          <div className="dashboard-card-sub">Avg: ${stats.totalOrders ? (stats.totalRevenue / stats.totalOrders).toFixed(2) : '0.00'} per order</div>
          {/* Chart controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 0 0' }}>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setRevenueRange('day')} disabled={revenueRange === 'day'}>Day</button>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setRevenueRange('week')} disabled={revenueRange === 'week'}>Week</button>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setRevenueRange('month')} disabled={revenueRange === 'month'}>Month</button>
          </div>
          <DashboardChart
            data={stats.revenueSeries?.[revenueRange]?.data || []}
            labels={stats.revenueSeries?.[revenueRange]?.labels || []}
            label="Revenue"
          />
        </div>
        {/* Orders Widget */}
        <div className="dashboard-card tallydark-card" role="button" tabIndex={0} style={{ cursor: 'pointer' }}
          onClick={() => window.location.href = '/admin/orders'}
          onKeyDown={e => { if (e.key === 'Enter') window.location.href = '/admin/orders'; }}
        >
          {/* Icon removed */}
          <div className="dashboard-card-label">Total Orders</div>
          <div className="dashboard-card-value">{stats.totalOrders}</div>
          <div className="dashboard-card-sub">{stats.totalOrders ? (((stats.totalOrders - (stats.pendingOrders || 0)) / stats.totalOrders) * 100).toFixed(1) : '0'}% completion rate</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 0 0' }}>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setOrdersRange('day')} disabled={ordersRange === 'day'}>Day</button>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setOrdersRange('week')} disabled={ordersRange === 'week'}>Week</button>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setOrdersRange('month')} disabled={ordersRange === 'month'}>Month</button>
          </div>
          <DashboardChart
            data={stats.ordersSeries?.[ordersRange]?.data || []}
            labels={stats.ordersSeries?.[ordersRange]?.labels || []}
            label="Orders"
          />
        </div>
        {/* Customers Widget */}
        <div className="dashboard-card tallydark-card" role="button" tabIndex={0} style={{ cursor: 'pointer' }}
          onClick={() => window.location.href = '/admin/customers'}
          onKeyDown={e => { if (e.key === 'Enter') window.location.href = '/admin/customers'; }}
        >
          {/* Icon removed */}
          <div className="dashboard-card-label">Total Customers</div>
          <div className="dashboard-card-value">{stats.totalCustomers}</div>
          <div className="dashboard-card-sub">Active user accounts</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 0 0' }}>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setCustomersRange('day')} disabled={customersRange === 'day'}>Day</button>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setCustomersRange('week')} disabled={customersRange === 'week'}>Week</button>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setCustomersRange('month')} disabled={customersRange === 'month'}>Month</button>
          </div>
          <DashboardChart
            data={stats.customersSeries?.[customersRange]?.data || []}
            labels={stats.customersSeries?.[customersRange]?.labels || []}
            label="New Customers"
          />
        </div>
        {/* Pending Orders Widget */}
        <div className="dashboard-card tallydark-card" role="button" tabIndex={0} style={{ cursor: 'pointer' }}
          onClick={() => window.location.href = '/admin/orders?status=pending'}
          onKeyDown={e => { if (e.key === 'Enter') window.location.href = '/admin/orders?status=pending'; }}
        >
          {/* Icon removed */}
          <div className="dashboard-card-label">Pending Orders</div>
          <div className="dashboard-card-value">{stats.pendingOrders}</div>
          <div className="dashboard-card-sub">Requires attention</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 0 0' }}>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setPendingRange('day')} disabled={pendingRange === 'day'}>Day</button>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setPendingRange('week')} disabled={pendingRange === 'week'}>Week</button>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setPendingRange('month')} disabled={pendingRange === 'month'}>Month</button>
          </div>
          <DashboardChart
            data={stats.pendingOrdersSeries?.[pendingRange]?.data || []}
            labels={stats.pendingOrdersSeries?.[pendingRange]?.labels || []}
            label="Pending Orders"
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="dashboard-widget tallydark-card" style={{ paddingBottom: '0.5rem' }}>
        <h2 style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.3rem' }}>Quick Actions</h2>
        <div className="dashboard-actions-grid tallydark-actions-grid" style={{ marginBottom: 0 }}>
          <a href="/admin/orders"    className="tallydark-sidenav-btn">Manage Orders</a>
          <a href="/admin/albums"    className="tallydark-sidenav-btn">Manage Albums</a>
          <a href="/admin/products"  className="tallydark-sidenav-btn">Manage Products</a>
          <a href="/admin/customers" className="tallydark-sidenav-btn">View Customers</a>
          <a href="/admin/analytics" className="tallydark-sidenav-btn">View Analytics</a>
          <a href="/admin/shipping"  className="tallydark-sidenav-btn">Shipping</a>
          <a href="/admin/settings"  className="tallydark-sidenav-btn">Settings</a>
        </div>
        </div>
    </AdminLayout>
  );
};

export default AdminDashboard;