import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import DashboardChart from '../../components/DashboardChart';
import api from '../../services/api';

type Range = 'day' | 'week' | 'month';
type Series = Record<Range, { data: number[]; labels: string[] }>;

type DashboardStats = {
  totalRevenue: number;
  revenueComposition?: {
    totalTax: number;
  };
  grossMarginBreakdown?: {
    totalGrossMargin: number;
  };
  totalOrders: number;
  totalCustomers: number;
  pendingOrders: number;
  revenueSeries?: Series;
  taxSeries?: Series;
  ordersSeries?: Series;
  customersSeries?: Series;
  pendingOrdersSeries?: Series;
};

const getSeries = (series: Series | undefined, range: Range) => ({
  labels: series?.[range]?.labels || [],
  data: series?.[range]?.data || [],
});

const subtractTaxFromRevenueSeries = (revenueSeries: Series | undefined, taxSeries: Series | undefined, range: Range) => {
  const revenue = getSeries(revenueSeries, range);
  const tax = getSeries(taxSeries, range);
  const taxByLabel = new Map<string, number>();
  tax.labels.forEach((label, i) => taxByLabel.set(label, Number(tax.data[i] || 0)));
  return {
    labels: revenue.labels,
    data: revenue.labels.map((label, i) => Math.max(0, Number(revenue.data[i] || 0) - Number(taxByLabel.get(label) || 0))),
  };
};

const StudioAdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [revenueRange, setRevenueRange] = useState<Range>('day');
  const [ordersRange, setOrdersRange] = useState<Range>('day');
  const [customersRange, setCustomersRange] = useState<Range>('day');
  const [pendingRange, setPendingRange] = useState<Range>('day');
  const [taxRange, setTaxRange] = useState<Range>('day');

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const response = await api.get('/admin/dashboard-stats');
        setStats(response.data || null);
      } catch {
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

  if (!stats) {
    return <div className="loading">No dashboard data available.</div>;
  }

  const totalTax = Number(stats.revenueComposition?.totalTax || 0);
  const totalRevenueExTax = Math.max(0, Number(stats.totalRevenue || 0) - totalTax);
  const totalMargin = Number(stats.grossMarginBreakdown?.totalGrossMargin || 0);
  const displayTotalOrders = Number(stats.totalOrders || 0);
  const completionRate = displayTotalOrders
    ? (((displayTotalOrders - Number(stats.pendingOrders || 0)) / displayTotalOrders) * 100).toFixed(1)
    : '0';
  const averageOrderValue = displayTotalOrders
    ? (totalRevenueExTax / displayTotalOrders).toFixed(2)
    : '0.00';
  const marginPercent = totalRevenueExTax > 0 ? ((totalMargin / totalRevenueExTax) * 100).toFixed(1) : '0.0';

  const revenueChart = subtractTaxFromRevenueSeries(stats.revenueSeries, stats.taxSeries, revenueRange);
  const ordersChart = getSeries(stats.ordersSeries, ordersRange);
  const customersChart = getSeries(stats.customersSeries, customersRange);
  const pendingChart = getSeries(stats.pendingOrdersSeries, pendingRange);
  const taxChart = getSeries(stats.taxSeries, taxRange);

  return (
    <AdminLayout>
      <div className="dashboardContainer">
        <h1 className="gradient-text" style={{ marginBottom: '0.5rem' }}>🏢 Studio Admin Dashboard</h1>
        <p className="text-secondary" style={{ marginBottom: '2rem' }}>Studio-level business overview, analytics, and revenue/profit breakdowns.</p>

        <div className="dashboard-metrics tallydark-metrics">
          <div className="dashboard-card tallydark-card">
            <span className="dashboard-card-icon">💰</span>
            <div className="dashboard-card-label">Total Revenue</div>
            <div className="dashboard-card-value">${totalRevenueExTax.toFixed(2)}</div>
            <div className="dashboard-card-sub">Tax excluded · Avg: ${averageOrderValue} per order</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 0 0' }}>
              <button className="dashboard-pill" onClick={() => setRevenueRange('day')} disabled={revenueRange === 'day'}>Day</button>
              <button className="dashboard-pill" onClick={() => setRevenueRange('week')} disabled={revenueRange === 'week'}>Week</button>
              <button className="dashboard-pill" onClick={() => setRevenueRange('month')} disabled={revenueRange === 'month'}>Month</button>
            </div>
            <DashboardChart data={revenueChart.data} labels={revenueChart.labels} label="Revenue (ex tax)" />
          </div>

          <div className="dashboard-card tallydark-card">
            <span className="dashboard-card-icon">🧾</span>
            <div className="dashboard-card-label">Tax Collected</div>
            <div className="dashboard-card-value">${totalTax.toFixed(2)}</div>
            <div className="dashboard-card-sub">Collected from completed orders</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 0 0' }}>
              <button className="dashboard-pill" onClick={() => setTaxRange('day')} disabled={taxRange === 'day'}>Day</button>
              <button className="dashboard-pill" onClick={() => setTaxRange('week')} disabled={taxRange === 'week'}>Week</button>
              <button className="dashboard-pill" onClick={() => setTaxRange('month')} disabled={taxRange === 'month'}>Month</button>
            </div>
            <DashboardChart data={taxChart.data} labels={taxChart.labels} label="Tax Collected" />
          </div>

          <div className="dashboard-card tallydark-card">
            <span className="dashboard-card-icon">📦</span>
            <div className="dashboard-card-label">Total Orders</div>
            <div className="dashboard-card-value">{displayTotalOrders}</div>
            <div className="dashboard-card-sub">{completionRate}% completion rate</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 0 0' }}>
              <button className="dashboard-pill" onClick={() => setOrdersRange('day')} disabled={ordersRange === 'day'}>Day</button>
              <button className="dashboard-pill" onClick={() => setOrdersRange('week')} disabled={ordersRange === 'week'}>Week</button>
              <button className="dashboard-pill" onClick={() => setOrdersRange('month')} disabled={ordersRange === 'month'}>Month</button>
            </div>
            <DashboardChart data={ordersChart.data} labels={ordersChart.labels} label="Orders" />
          </div>

          <div className="dashboard-card tallydark-card">
            <span className="dashboard-card-icon">👥</span>
            <div className="dashboard-card-label">Total Customers</div>
            <div className="dashboard-card-value">{Number(stats.totalCustomers || 0)}</div>
            <div className="dashboard-card-sub">Active user accounts</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 0 0' }}>
              <button className="dashboard-pill" onClick={() => setCustomersRange('day')} disabled={customersRange === 'day'}>Day</button>
              <button className="dashboard-pill" onClick={() => setCustomersRange('week')} disabled={customersRange === 'week'}>Week</button>
              <button className="dashboard-pill" onClick={() => setCustomersRange('month')} disabled={customersRange === 'month'}>Month</button>
            </div>
            <DashboardChart data={customersChart.data} labels={customersChart.labels} label="New Customers" />
          </div>

          <div className="dashboard-card tallydark-card">
            <span className="dashboard-card-icon">⏳</span>
            <div className="dashboard-card-label">Pending Orders</div>
            <div className="dashboard-card-value">{Number(stats.pendingOrders || 0)}</div>
            <div className="dashboard-card-sub">Requires attention</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 0 0' }}>
              <button className="dashboard-pill" onClick={() => setPendingRange('day')} disabled={pendingRange === 'day'}>Day</button>
              <button className="dashboard-pill" onClick={() => setPendingRange('week')} disabled={pendingRange === 'week'}>Week</button>
              <button className="dashboard-pill" onClick={() => setPendingRange('month')} disabled={pendingRange === 'month'}>Month</button>
            </div>
            <DashboardChart data={pendingChart.data} labels={pendingChart.labels} label="Pending Orders" />
          </div>

          <div className="dashboard-card tallydark-card">
            <span className="dashboard-card-icon">📈</span>
            <div className="dashboard-card-label">Total Profit</div>
            <div className="dashboard-card-value">${totalMargin.toFixed(2)}</div>
            <div className="dashboard-card-sub">{marginPercent}% margin (tax excluded)</div>
            <DashboardChart
              data={revenueChart.data.map((v) => v * (totalRevenueExTax > 0 ? (totalMargin / totalRevenueExTax) : 0))}
              labels={revenueChart.labels}
              label="Profit"
            />
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default StudioAdminDashboard;