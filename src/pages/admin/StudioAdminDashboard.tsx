
import React from 'react';
import AdminLayout from '../../components/AdminLayout';

const StudioAdminDashboard: React.FC = () => {
  // Minimal stub data for metrics
  const stats = { totalRevenue: 0, totalOrders: 0, pendingOrders: 0, totalCustomers: 0 };

  // ...existing code...
  // Move variable declarations after calculateProfit

  // ...existing code...

  // Removed unused analytics effect



  // Only keep the variables actually used in the render
  const displayTotalRevenue = stats.totalRevenue;
  const displayTotalOrders = stats.totalOrders;
  const orderCompletionRate = displayTotalOrders
    ? ((displayTotalOrders - stats.pendingOrders) / displayTotalOrders * 100).toFixed(1)
    : '0';
  const averageOrderValue = displayTotalOrders
    ? (displayTotalRevenue / displayTotalOrders).toFixed(2)
    : '0.00';
  const profitData = {
    profit: 0,
    margin: '0',
  };

 return (
  <AdminLayout>
    <div className="dashboardContainer">
      <h1 className="gradient-text" style={{ marginBottom: '0.5rem' }}>🏢 Studio Admin Dashboard</h1>
      <p className="text-secondary" style={{ marginBottom: '2rem' }}>Studio-level business overview, analytics, and revenue/profit breakdowns.</p>
      <div className="dashboard-metrics">
        <div className="dashboard-card dark-card">
          <span className="dashboard-card-icon">💰</span>
          <div className="dashboard-card-label">Total Revenue</div>
          <div className="dashboard-card-value">${displayTotalRevenue.toFixed(2)}</div>
          <div className="dashboard-card-sub">Avg: ${averageOrderValue} per order</div>
        </div>
        <div className="dashboard-card dark-card">
          <span className="dashboard-card-icon">📦</span>
          <div className="dashboard-card-label">Total Orders</div>
          <div className="dashboard-card-value">{displayTotalOrders}</div>
          <div className="dashboard-card-sub">{orderCompletionRate}% completion rate</div>
        </div>
        <div className="dashboard-card dark-card">
          <span className="dashboard-card-icon">👥</span>
          <div className="dashboard-card-label">Total Customers</div>
          <div className="dashboard-card-value">{stats?.totalCustomers || 0}</div>
          <div className="dashboard-card-sub">Active user accounts</div>
        </div>
        <div className="dashboard-card dark-card">
          <span className="dashboard-card-icon">⏳</span>
          <div className="dashboard-card-label">Pending Orders</div>
          <div className="dashboard-card-value">{stats?.pendingOrders || 0}</div>
          <div className="dashboard-card-sub">Requires attention</div>
        </div>
        <div className="dashboard-card dark-card">
          <span className="dashboard-card-icon">📈</span>
          <div className="dashboard-card-label">Total Profit</div>
          <div className="dashboard-card-value">${profitData.profit.toFixed(2)}</div>
          <div className="dashboard-card-sub">{profitData.margin}% margin</div>
        </div>
      </div>
      <div style={{ marginTop: '2.5rem' }}>
        <div className="dashboard-section-header">Quick Actions</div>
        <div className="dashboard-actions-grid tallydark-actions-grid">
          <a className="tallydark-sidenav-btn" href="/admin/orders">Manage Orders</a>
          <a className="tallydark-sidenav-btn" href="/admin/albums">Manage Albums</a>
          <a className="tallydark-sidenav-btn" href="/admin/products">Manage Products</a>
          <a className="tallydark-sidenav-btn" href="/admin/customers">View Customers</a>
          <a className="tallydark-sidenav-btn" href="/admin/analytics">View Analytics</a>
          <a className="tallydark-sidenav-btn" href="/admin/shipping">Shipping</a>
          <a className="tallydark-sidenav-btn" href="/admin/settings">Settings</a>
        </div>
      </div>
    </div>
  </AdminLayout>
);
}

export default StudioAdminDashboard;