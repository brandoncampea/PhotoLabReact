import React, { useEffect, useState } from "react";
import AdminLayout from "../components/AdminLayout";

import { orderService } from "../services/orderService";


const AdminDashboard: React.FC = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const data = await orderService.getOrders();
        setOrders(data as any);
      } catch (err) {
        setError("Failed to load orders");
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, []);

  // Calculate stats
  const totalOrders = orders.length;
  const totalRevenue = (orders as any[]).reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const avgOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const pendingOrders = (orders as any[]).filter(o => o.status === 'pending' || o.status === 'created').length;
  const completionRate = totalOrders > 0 ? Math.round(((totalOrders - pendingOrders) / totalOrders) * 100) : 0;

  return (
    <AdminLayout>
      <div className="dashboardContainer">
        <h1 className="gradient-text" style={{ marginBottom: '0.5rem' }}>Admin Dashboard</h1>
        <p className="text-secondary" style={{ marginBottom: '2rem' }}>Business overview, stats, and quick actions for your studio.</p>
        {loading ? (
          <div className="loading">Loading dashboard...</div>
        ) : error ? (
          <div className="error">{error}</div>
        ) : (
          <div className="dashboard-metrics">
            <div className="dashboard-card dark-card">
              <div className="dashboard-card-label">Total Revenue</div>
              <div className="dashboard-card-value">${totalRevenue.toFixed(2)}</div>
              <div className="dashboard-card-sub">Avg: ${avgOrder.toFixed(2)} per order</div>
            </div>
            <div className="dashboard-card dark-card">
              <div className="dashboard-card-label">Total Orders</div>
              <div className="dashboard-card-value">{totalOrders}</div>
              <div className="dashboard-card-sub">{completionRate}% completion rate</div>
            </div>
            <div className="dashboard-card dark-card">
              <div className="dashboard-card-label">Total Customers</div>
              <div className="dashboard-card-value">0</div>
              <div className="dashboard-card-sub">Active user accounts</div>
            </div>
            <div className="dashboard-card dark-card">
              <div className="dashboard-card-label">Pending Orders</div>
              <div className="dashboard-card-value">{pendingOrders}</div>
              <div className="dashboard-card-sub">Requires attention</div>
            </div>
          </div>
        )}
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
