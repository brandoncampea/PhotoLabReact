import React, { useEffect, useState } from 'react';
import { adminMockApi } from '../../services/adminMockApi';
import { DashboardStats } from '../../types';

const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const data = await adminMockApi.dashboard.getStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  return (
    <div className="admin-page">
      <h1>Dashboard</h1>
      
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Orders</h3>
          <p className="stat-value">{stats?.totalOrders || 0}</p>
        </div>
        
        <div className="stat-card">
          <h3>Total Revenue</h3>
          <p className="stat-value">${stats?.totalRevenue.toFixed(2) || '0.00'}</p>
        </div>
        
        <div className="stat-card">
          <h3>Total Customers</h3>
          <p className="stat-value">{stats?.totalCustomers || 0}</p>
        </div>
        
        <div className="stat-card stat-warning">
          <h3>Pending Orders</h3>
          <p className="stat-value">{stats?.pendingOrders || 0}</p>
        </div>
      </div>

      <div className="dashboard-section">
        <h2>Quick Actions</h2>
        <div className="action-buttons">
          <a href="/admin/albums" className="btn btn-primary">Manage Albums</a>
          <a href="/admin/products" className="btn btn-primary">Manage Products</a>
          <a href="/admin/orders" className="btn btn-primary">View Orders</a>
          <a href="/admin/customers" className="btn btn-primary">View Customers</a>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
