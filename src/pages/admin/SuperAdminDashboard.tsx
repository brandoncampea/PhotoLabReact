



import React, { useEffect, useState } from 'react';
import DashboardChart from '../../components/DashboardChart';
import { analyticsService } from '../../services/analyticsService';
// import { orderService } from '../../services/orderService';
// import { userAdminService } from '../../services/adminService';

const SuperAdminDashboard: React.FC = () => {

  // Chart range state
  const [revenueRange, setRevenueRange] = useState<'day' | 'week' | 'month'>('month');
  const [ordersRange, setOrdersRange] = useState<'day' | 'week' | 'month'>('month');
  const [customersRange, setCustomersRange] = useState<'day' | 'week' | 'month'>('month');
  const [pendingRange, setPendingRange] = useState<'day' | 'week' | 'month'>('month');

  // Chart data state
  const [chartLabels, setChartLabels] = useState<{ [key: string]: string[] }>({ day: [], week: [], month: [] });
  const [revenueSeries, setRevenueSeries] = useState<{ [key: string]: number[] }>({ day: [], week: [], month: [] });
  const [ordersSeries, setOrdersSeries] = useState<{ [key: string]: number[] }>({ day: [], week: [], month: [] });
  const [customersSeries, setCustomersSeries] = useState<{ [key: string]: number[] }>({ day: [], week: [], month: [] });
  const [pendingSeries, setPendingSeries] = useState<{ [key: string]: number[] }>({ day: [], week: [], month: [] });

  // Fetch chart data from analyticsService
  useEffect(() => {
    const fetchChartData = async () => {
      try {
        // Example: Replace with your real API endpoints for chart series
        const response = await analyticsService.getDetails();
        // Assume response has: revenueSeries, ordersSeries, customersSeries, pendingSeries, and labels for each range
        setChartLabels(response.labels || { day: [], week: [], month: [] });
        setRevenueSeries(response.revenueSeries || { day: [], week: [], month: [] });
        setOrdersSeries(response.ordersSeries || { day: [], week: [], month: [] });
        setCustomersSeries(response.customersSeries || { day: [], week: [], month: [] });
        setPendingSeries(response.pendingSeries || { day: [], week: [], month: [] });
      } catch (error) {
        // fallback: empty data
        setChartLabels({ day: [], week: [], month: [] });
        setRevenueSeries({ day: [], week: [], month: [] });
        setOrdersSeries({ day: [], week: [], month: [] });
        setCustomersSeries({ day: [], week: [], month: [] });
        setPendingSeries({ day: [], week: [], month: [] });
      }
    };
    fetchChartData();
  }, []);

  return (
    <div className="admin-page dark-bg" style={{ minHeight: '100vh', padding: '0 0 2rem 0' }}>
      <div className="page-header">
        <h1 className="gradient-text" data-testid="superadmin-dashboard-heading">🛡️ Super Admin Dashboard</h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Global business overview and advanced analytics for all labs and studios.
        </p>
      </div>

      {/* Key Metrics - Responsive grid, modern card style */}
      <div className="dashboard-metrics tallydark-metrics">
        {/* Revenue Widget */}
        <div className="dashboard-card tallydark-card">
          <div className="dashboard-card-label">Total Revenue</div>
          <div className="dashboard-card-value">$0.00</div>
          <div className="dashboard-card-sub">Avg: $0.00 per order</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 0 0' }}>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setRevenueRange('day')} disabled={revenueRange === 'day'}>Day</button>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setRevenueRange('week')} disabled={revenueRange === 'week'}>Week</button>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setRevenueRange('month')} disabled={revenueRange === 'month'}>Month</button>
          </div>
          <DashboardChart
            data={revenueSeries[revenueRange]}
            labels={chartLabels[revenueRange]}
            label="Revenue"
          />
        </div>
        {/* Orders Widget */}
        <div className="dashboard-card tallydark-card">
          <div className="dashboard-card-label">Total Orders</div>
          <div className="dashboard-card-value">0</div>
          <div className="dashboard-card-sub">0% completion rate</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 0 0' }}>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setOrdersRange('day')} disabled={ordersRange === 'day'}>Day</button>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setOrdersRange('week')} disabled={ordersRange === 'week'}>Week</button>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setOrdersRange('month')} disabled={ordersRange === 'month'}>Month</button>
          </div>
          <DashboardChart
            data={ordersSeries[ordersRange]}
            labels={chartLabels[ordersRange]}
            label="Orders"
          />
        </div>
        {/* Customers Widget */}
        <div className="dashboard-card tallydark-card">
          <div className="dashboard-card-label">Total Customers</div>
          <div className="dashboard-card-value">0</div>
          <div className="dashboard-card-sub">Active user accounts</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 0 0' }}>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setCustomersRange('day')} disabled={customersRange === 'day'}>Day</button>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setCustomersRange('week')} disabled={customersRange === 'week'}>Week</button>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setCustomersRange('month')} disabled={customersRange === 'month'}>Month</button>
          </div>
          <DashboardChart
            data={customersSeries[customersRange]}
            labels={chartLabels[customersRange]}
            label="New Customers"
          />
        </div>
        {/* Pending Orders Widget */}
        <div className="dashboard-card tallydark-card">
          <div className="dashboard-card-label">Pending Orders</div>
          <div className="dashboard-card-value">0</div>
          <div className="dashboard-card-sub">Requires attention</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 0 0' }}>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setPendingRange('day')} disabled={pendingRange === 'day'}>Day</button>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setPendingRange('week')} disabled={pendingRange === 'week'}>Week</button>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setPendingRange('month')} disabled={pendingRange === 'month'}>Month</button>
          </div>
          <DashboardChart
            data={pendingSeries[pendingRange]}
            labels={chartLabels[pendingRange]}
            label="Pending Orders"
          />
        </div>
        {/* Profit Widget */}
        <div className="dashboard-card tallydark-card">
          <div className="dashboard-card-label">Total Profit</div>
          <div className="dashboard-card-value">$0.00</div>
          <div className="dashboard-card-sub">0% margin</div>
          <DashboardChart
            data={revenueSeries[revenueRange]?.map(v => v * 0.2) || []}
            labels={chartLabels[revenueRange]}
            label="Profit"
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="dashboard-widget tallydark-card" style={{ paddingBottom: '0.5rem', marginTop: '2.5rem' }}>
        <h2 style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.3rem' }}>Quick Actions</h2>
        <div className="dashboard-actions-grid tallydark-actions-grid" style={{ marginBottom: 0 }}>
          <a href="/admin/studios"    className="tallydark-sidenav-btn">Manage Studios</a>
          <a href="/admin/users"      className="tallydark-sidenav-btn">Manage Users</a>
          <a href="/admin/analytics"  className="tallydark-sidenav-btn">View Analytics</a>
          <a href="/admin/settings"   className="tallydark-sidenav-btn">Platform Settings</a>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;