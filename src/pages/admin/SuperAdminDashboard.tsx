



import React, { useEffect, useState } from 'react';
import DashboardChart from '../../components/DashboardChart';
import { superAdminService } from '../../services/adminService';
import api from '../../services/api';

const SuperAdminDashboard: React.FC = () => {
  // Studio revenue/cost drill-down
  const [studioDetails, setStudioDetails] = useState<any[]>([]);
  const [expandedStudio, setExpandedStudio] = useState<number | null>(null);

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
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalOrders: 0,
    totalCustomers: 0,
    pendingOrders: 0,
  });

  useEffect(() => {
    const fetchStudioDetails = async () => {
      try {
        const data = await superAdminService.getStudioRevenueDetails();
        setStudioDetails(data || []);
      } catch (err) {
        setStudioDetails([]);
      }
    };
    fetchStudioDetails();
  }, []);

  // Fetch chart data from analyticsService
  useEffect(() => {
    const fetchChartData = async () => {
      try {
        const response = await api.get('/admin/dashboard-stats');
        const data = response.data || {};

        setStats({
          totalRevenue: Number(data.totalRevenue || 0),
          totalOrders: Number(data.totalOrders || 0),
          totalCustomers: Number(data.totalCustomers || 0),
          pendingOrders: Number(data.pendingOrders || 0),
        });

        setChartLabels({
          day: data?.revenueSeries?.day?.labels || [],
          week: data?.revenueSeries?.week?.labels || [],
          month: data?.revenueSeries?.month?.labels || [],
        });

        setRevenueSeries({
          day: data?.revenueSeries?.day?.data || [],
          week: data?.revenueSeries?.week?.data || [],
          month: data?.revenueSeries?.month?.data || [],
        });

        setOrdersSeries({
          day: data?.ordersSeries?.day?.data || [],
          week: data?.ordersSeries?.week?.data || [],
          month: data?.ordersSeries?.month?.data || [],
        });

        setCustomersSeries({
          day: data?.customersSeries?.day?.data || [],
          week: data?.customersSeries?.week?.data || [],
          month: data?.customersSeries?.month?.data || [],
        });

        setPendingSeries({
          day: data?.pendingOrdersSeries?.day?.data || [],
          week: data?.pendingOrdersSeries?.week?.data || [],
          month: data?.pendingOrdersSeries?.month?.data || [],
        });
      } catch (error) {
        // fallback: empty data
        setChartLabels({ day: [], week: [], month: [] });
        setRevenueSeries({ day: [], week: [], month: [] });
        setOrdersSeries({ day: [], week: [], month: [] });
        setCustomersSeries({ day: [], week: [], month: [] });
        setPendingSeries({ day: [], week: [], month: [] });
        setStats({ totalRevenue: 0, totalOrders: 0, totalCustomers: 0, pendingOrders: 0 });
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
          <div className="dashboard-card-value">${stats.totalRevenue.toFixed(2)}</div>
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
          <div className="dashboard-card-value">{stats.totalOrders}</div>
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
          <div className="dashboard-card-value">{stats.totalCustomers}</div>
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
          <div className="dashboard-card-value">{stats.pendingOrders}</div>
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


      {/* Studio Revenue/Cost Drill-down */}
      <div className="dashboard-card tallydark-card" style={{ marginTop: 32, width: '100%' }}>
        <h2 style={{ marginBottom: 12 }}>Studio Revenue & Cost Drill-down</h2>
        <table className="admin-table" style={{ fontSize: 15, width: '100%' }}>
          <thead>
            <tr>
              <th>Studio</th>
              <th>Orders</th>
              <th>Revenue</th>
              <th>Subtotal</th>
              <th>Tax</th>
              <th>Shipping</th>
              <th>Studio Shipping</th>
              <th>Shipping Margin</th>
              <th>Stripe Fees</th>
              <th>Discounts</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {studioDetails.map(({ studio, summary, orders }: any) => (
              <React.Fragment key={studio.id}>
                <tr style={{ background: expandedStudio === studio.id ? '#ede9fe' : undefined }}>
                  <td><b>{studio.name}</b></td>
                  <td>{summary.orderCount}</td>
                  <td>${Number(summary.totalRevenue).toFixed(2)}</td>
                  <td>${Number(summary.totalSubtotal).toFixed(2)}</td>
                  <td>${Number(summary.totalTax).toFixed(2)}</td>
                  <td>${Number(summary.totalShipping).toFixed(2)}</td>
                  <td>${Number(summary.totalStudioShipping).toFixed(2)}</td>
                  <td>${Number(summary.totalShippingMargin).toFixed(2)}</td>
                  <td>${Number(summary.totalStripeFees).toFixed(2)}</td>
                  <td>${Number(summary.totalDiscounts).toFixed(2)}</td>
                  <td>
                    <button onClick={() => setExpandedStudio(expandedStudio === studio.id ? null : studio.id)} style={{ fontSize: 14 }}>
                      {expandedStudio === studio.id ? 'Hide' : 'Drill Down'}
                    </button>
                  </td>
                </tr>
                {expandedStudio === studio.id && (
                  <tr>
                    <td colSpan={11}>
                      <div style={{ maxHeight: 320, overflow: 'auto', background: '#f8fafc', borderRadius: 8, padding: 8 }}>
                        <table className="admin-table" style={{ fontSize: 14, width: '100%' }}>
                          <thead>
                            <tr>
                              <th>Order ID</th>
                              <th>Date</th>
                              <th>Status</th>
                              <th>Total</th>
                              <th>Subtotal</th>
                              <th>Tax</th>
                              <th>Shipping</th>
                              <th>Studio Shipping</th>
                              <th>Shipping Margin</th>
                              <th>Stripe Fee</th>
                              <th>Discount Code</th>
                              <th>Items</th>
                            </tr>
                          </thead>
                          <tbody>
                            {orders.map((order: any) => (
                              <tr key={order.id}>
                                <td>{order.id}</td>
                                <td>{order.created_at ? new Date(order.created_at).toLocaleString() : ''}</td>
                                <td>{order.status}</td>
                                <td>${Number(order.total).toFixed(2)}</td>
                                <td>${Number(order.subtotal).toFixed(2)}</td>
                                <td>${Number(order.tax_amount).toFixed(2)}</td>
                                <td>${Number(order.shipping_cost).toFixed(2)}</td>
                                <td>${Number(order.studio_shipping_cost).toFixed(2)}</td>
                                <td>${Number(order.shipping_margin).toFixed(2)}</td>
                                <td>${Number(order.stripe_fee_amount).toFixed(2)}</td>
                                <td>{order.discount_code || ''}</td>
                                <td>
                                  {order.items && order.items.length > 0 ? (
                                    <details>
                                      <summary style={{ cursor: 'pointer' }}>{order.items.length} item(s)</summary>
                                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                                        {order.items.map((item: any) => (
                                          <li key={item.id}>
                                            Product: {item.product_id}, Size: {item.product_size_id}, Qty: {item.quantity}, Price: ${Number(item.price).toFixed(2)}
                                          </li>
                                        ))}
                                      </ul>
                                    </details>
                                  ) : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;