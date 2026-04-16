import React, { useEffect, useState } from "react";
import AdminLayout from "../components/AdminLayout";
import { adminService } from "../services/adminService";

const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await adminService.getDashboardStats();
        setStats(data);
      } catch (err) {
        setError("Failed to load dashboard stats");
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  return (
    <AdminLayout>
      <div className="dashboardContainer">
        <h1 className="gradient-text" style={{ marginBottom: '0.5rem' }}>Admin Dashboard</h1>
        <p className="text-secondary" style={{ marginBottom: '2rem' }}>Business overview, stats, and quick actions for your studio.</p>
        {loading ? (
          <div className="loading">Loading dashboard...</div>
        ) : error ? (
          <div className="error">{error}</div>
        ) : stats ? (
          <div className="dashboard-metrics">
            <div className="dashboard-card dark-card">
              <div className="dashboard-card-label">Total Revenue</div>
              <div className="dashboard-card-value">${stats.totalRevenue?.toFixed(2) ?? '0.00'}</div>
              <div className="dashboard-card-sub">Avg: ${stats.avgOrder?.toFixed(2) ?? '0.00'} per order</div>
            </div>
            <div className="dashboard-card dark-card">
              <div className="dashboard-card-label">Total Orders</div>
              <div className="dashboard-card-value">{stats.totalOrders ?? 0}</div>
              <div className="dashboard-card-sub">{stats.completionRate ?? 0}% completion rate</div>
            </div>
            <div className="dashboard-card dark-card">
              <div className="dashboard-card-label">Total Customers</div>
              <div className="dashboard-card-value">{stats.totalCustomers ?? 0}</div>
              <div className="dashboard-card-sub">Active user accounts</div>
            </div>
            <div className="dashboard-card dark-card">
              <div className="dashboard-card-label">Pending Orders</div>
              <div className="dashboard-card-value">{stats.pendingOrders ?? 0}</div>
              <div className="dashboard-card-sub">Requires attention</div>
            </div>
          </div>
        ) : null}
        <div style={{ marginTop: '2.5rem' }}>
          <div className="dashboard-section-header">Quick Actions</div>
          <div className="dashboard-actions-grid tallydark-actions-grid">
            <a className="tallydark-sidenav-btn" href="#">Manage Orders</a>
            <a className="tallydark-sidenav-btn" href="#">Manage Albums</a>
            <a className="tallydark-sidenav-btn" href="#">Manage Products</a>
            <a className="tallydark-sidenav-btn" href="#">View Customers</a>
            <a className="tallydark-sidenav-btn" href="#">View Analytics</a>
            <a className="tallydark-sidenav-btn" href="#">Shipping Settings</a>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
