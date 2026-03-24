
import React from 'react';
import AdminLayout from '../../components/AdminLayout';
import '../../PhotoLabStyles.css';

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
    <div className="admin-page dark-bg" style={{ minHeight: '100vh', padding: '0 0 2rem 0' }}>
      <div className="page-header">
        <h1 className="gradient-text">🏢 Studio Admin Dashboard</h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Studio-level business overview, analytics, and revenue/profit breakdowns.
        </p>
      </div>
      {/* Key Metrics */}
      <div className="dashboard-metrics">
        <div className="dashboard-card dashboard-card-revenue dark-card">
          <div>
            <span className="dashboard-card-icon">💰</span>
            <div className="dashboard-card-label">Total Revenue</div>
            <div className="dashboard-card-value">${displayTotalRevenue.toFixed(2)}</div>
            <div className="dashboard-card-sub">Avg: ${averageOrderValue} per order</div>
            <span className="dashboard-card-link">View revenue details →</span>
          </div>
        </div>
        <div role="button" tabIndex={0} className="dashboard-card dashboard-card-orders dark-card">
          <div>
            <span className="dashboard-card-icon">📦</span>
            <div className="dashboard-card-label">Total Orders</div>
            <div className="dashboard-card-value">{displayTotalOrders}</div>
            <div className="dashboard-card-sub">{orderCompletionRate}% completion rate</div>
            <span className="dashboard-card-link">Go to orders →</span>
          </div>
        </div>
        <div role="button" tabIndex={0} className="dashboard-card dashboard-card-customers dark-card">
          <div>
            <span className="dashboard-card-icon">👥</span>
            <div className="dashboard-card-label">Total Customers</div>
            <div className="dashboard-card-value">{stats?.totalCustomers || 0}</div>
            <div className="dashboard-card-sub">Active user accounts</div>
            <span className="dashboard-card-link">View customers →</span>
          </div>
        </div>
        <div role="button" tabIndex={0} className="dashboard-card dashboard-card-pending dark-card">
          <div>
            <span className="dashboard-card-icon">⏳</span>
            <div className="dashboard-card-label">Pending Orders</div>
            <div className="dashboard-card-value">{stats?.pendingOrders || 0}</div>
            <div className="dashboard-card-sub">Requires attention</div>
            <span className="dashboard-card-link">Review pending →</span>
          </div>
        </div>
        <div className="dashboard-card dashboard-card-profit dark-card">
          <div>
            <span className="dashboard-card-icon">📈</span>
            <div className="dashboard-card-label">Total Profit</div>
            <div className="dashboard-card-value">${profitData.profit.toFixed(2)}</div>
            <div className="dashboard-card-sub">{profitData.margin}% margin</div>
            <span className="dashboard-card-link">See profit details →</span>
          </div>
        </div>
      </div>
      {/* Minimal placeholder for additional widgets/sections */}
      <div className="dashboard-widgets-row">
        <div className="dashboard-widget dark-card">
          <h2>Analytics Overview</h2>
          <div>Put analytics widgets here.</div>
        </div>
        <div className="dashboard-widget dark-card">
          <h2>Order Status</h2>
          <div>Put order status widgets here.</div>
        </div>
      </div>
    </div>
  </AdminLayout>
);
}

export default StudioAdminDashboard;