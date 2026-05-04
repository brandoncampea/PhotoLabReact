



import React, { useEffect, useState } from 'react';
import DashboardChart from '../../components/DashboardChart';
import { superAdminService } from '../../services/adminService';
import api from '../../services/api';

type SeriesByRange = { [key: string]: number[] };
type LabelsByRange = { [key: string]: string[] };

const subtractSeriesByLabel = (
  labelsByRange: LabelsByRange,
  revenueByRange: SeriesByRange,
  taxByRange: SeriesByRange
): SeriesByRange => {
  const result: SeriesByRange = { day: [], week: [], month: [] };
  (['day', 'week', 'month'] as const).forEach((range) => {
    const labels = labelsByRange[range] || [];
    const revenueData = revenueByRange[range] || [];
    const taxData = taxByRange[range] || [];
    result[range] = labels.map((_, idx) => Math.max(0, Number(revenueData[idx] || 0) - Number(taxData[idx] || 0)));
  });
  return result;
};

const SuperAdminDashboard: React.FC = () => {
  // Studio revenue/cost drill-down
  const [studioDetails, setStudioDetails] = useState<any[]>([]);
  const [expandedStudio, setExpandedStudio] = useState<number | null>(null);

  // Chart range state
  const [revenueRange, setRevenueRange] = useState<'day' | 'week' | 'month'>('day');
  const [ordersRange, setOrdersRange] = useState<'day' | 'week' | 'month'>('day');
  const [customersRange, setCustomersRange] = useState<'day' | 'week' | 'month'>('day');
  const [pendingRange, setPendingRange] = useState<'day' | 'week' | 'month'>('day');
  const [taxRange, setTaxRange] = useState<'day' | 'week' | 'month'>('day');

  // Chart data state
  const [chartLabels, setChartLabels] = useState<LabelsByRange>({ day: [], week: [], month: [] });
  const [revenueSeries, setRevenueSeries] = useState<SeriesByRange>({ day: [], week: [], month: [] });
  const [taxSeries, setTaxSeries] = useState<SeriesByRange>({ day: [], week: [], month: [] });
  const [ordersSeries, setOrdersSeries] = useState<SeriesByRange>({ day: [], week: [], month: [] });
  const [customersSeries, setCustomersSeries] = useState<SeriesByRange>({ day: [], week: [], month: [] });
  const [pendingSeries, setPendingSeries] = useState<SeriesByRange>({ day: [], week: [], month: [] });
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalSuperAdminRevenue: 0,
    totalTax: 0,
    totalGrossMargin: 0,
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

        const labels: LabelsByRange = {
          day: data?.revenueSeries?.day?.labels || [],
          week: data?.revenueSeries?.week?.labels || [],
          month: data?.revenueSeries?.month?.labels || [],
        };

        const taxData: SeriesByRange = {
          day: data?.taxSeries?.day?.data || [],
          week: data?.taxSeries?.week?.data || [],
          month: data?.taxSeries?.month?.data || [],
        };

        const grossRevenueData: SeriesByRange = {
          day: data?.superAdminRevenueSeries?.day?.data || [],
          week: data?.superAdminRevenueSeries?.week?.data || [],
          month: data?.superAdminRevenueSeries?.month?.data || [],
        };

        setStats({
          totalRevenue: Math.max(0, Number(data.totalRevenue || 0) - Number(data?.revenueComposition?.totalTax || 0)),
          totalSuperAdminRevenue: Number(data.totalSuperAdminRevenue || data?.grossMarginBreakdown?.totalSuperAdminRevenue || 0),
          totalTax: Number(data?.revenueComposition?.totalTax || 0),
          totalGrossMargin: Number(data?.grossMarginBreakdown?.totalGrossMargin || 0),
          totalOrders: Number(data.totalOrders || 0),
          totalCustomers: Number(data.totalCustomers || 0),
          pendingOrders: Number(data.pendingOrders || 0),
        });

        setChartLabels(labels);

        setRevenueSeries(grossRevenueData);
        setTaxSeries(taxData);

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
        setTaxSeries({ day: [], week: [], month: [] });
        setOrdersSeries({ day: [], week: [], month: [] });
        setCustomersSeries({ day: [], week: [], month: [] });
        setPendingSeries({ day: [], week: [], month: [] });
        setStats({ totalRevenue: 0, totalSuperAdminRevenue: 0, totalTax: 0, totalGrossMargin: 0, totalOrders: 0, totalCustomers: 0, pendingOrders: 0 });
      }
    };
    fetchChartData();
  }, []);

  const drilldownStyles = {
    title: {
      marginBottom: 12,
      color: '#f8fafc',
      fontWeight: 700,
      letterSpacing: '0.01em',
    } as React.CSSProperties,
    table: {
      fontSize: 15,
      width: '100%',
      borderCollapse: 'separate',
      borderSpacing: 0,
      color: '#e2e8f0',
      background: 'rgba(15, 23, 42, 0.65)',
      border: '1px solid rgba(148, 163, 184, 0.28)',
      borderRadius: 10,
      overflow: 'hidden',
    } as React.CSSProperties,
    nestedTable: {
      fontSize: 14,
      width: '100%',
      borderCollapse: 'separate',
      borderSpacing: 0,
      color: '#e2e8f0',
      background: 'rgba(15, 23, 42, 0.82)',
      border: '1px solid rgba(148, 163, 184, 0.28)',
      borderRadius: 8,
      overflow: 'hidden',
    } as React.CSSProperties,
    th: {
      position: 'sticky',
      top: 0,
      zIndex: 2,
      textAlign: 'left',
      padding: '10px 12px',
      fontWeight: 700,
      color: '#f8fafc',
      background: '#0f172a',
      borderBottom: '1px solid rgba(148, 163, 184, 0.32)',
      whiteSpace: 'nowrap',
    } as React.CSSProperties,
    td: {
      padding: '9px 12px',
      borderBottom: '1px solid rgba(148, 163, 184, 0.18)',
      color: '#e2e8f0',
      verticalAlign: 'top',
      whiteSpace: 'nowrap',
    } as React.CSSProperties,
    expandedRow: {
      background: 'rgba(99, 102, 241, 0.20)',
    } as React.CSSProperties,
    normalRow: {
      background: 'rgba(15, 23, 42, 0.35)',
    } as React.CSSProperties,
    actionButton: {
      fontSize: 13,
      fontWeight: 700,
      color: '#e2e8f0',
      background: 'rgba(51, 65, 85, 0.9)',
      border: '1px solid rgba(148, 163, 184, 0.34)',
      borderRadius: 6,
      padding: '4px 10px',
      cursor: 'pointer',
    } as React.CSSProperties,
    nestedWrap: {
      maxHeight: 320,
      overflow: 'auto',
      background: 'rgba(2, 6, 23, 0.55)',
      borderRadius: 8,
      padding: 8,
      border: '1px solid rgba(148, 163, 184, 0.22)',
    } as React.CSSProperties,
    summary: {
      cursor: 'pointer',
      color: '#cbd5e1',
      fontWeight: 600,
    } as React.CSSProperties,
    list: {
      margin: 0,
      paddingLeft: 18,
      color: '#cbd5e1',
      lineHeight: 1.35,
    } as React.CSSProperties,
  };

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
          <div className="dashboard-card-label">Super Admin Revenue</div>
          <div className="dashboard-card-value">${stats.totalSuperAdminRevenue.toFixed(2)}</div>
          <div className="dashboard-card-sub">(Base Price or % Share − Cost) × Qty</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 0 0' }}>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setRevenueRange('day')} disabled={revenueRange === 'day'}>Day</button>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setRevenueRange('week')} disabled={revenueRange === 'week'}>Week</button>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setRevenueRange('month')} disabled={revenueRange === 'month'}>Month</button>
          </div>
          <DashboardChart
            data={revenueSeries[revenueRange]}
            labels={chartLabels[revenueRange]}
            label="Super Admin Revenue"
          />
        </div>

        {/* Tax Collected Widget */}
        <div className="dashboard-card tallydark-card">
          <div className="dashboard-card-label">Tax Collected</div>
          <div className="dashboard-card-value">${stats.totalTax.toFixed(2)}</div>
          <div className="dashboard-card-sub">Collected from completed orders</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 0 0' }}>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setTaxRange('day')} disabled={taxRange === 'day'}>Day</button>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setTaxRange('week')} disabled={taxRange === 'week'}>Week</button>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setTaxRange('month')} disabled={taxRange === 'month'}>Month</button>
          </div>
          <DashboardChart
            data={taxSeries[taxRange]}
            labels={chartLabels[taxRange]}
            label="Tax Collected"
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
          <div className="dashboard-card-value">${stats.totalGrossMargin.toFixed(2)}</div>
          <div className="dashboard-card-sub">
            {stats.totalSuperAdminRevenue > 0 ? `${((stats.totalGrossMargin / stats.totalSuperAdminRevenue) * 100).toFixed(1)}% margin` : '0% margin'}
          </div>
          <DashboardChart
            data={revenueSeries[revenueRange]?.map((v) => v * (stats.totalSuperAdminRevenue > 0 ? (stats.totalGrossMargin / stats.totalSuperAdminRevenue) : 0)) || []}
            labels={chartLabels[revenueRange]}
            label="Profit"
          />
        </div>
      </div>


      {/* Studio Revenue/Cost Drill-down */}
      <div className="dashboard-card tallydark-card" style={{ marginTop: 32, width: '100%' }}>
        <h2 style={drilldownStyles.title}>Studio Revenue & Cost Drill-down</h2>
        <table className="admin-table" style={drilldownStyles.table}>
          <thead>
            <tr>
              <th style={drilldownStyles.th}>Studio</th>
              <th style={drilldownStyles.th}>Orders</th>
              <th style={drilldownStyles.th}>Revenue (ex Tax)</th>
              <th style={drilldownStyles.th}>Subtotal</th>
              <th style={drilldownStyles.th}>Tax</th>
              <th style={drilldownStyles.th}>Shipping</th>
              <th style={drilldownStyles.th}>Studio Shipping</th>
              <th style={drilldownStyles.th}>Shipping Margin</th>
              <th style={drilldownStyles.th}>Stripe Fees</th>
              <th style={drilldownStyles.th}>Studio Profit</th>
              <th style={drilldownStyles.th}>Discounts</th>
              <th style={drilldownStyles.th}></th>
            </tr>
          </thead>
          <tbody>
            {studioDetails.map(({ studio, summary, orders }: any) => (
              <React.Fragment key={studio.id}>
                <tr style={expandedStudio === studio.id ? drilldownStyles.expandedRow : drilldownStyles.normalRow}>
                  <td style={drilldownStyles.td}><b>{studio.name}</b></td>
                  <td style={drilldownStyles.td}>{summary.orderCount}</td>
                  <td style={drilldownStyles.td}>${Math.max(0, Number(summary.totalRevenue) - Number(summary.totalTax || 0)).toFixed(2)}</td>
                  <td style={drilldownStyles.td}>${Number(summary.totalSubtotal).toFixed(2)}</td>
                  <td style={drilldownStyles.td}>${Number(summary.totalTax).toFixed(2)}</td>
                  <td style={drilldownStyles.td}>${Number(summary.totalShipping).toFixed(2)}</td>
                  <td style={drilldownStyles.td}>${Number(summary.totalStudioShipping).toFixed(2)}</td>
                  <td style={drilldownStyles.td}>${Number(summary.totalShippingMargin).toFixed(2)}</td>
                  <td style={drilldownStyles.td}>${Number(summary.totalStripeFees).toFixed(2)}</td>
                  <td style={drilldownStyles.td}>${Number(summary.totalStudioProfit || 0).toFixed(2)}</td>
                  <td style={drilldownStyles.td}>${Number(summary.totalDiscounts).toFixed(2)}</td>
                  <td style={drilldownStyles.td}>
                    <button onClick={() => setExpandedStudio(expandedStudio === studio.id ? null : studio.id)} style={drilldownStyles.actionButton}>
                      {expandedStudio === studio.id ? 'Hide' : 'Drill Down'}
                    </button>
                  </td>
                </tr>
                {expandedStudio === studio.id && (
                  <tr>
                    <td colSpan={12} style={drilldownStyles.td}>
                      <div style={drilldownStyles.nestedWrap}>
                        <table className="admin-table" style={drilldownStyles.nestedTable}>
                          <thead>
                            <tr>
                              <th style={drilldownStyles.th}>Order ID</th>
                              <th style={drilldownStyles.th}>Date</th>
                              <th style={drilldownStyles.th}>Status</th>
                              <th style={drilldownStyles.th}>Total (ex Tax)</th>
                              <th style={drilldownStyles.th}>Subtotal</th>
                              <th style={drilldownStyles.th}>Tax</th>
                              <th style={drilldownStyles.th}>Shipping</th>
                              <th style={drilldownStyles.th}>Studio Shipping</th>
                              <th style={drilldownStyles.th}>Shipping Margin</th>
                              <th style={drilldownStyles.th}>Stripe Fee</th>
                              <th style={drilldownStyles.th}>Studio Profit</th>
                              <th style={drilldownStyles.th}>Discount Code</th>
                              <th style={drilldownStyles.th}>Items</th>
                            </tr>
                          </thead>
                          <tbody>
                            {orders.map((order: any) => (
                              <tr key={order.id} style={drilldownStyles.normalRow}>
                                <td style={drilldownStyles.td}>{order.id}</td>
                                <td style={drilldownStyles.td}>{order.created_at ? new Date(order.created_at).toLocaleString() : ''}</td>
                                <td style={drilldownStyles.td}>{order.status}</td>
                                <td style={drilldownStyles.td}>${Math.max(0, Number(order.total) - Number(order.tax_amount || 0)).toFixed(2)}</td>
                                <td style={drilldownStyles.td}>${Number(order.subtotal).toFixed(2)}</td>
                                <td style={drilldownStyles.td}>${Number(order.tax_amount).toFixed(2)}</td>
                                <td style={drilldownStyles.td}>${Number(order.shipping_cost).toFixed(2)}</td>
                                <td style={drilldownStyles.td}>${Number(order.studio_shipping_cost).toFixed(2)}</td>
                                <td style={drilldownStyles.td}>${Number(order.shipping_margin).toFixed(2)}</td>
                                <td style={drilldownStyles.td}>${Number(order.stripe_fee_amount).toFixed(2)}</td>
                                <td style={drilldownStyles.td}>${Number(order.studio_profit || 0).toFixed(2)}</td>
                                <td style={drilldownStyles.td}>{order.discount_code || ''}</td>
                                <td style={drilldownStyles.td}>
                                  {order.items && order.items.length > 0 ? (
                                    <details>
                                      <summary style={drilldownStyles.summary}>{order.items.length} item(s)</summary>
                                      <ul style={drilldownStyles.list}>
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