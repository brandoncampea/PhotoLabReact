



import React, { useEffect, useState } from 'react';
import DashboardChart from '../../components/DashboardChart';
import { superAdminService } from '../../services/adminService';
import api from '../../services/api';

type SeriesByRange = { [key: string]: number[] };
type LabelsByRange = { [key: string]: string[] };

const SuperAdminDashboard: React.FC = () => {
  // Studio revenue/cost drill-down
  const [studioDetails, setStudioDetails] = useState<any[]>([]);
  const [expandedStudio, setExpandedStudio] = useState<number | null>(null);
  const [profitThreshold, setProfitThreshold] = useState<number>(0);
  const [payingStudio, setPayingStudio] = useState<number | null>(null);
  const [payoutNotes, setPayoutNotes] = useState<string>('');
  const [payoutError, setPayoutError] = useState<string>('');
  const [payoutSuccess, setPayoutSuccess] = useState<string>('');
  const [expandedPayout, setExpandedPayout] = useState<number | null>(null);

  // Chart range state
  const [revenueRange, setRevenueRange] = useState<'day' | 'week' | 'month'>('day');
  const [ordersRange, setOrdersRange] = useState<'day' | 'week' | 'month'>('day');
  const [customersRange, setCustomersRange] = useState<'day' | 'week' | 'month'>('day');
  const [pendingRange, setPendingRange] = useState<'day' | 'week' | 'month'>('day');
  const [taxRange, setTaxRange] = useState<'day' | 'week' | 'month'>('day');
  const [productsRange, setProductsRange] = useState<'day' | 'week' | 'month'>('day');

  // Chart data state
  const [chartLabels, setChartLabels] = useState<LabelsByRange>({ day: [], week: [], month: [] });
  const [revenueSeries, setRevenueSeries] = useState<SeriesByRange>({ day: [], week: [], month: [] });
  const [taxSeries, setTaxSeries] = useState<SeriesByRange>({ day: [], week: [], month: [] });
  const [ordersSeries, setOrdersSeries] = useState<SeriesByRange>({ day: [], week: [], month: [] });
  const [customersSeries, setCustomersSeries] = useState<SeriesByRange>({ day: [], week: [], month: [] });
  const [pendingSeries, setPendingSeries] = useState<SeriesByRange>({ day: [], week: [], month: [] });
  const [productsSoldSeries, setProductsSoldSeries] = useState<SeriesByRange>({ day: [], week: [], month: [] });
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalSuperAdminRevenue: 0,
    totalProductsSold: 0,
    avgProfitPerProduct: 0,
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

  const refreshDrilldown = async () => {
    try {
      const data = await superAdminService.getStudioRevenueDetails();
      setStudioDetails(data || []);
    } catch {}
  };

  const handleMarkAsPaid = async (studioId: number) => {
    setPayoutError('');
    setPayoutSuccess('');
    try {
      const result = await superAdminService.markStudioAsPaid(studioId, payoutNotes || undefined);
      setPayoutSuccess(`✅ Marked ${result.orderCount} order(s) as paid — $${Number(result.payout?.amount || 0).toFixed(2)}`);
      setPayingStudio(null);
      setPayoutNotes('');
      await refreshDrilldown();
    } catch (err: any) {
      setPayoutError(err?.response?.data?.error || 'Failed to record payout');
    }
  };

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
          totalProductsSold: Number(data.totalProductsSold || data?.grossMarginBreakdown?.totalProductsSold || 0),
          avgProfitPerProduct: Number(data.avgProfitPerProduct || data?.grossMarginBreakdown?.avgProfitPerProduct || 0),
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

        setProductsSoldSeries({
          day: data?.productsSoldSeries?.day?.data || [],
          week: data?.productsSoldSeries?.week?.data || [],
          month: data?.productsSoldSeries?.month?.data || [],
        });
      } catch (error) {
        // fallback: empty data
        setChartLabels({ day: [], week: [], month: [] });
        setRevenueSeries({ day: [], week: [], month: [] });
        setTaxSeries({ day: [], week: [], month: [] });
        setOrdersSeries({ day: [], week: [], month: [] });
        setCustomersSeries({ day: [], week: [], month: [] });
        setPendingSeries({ day: [], week: [], month: [] });
        setProductsSoldSeries({ day: [], week: [], month: [] });
        setStats({ totalRevenue: 0, totalSuperAdminRevenue: 0, totalProductsSold: 0, avgProfitPerProduct: 0, totalTax: 0, totalGrossMargin: 0, totalOrders: 0, totalCustomers: 0, pendingOrders: 0 });
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
          <div className="dashboard-card-label">Gross Revenue</div>
          <div className="dashboard-card-value">${stats.totalSuperAdminRevenue.toFixed(2)}</div>
          <div className="dashboard-card-sub">Markup × Qty · all studios</div>
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
        {/* Products Sold Widget */}
        <div className="dashboard-card tallydark-card">
          <div className="dashboard-card-label">Products Sold</div>
          <div className="dashboard-card-value">{stats.totalProductsSold}</div>
          <div className="dashboard-card-sub">Avg Profit / Product: ${stats.avgProfitPerProduct.toFixed(2)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 0 0' }}>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setProductsRange('day')} disabled={productsRange === 'day'}>Day</button>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setProductsRange('week')} disabled={productsRange === 'week'}>Week</button>
            <button className="dashboard-pill" style={{ padding: '3px 12px', fontSize: '0.98rem' }} onClick={() => setProductsRange('month')} disabled={productsRange === 'month'}>Month</button>
          </div>
          <DashboardChart
            data={productsSoldSeries[productsRange]}
            labels={chartLabels[productsRange]}
            label="Products Sold"
          />
        </div>
        {/* Avg Profit Per Product Widget */}
        <div className="dashboard-card tallydark-card">
          <div className="dashboard-card-label">Avg Profit / Product</div>
          <div className="dashboard-card-value">${stats.avgProfitPerProduct.toFixed(2)}</div>
          <div className="dashboard-card-sub">(Markup − WHCC Cost) ÷ Products Sold</div>
          <DashboardChart
            data={(revenueSeries[productsRange] || []).map((value, idx) => {
              const qty = Number(productsSoldSeries[productsRange]?.[idx] || 0);
              return qty > 0 ? Number(value || 0) / qty : 0;
            })}
            labels={chartLabels[productsRange]}
            label="Avg Profit / Product"
          />
        </div>
        {/* Profit Widget */}
        <div className="dashboard-card tallydark-card">
          <div className="dashboard-card-label">Total Profit</div>
          <div className="dashboard-card-value">${stats.totalGrossMargin.toFixed(2)}</div>
          <div className="dashboard-card-sub">
            {stats.totalSuperAdminRevenue > 0 ? `${((stats.totalGrossMargin / stats.totalSuperAdminRevenue) * 100).toFixed(1)}% margin · Markup − WHCC Cost` : '0% margin'}
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <h2 style={drilldownStyles.title}>Studio Revenue & Cost Drill-down</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>Filter by min. current profit:</label>
            <span style={{ color: '#94a3b8', fontSize: 14, fontWeight: 700 }}>$</span>
            <input
              type="number"
              min={0}
              step={1}
              value={profitThreshold}
              onChange={e => setProfitThreshold(Number(e.target.value))}
              style={{
                width: 90,
                padding: '4px 8px',
                borderRadius: 6,
                border: '1px solid rgba(148,163,184,0.35)',
                background: 'rgba(15,23,42,0.7)',
                color: '#f1f5f9',
                fontSize: 14,
              }}
              placeholder="0"
            />
          </div>
        </div>
        {payoutSuccess && (
          <div style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid #22c55e', borderRadius: 8, padding: '8px 14px', marginBottom: 10, color: '#86efac', fontSize: 13 }}>
            {payoutSuccess}
            <button onClick={() => setPayoutSuccess('')} style={{ marginLeft: 12, background: 'none', border: 'none', color: '#86efac', cursor: 'pointer', fontSize: 13 }}>✕</button>
          </div>
        )}
        {payoutError && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', borderRadius: 8, padding: '8px 14px', marginBottom: 10, color: '#fca5a5', fontSize: 13 }}>
            {payoutError}
            <button onClick={() => setPayoutError('')} style={{ marginLeft: 12, background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: 13 }}>✕</button>
          </div>
        )}
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
              <th style={drilldownStyles.th}>Total Profit</th>
              <th style={drilldownStyles.th}>Current Profit</th>
              <th style={drilldownStyles.th}>Total Paid Out</th>
              <th style={drilldownStyles.th}>Discounts</th>
              <th style={drilldownStyles.th}></th>
            </tr>
          </thead>
          <tbody>
            {studioDetails
              .filter(({ summary }: any) => Number(summary.currentStudioProfit || 0) >= profitThreshold)
              .map(({ studio, summary, orders, payoutHistory }: any) => (
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
                  <td style={{ ...drilldownStyles.td, color: '#86efac', fontWeight: 700 }}>${Number(summary.totalStudioProfit || 0).toFixed(2)}</td>
                  <td style={{ ...drilldownStyles.td, color: Number(summary.currentStudioProfit || 0) > 0 ? '#fbbf24' : '#94a3b8', fontWeight: 700 }}>
                    ${Number(summary.currentStudioProfit || 0).toFixed(2)}
                  </td>
                  <td style={{ ...drilldownStyles.td, color: '#94a3b8' }}>${Number(summary.totalPayouts || 0).toFixed(2)}</td>
                  <td style={drilldownStyles.td}>${Number(summary.totalDiscounts).toFixed(2)}</td>
                  <td style={{ ...drilldownStyles.td, whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button onClick={() => setExpandedStudio(expandedStudio === studio.id ? null : studio.id)} style={drilldownStyles.actionButton}>
                        {expandedStudio === studio.id ? 'Hide' : 'Drill Down'}
                      </button>
                      {Number(summary.currentStudioProfit || 0) > 0 && (
                        <button
                          onClick={() => { setPayingStudio(studio.id); setPayoutNotes(''); setPayoutError(''); setPayoutSuccess(''); }}
                          style={{ ...drilldownStyles.actionButton, background: 'rgba(34,197,94,0.18)', border: '1px solid #22c55e', color: '#86efac' }}
                        >
                          Mark as Paid
                        </button>
                      )}
                    </div>
                    {payingStudio === studio.id && (
                      <div style={{ marginTop: 8, background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(34,197,94,0.4)', borderRadius: 8, padding: 10, minWidth: 240 }}>
                        <div style={{ color: '#86efac', fontWeight: 700, marginBottom: 6, fontSize: 13 }}>
                          Pay ${Number(summary.currentStudioProfit || 0).toFixed(2)} for {orders.filter((o: any) => !o.is_paid).length} unpaid order(s)
                        </div>
                        <input
                          type="text"
                          placeholder="Notes (optional)"
                          value={payoutNotes}
                          onChange={e => setPayoutNotes(e.target.value)}
                          style={{ width: '100%', padding: '4px 8px', borderRadius: 5, border: '1px solid rgba(148,163,184,0.3)', background: 'rgba(15,23,42,0.7)', color: '#f1f5f9', fontSize: 12, marginBottom: 6, boxSizing: 'border-box' }}
                        />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => handleMarkAsPaid(studio.id)}
                            style={{ ...drilldownStyles.actionButton, background: 'rgba(34,197,94,0.28)', border: '1px solid #22c55e', color: '#86efac', flex: 1 }}
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setPayingStudio(null)}
                            style={{ ...drilldownStyles.actionButton, flex: 1 }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
                {expandedStudio === studio.id && (
                  <tr>
                    <td colSpan={14} style={drilldownStyles.td}>
                      <div style={drilldownStyles.nestedWrap}>
                        {/* Payout history */}
                        {payoutHistory && payoutHistory.length > 0 && (
                          <div style={{ marginBottom: 12 }}>
                            <button
                              onClick={() => setExpandedPayout(expandedPayout === studio.id ? null : studio.id)}
                              style={{ ...drilldownStyles.actionButton, marginBottom: 6 }}
                            >
                              {expandedPayout === studio.id ? 'Hide' : 'Show'} Payout History ({payoutHistory.length})
                            </button>
                            {expandedPayout === studio.id && (
                              <table className="admin-table" style={{ ...drilldownStyles.nestedTable, marginBottom: 8 }}>
                                <thead>
                                  <tr>
                                    <th style={drilldownStyles.th}>Payout #</th>
                                    <th style={drilldownStyles.th}>Date</th>
                                    <th style={drilldownStyles.th}>Amount</th>
                                    <th style={drilldownStyles.th}>Orders Included</th>
                                    <th style={drilldownStyles.th}>Recorded By</th>
                                    <th style={drilldownStyles.th}>Notes</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {payoutHistory.map((payout: any) => (
                                    <tr key={payout.id} style={drilldownStyles.normalRow}>
                                      <td style={drilldownStyles.td}>#{payout.id}</td>
                                      <td style={drilldownStyles.td}>{payout.createdAt ? new Date(payout.createdAt).toLocaleString() : ''}</td>
                                      <td style={{ ...drilldownStyles.td, color: '#86efac', fontWeight: 700 }}>${Number(payout.amount || 0).toFixed(2)}</td>
                                      <td style={drilldownStyles.td}>{payout.orderCount} order(s)</td>
                                      <td style={drilldownStyles.td}>{payout.createdByName || '—'}</td>
                                      <td style={drilldownStyles.td}>{payout.notes || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}
                        <table className="admin-table" style={drilldownStyles.nestedTable}>
                          <thead>
                            <tr>
                              <th style={drilldownStyles.th}>Order ID</th>
                              <th style={drilldownStyles.th}>Date</th>
                              <th style={drilldownStyles.th}>Status</th>
                              <th style={drilldownStyles.th}>Paid?</th>
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
                              <tr key={order.id} style={{ ...(order.is_paid ? { background: 'rgba(34,197,94,0.06)' } : drilldownStyles.normalRow) }}>
                                <td style={drilldownStyles.td}>{order.id}</td>
                                <td style={drilldownStyles.td}>{order.created_at ? new Date(order.created_at).toLocaleString() : ''}</td>
                                <td style={drilldownStyles.td}>{order.status}</td>
                                <td style={drilldownStyles.td}>
                                  {order.is_paid
                                    ? <span style={{ color: '#86efac', fontWeight: 700, fontSize: 12 }}>✅ Paid</span>
                                    : <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: 12 }}>⏳ Unpaid</span>
                                  }
                                </td>
                                <td style={drilldownStyles.td}>${Math.max(0, Number(order.total) - Number(order.tax_amount || 0)).toFixed(2)}</td>
                                <td style={drilldownStyles.td}>${Number(order.subtotal).toFixed(2)}</td>
                                <td style={drilldownStyles.td}>${Number(order.tax_amount).toFixed(2)}</td>
                                <td style={drilldownStyles.td}>${Number(order.shipping_cost).toFixed(2)}</td>
                                <td style={drilldownStyles.td}>${Number(order.studio_shipping_cost).toFixed(2)}</td>
                                <td style={drilldownStyles.td}>${Number(order.shipping_margin).toFixed(2)}</td>
                                <td style={drilldownStyles.td}>${Number(order.stripe_fee_amount).toFixed(2)}</td>
                                <td style={{ ...drilldownStyles.td, fontWeight: 700, color: order.is_paid ? '#86efac' : '#fbbf24' }}>${Number(order.studio_profit || 0).toFixed(2)}</td>
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