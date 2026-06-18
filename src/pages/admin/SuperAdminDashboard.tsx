



import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
    schedulingBookings: 0,
    schedulingPending: 0,
    schedulingUpcoming: 0,
    schedulingRevenue: 0,
    schedulingPlatformFees: 0,
    schedulingStripeFees: 0,
    schedulingPayouts: 0,
    schedulingUpcomingList: [] as { id: number; customerName: string; customerEmail: string; slotDate: string; startTime: string; sessionTypeName: string; paymentStatus: string; paymentAmount: number }[],
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
          schedulingBookings: Number(data.schedulingStats?.totalBookings || 0),
          schedulingPending: Number(data.schedulingStats?.pendingBookings || 0),
          schedulingUpcoming: Number(data.schedulingStats?.upcomingBookings || 0),
          schedulingRevenue: Number(data.schedulingStats?.bookingRevenue || 0),
          schedulingPlatformFees: Number(data.schedulingStats?.platformFees || 0),
          schedulingStripeFees: Number(data.schedulingStats?.bookingStripeFees || 0),
          schedulingPayouts: Number(data.schedulingStats?.studioPayouts || 0),
          schedulingUpcomingList: data.schedulingStats?.upcomingBookingsList || [],
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
        setStats({ totalRevenue: 0, totalSuperAdminRevenue: 0, totalProductsSold: 0, avgProfitPerProduct: 0, totalTax: 0, totalGrossMargin: 0, totalOrders: 0, totalCustomers: 0, pendingOrders: 0, schedulingBookings: 0, schedulingPending: 0, schedulingUpcoming: 0, schedulingRevenue: 0, schedulingPlatformFees: 0, schedulingStripeFees: 0, schedulingPayouts: 0, schedulingUpcomingList: [] });
      }
    };
    fetchChartData();
  }, []);

  const drilldownStyles = {
    title: {
      margin: 0,
      color: '#fff',
      fontWeight: 800,
      fontSize: '1.1rem',
      letterSpacing: '-0.01em',
    } as React.CSSProperties,
    table: {
      fontSize: 13,
      width: '100%',
      borderCollapse: 'separate',
      borderSpacing: 0,
      color: '#d4d4e8',
      background: 'rgba(12,12,20,0.6)',
      border: '1px solid rgba(124,92,255,0.18)',
      borderRadius: 10,
      overflow: 'hidden',
    } as React.CSSProperties,
    nestedTable: {
      fontSize: 12,
      width: '100%',
      borderCollapse: 'separate',
      borderSpacing: 0,
      color: '#d4d4e8',
      background: 'rgba(10,10,18,0.7)',
      border: '1px solid rgba(124,92,255,0.15)',
      borderRadius: 8,
      overflow: 'hidden',
    } as React.CSSProperties,
    th: {
      position: 'sticky',
      top: 0,
      zIndex: 2,
      textAlign: 'left',
      padding: '9px 12px',
      fontWeight: 700,
      fontSize: 11,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.05em',
      color: '#6b6b80',
      background: 'rgba(10,10,20,0.95)',
      borderBottom: '1px solid rgba(124,92,255,0.18)',
      whiteSpace: 'nowrap',
    } as React.CSSProperties,
    td: {
      padding: '9px 12px',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      color: '#c9c9e0',
      verticalAlign: 'top',
      whiteSpace: 'nowrap',
    } as React.CSSProperties,
    expandedRow: {
      background: 'rgba(124,92,255,0.10)',
    } as React.CSSProperties,
    normalRow: {
      background: 'transparent',
    } as React.CSSProperties,
    actionButton: {
      fontSize: 12,
      fontWeight: 700,
      color: '#a78bfa',
      background: 'rgba(124,92,255,0.12)',
      border: '1.5px solid rgba(124,92,255,0.3)',
      borderRadius: 6,
      padding: '4px 10px',
      cursor: 'pointer',
    } as React.CSSProperties,
    nestedWrap: {
      maxHeight: 320,
      overflow: 'auto',
      background: 'rgba(8,8,16,0.6)',
      borderRadius: 8,
      padding: 8,
      border: '1px solid rgba(124,92,255,0.15)',
    } as React.CSSProperties,
    summary: {
      cursor: 'pointer',
      color: '#a78bfa',
      fontWeight: 600,
    } as React.CSSProperties,
    list: {
      margin: 0,
      paddingLeft: 18,
      color: '#8b8ba8',
      lineHeight: 1.5,
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

        {/* Scheduling Bookings Widget */}
        <div className="dashboard-card tallydark-card">
          <div className="dashboard-card-label"><Link to="/admin/scheduling" style={{ color: 'inherit', textDecoration: 'none' }}>Bookings (All Studios) ↗</Link></div>
          <div className="dashboard-card-value">{stats.schedulingBookings}</div>
          <div className="dashboard-card-sub">{stats.schedulingUpcoming} upcoming · {stats.schedulingBookings - stats.schedulingPending} approved/done</div>
          {stats.schedulingPending > 0 && (
            <div style={{ marginTop: 8, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '6px 10px', fontSize: '0.8rem', color: '#f59e0b', fontWeight: 700 }}>
              {stats.schedulingPending} pending across all studios
            </div>
          )}
          {stats.schedulingUpcomingList.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: '0.75rem', color: '#6b6b80', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Upcoming</div>
              {stats.schedulingUpcomingList.map(bk => (
                <div key={bk.id} style={{ background: 'rgba(124,92,255,0.07)', border: '1px solid rgba(124,92,255,0.18)', borderRadius: 8, padding: '7px 10px', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: '#a78bfa', fontWeight: 700 }}>
                      {bk.slotDate ? new Date(bk.slotDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                      {bk.startTime ? ` · ${bk.startTime}` : ''}
                    </span>
                    {bk.paymentStatus === 'paid' && <span style={{ fontSize: '0.7rem', background: 'rgba(34,197,94,0.12)', color: '#22c55e', borderRadius: 4, padding: '1px 5px' }}>paid</span>}
                  </div>
                  <div style={{ color: '#e0e0f0', marginTop: 2 }}>{bk.customerName}</div>
                  {bk.sessionTypeName && <div style={{ color: '#6b6b80', fontSize: '0.75rem' }}>{bk.sessionTypeName}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Scheduling Revenue Widget */}
        <div className="dashboard-card tallydark-card">
          <div className="dashboard-card-label"><Link to="/admin/scheduling" style={{ color: 'inherit', textDecoration: 'none' }}>Booking Revenue (All Studios) ↗</Link></div>
          <div className="dashboard-card-value">${stats.schedulingRevenue.toFixed(2)}</div>
          <div className="dashboard-card-sub">From paid session bookings</div>
          <div style={{ marginTop: 10, fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b6b80' }}>
              <span>Stripe fees (est.)</span>
              <span style={{ color: '#f59e0b' }}>−${stats.schedulingStripeFees.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b6b80' }}>
              <span>Platform fees earned</span>
              <span style={{ color: '#22c55e' }}>+${stats.schedulingPlatformFees.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b6b80', borderTop: '1px solid #3a3656', paddingTop: 4 }}>
              <span>Studio payouts</span>
              <span style={{ color: '#f59e0b' }}>−${stats.schedulingPayouts.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>


      {/* Studio Revenue/Cost Drill-down */}
      <div style={{ marginTop: 32, width: '100%', background: 'rgba(22,22,35,0.95)', border: '1px solid rgba(124,92,255,0.15)', borderRadius: 14, padding: '1.25rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h2 style={drilldownStyles.title}>Studio Revenue & Cost Drill-down</h2>
            <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: '#5a5a72' }}>Per-studio financial breakdown with payout tracking</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ color: '#6b6b80', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Min. profit</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, border: '1.5px solid rgba(124,92,255,0.25)', borderRadius: 8, overflow: 'hidden', background: 'rgba(0,0,0,0.3)' }}>
              <span style={{ padding: '5px 8px', color: '#6b6b80', fontSize: 13, fontWeight: 700, borderRight: '1px solid rgba(124,92,255,0.15)' }}>$</span>
              <input
                type="number"
                min={0}
                step={1}
                value={profitThreshold}
                onChange={e => setProfitThreshold(Number(e.target.value))}
                style={{ width: 80, padding: '5px 8px', border: 'none', background: 'transparent', color: '#e0e0f0', fontSize: 13, outline: 'none' }}
                placeholder="0"
              />
            </div>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {studioDetails
            .filter(({ summary }: any) => Number(summary.currentStudioProfit || 0) >= profitThreshold)
            .map(({ studio, summary, orders, payoutHistory }: any) => {
              const isExpanded = expandedStudio === studio.id;
              const currentProfit = Number(summary.currentStudioProfit || 0);
              const totalProfit = Number(summary.totalStudioProfit || 0);
              const revenue = Math.max(0, Number(summary.totalRevenue) - Number(summary.totalTax || 0));

              const statCell = (label: string, value: string, color?: string) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: '#5a5a72' }}>{label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: color || '#d4d4e8' }}>{value}</span>
                </div>
              );

              return (
                <div
                  key={studio.id}
                  style={{
                    background: isExpanded ? 'rgba(124,92,255,0.06)' : 'rgba(14,14,24,0.7)',
                    border: `1px solid ${isExpanded ? 'rgba(124,92,255,0.3)' : 'rgba(124,92,255,0.12)'}`,
                    borderRadius: 10,
                    overflow: 'hidden',
                    transition: 'border-color 0.2s',
                  }}
                >
                  {/* Card header row */}
                  <div style={{ padding: '0.8rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: 1 }}>
                      <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff' }}>{studio.name}</span>
                      <span style={{ fontSize: 11, color: '#6b6b80' }}>{summary.orderCount} order{summary.orderCount !== 1 ? 's' : ''}</span>

                      {/* Primary stats inline */}
                      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginLeft: 8 }}>
                        {statCell('Revenue', `$${revenue.toFixed(2)}`)}
                        {statCell('Total Profit', `$${totalProfit.toFixed(2)}`, '#7ee787')}
                        {statCell('Current Profit', `$${currentProfit.toFixed(2)}`, currentProfit > 0 ? '#fbbf24' : '#5a5a72')}
                        {statCell('Paid Out', `$${Number(summary.totalPayouts || 0).toFixed(2)}`)}
                      </div>

                      {/* Secondary stats */}
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: '#4a4a6a', marginLeft: 4 }}>
                        <span>Tax ${Number(summary.totalTax).toFixed(2)}</span>
                        <span>Stripe ${Number(summary.totalStripeFees).toFixed(2)}</span>
                        <span>Ship margin ${Number(summary.totalShippingMargin).toFixed(2)}</span>
                        <span>Discounts ${Number(summary.totalDiscounts).toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                      <button
                        onClick={() => setExpandedStudio(isExpanded ? null : studio.id)}
                        style={drilldownStyles.actionButton}
                      >
                        {isExpanded ? 'Hide' : 'View Orders'}
                      </button>
                      {currentProfit > 0 && (
                        <button
                          onClick={() => { setPayingStudio(studio.id); setPayoutNotes(''); setPayoutError(''); setPayoutSuccess(''); }}
                          style={{ ...drilldownStyles.actionButton, background: 'rgba(34,197,94,0.12)', border: '1.5px solid rgba(34,197,94,0.35)', color: '#7ee787' }}
                        >
                          Mark as Paid
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Payout confirmation form */}
                  {payingStudio === studio.id && (
                    <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(34,197,94,0.05)' }}>
                      <div style={{ color: '#7ee787', fontWeight: 700, marginBottom: 8, fontSize: 12 }}>
                        Pay ${currentProfit.toFixed(2)} for {orders.filter((o: any) => !o.is_paid).length} unpaid order(s)
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="text"
                          placeholder="Notes (optional)"
                          value={payoutNotes}
                          onChange={e => setPayoutNotes(e.target.value)}
                          style={{ flex: 1, minWidth: 180, padding: '5px 8px', borderRadius: 6, border: '1.5px solid rgba(124,92,255,0.25)', background: 'rgba(0,0,0,0.3)', color: '#e0e0f0', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                        />
                        <button onClick={() => handleMarkAsPaid(studio.id)} style={{ ...drilldownStyles.actionButton, background: 'rgba(34,197,94,0.15)', border: '1.5px solid rgba(34,197,94,0.4)', color: '#7ee787' }}>Confirm</button>
                        <button onClick={() => setPayingStudio(null)} style={drilldownStyles.actionButton}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* Expanded order details */}
                  {isExpanded && (
                    <div style={{ padding: '0.75rem 1rem' }}>
                      {/* Payout history */}
                      {payoutHistory && payoutHistory.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <button
                            onClick={() => setExpandedPayout(expandedPayout === studio.id ? null : studio.id)}
                            style={{ ...drilldownStyles.actionButton, marginBottom: 8 }}
                          >
                            {expandedPayout === studio.id ? 'Hide' : 'Show'} Payout History ({payoutHistory.length})
                          </button>
                          {expandedPayout === studio.id && (
                            <div style={{ overflowX: 'auto' }}>
                              <table style={{ ...drilldownStyles.nestedTable, marginBottom: 8 }}>
                                <thead>
                                  <tr>
                                    <th style={drilldownStyles.th}>Payout #</th>
                                    <th style={drilldownStyles.th}>Date</th>
                                    <th style={drilldownStyles.th}>Amount</th>
                                    <th style={drilldownStyles.th}>Orders</th>
                                    <th style={drilldownStyles.th}>Recorded By</th>
                                    <th style={drilldownStyles.th}>Notes</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {payoutHistory.map((payout: any) => (
                                    <tr key={payout.id}>
                                      <td style={drilldownStyles.td}>#{payout.id}</td>
                                      <td style={drilldownStyles.td}>{payout.createdAt ? new Date(payout.createdAt).toLocaleString() : ''}</td>
                                      <td style={{ ...drilldownStyles.td, color: '#7ee787', fontWeight: 700 }}>${Number(payout.amount || 0).toFixed(2)}</td>
                                      <td style={drilldownStyles.td}>{payout.orderCount}</td>
                                      <td style={drilldownStyles.td}>{payout.createdByName || '—'}</td>
                                      <td style={drilldownStyles.td}>{payout.notes || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Orders table */}
                      <div style={{ overflowX: 'auto' }}>
                        <table style={drilldownStyles.nestedTable}>
                          <thead>
                            <tr>
                              <th style={drilldownStyles.th}>Order</th>
                              <th style={drilldownStyles.th}>Date</th>
                              <th style={drilldownStyles.th}>Status</th>
                              <th style={drilldownStyles.th}>Paid?</th>
                              <th style={drilldownStyles.th}>Revenue</th>
                              <th style={drilldownStyles.th}>Tax</th>
                              <th style={drilldownStyles.th}>Shipping</th>
                              <th style={drilldownStyles.th}>Stripe Fee</th>
                              <th style={drilldownStyles.th}>Profit</th>
                              <th style={drilldownStyles.th}>Discount</th>
                              <th style={drilldownStyles.th}>Items</th>
                            </tr>
                          </thead>
                          <tbody>
                            {orders.map((order: any) => (
                              <tr key={order.id} style={order.is_paid ? { background: 'rgba(34,197,94,0.05)' } : {}}>
                                <td style={drilldownStyles.td}>#{order.id}</td>
                                <td style={drilldownStyles.td}>{order.created_at ? new Date(order.created_at).toLocaleDateString() : ''}</td>
                                <td style={drilldownStyles.td}>{order.status}</td>
                                <td style={drilldownStyles.td}>
                                  {order.is_paid
                                    ? <span style={{ color: '#7ee787', fontWeight: 700, fontSize: 11 }}>Paid</span>
                                    : <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: 11 }}>Unpaid</span>
                                  }
                                </td>
                                <td style={drilldownStyles.td}>${Math.max(0, Number(order.total) - Number(order.tax_amount || 0)).toFixed(2)}</td>
                                <td style={drilldownStyles.td}>${Number(order.tax_amount).toFixed(2)}</td>
                                <td style={drilldownStyles.td}>${Number(order.shipping_cost).toFixed(2)}</td>
                                <td style={drilldownStyles.td}>${Number(order.stripe_fee_amount).toFixed(2)}</td>
                                <td style={{ ...drilldownStyles.td, fontWeight: 700, color: order.is_paid ? '#7ee787' : '#fbbf24' }}>${Number(order.studio_profit || 0).toFixed(2)}</td>
                                <td style={drilldownStyles.td}>{order.discount_code || '—'}</td>
                                <td style={drilldownStyles.td}>
                                  {order.items && order.items.length > 0 ? (() => {
                                    // Group items by package_group_id
                                    const pkgMap = new Map<number, { name: string; price: number; items: any[] }>();
                                    const standalone: any[] = [];
                                    for (const item of order.items) {
                                      if (item.package_group_id && item.package_name) {
                                        if (!pkgMap.has(item.package_group_id)) {
                                          pkgMap.set(item.package_group_id, { name: item.package_name, price: item.package_price, items: [] });
                                        }
                                        pkgMap.get(item.package_group_id)!.items.push(item);
                                      } else {
                                        standalone.push(item);
                                      }
                                    }
                                    const pkgCount = pkgMap.size;
                                    const n = order.items.length;
                                    const summaryText = pkgCount > 0
                                      ? `${n} item${n !== 1 ? 's' : ''} (${pkgCount} pkg)`
                                      : `${n} item${n !== 1 ? 's' : ''}`;
                                    return (
                                      <details>
                                        <summary style={drilldownStyles.summary}>{summaryText}</summary>
                                        <ul style={{ ...drilldownStyles.list, marginTop: 6 }}>
                                          {[...pkgMap.entries()].map(([pgId, pkg]) => (
                                            <React.Fragment key={`pkg-${pgId}`}>
                                              <li style={{ fontWeight: 700, color: '#a78bfa', listStyle: 'none', marginBottom: 2 }}>
                                                📦 {pkg.name} — ${Number(pkg.price || 0).toFixed(2)}
                                              </li>
                                              {pkg.items.map((item: any) => (
                                                <li key={item.id} style={{ marginLeft: 12, color: '#a1a1aa', fontSize: 11 }}>
                                                  {item.product_name || `Product ${item.product_id}`}
                                                  {item.size_name ? ` (${item.size_name})` : ''}
                                                  {` × ${item.quantity}`}
                                                </li>
                                              ))}
                                            </React.Fragment>
                                          ))}
                                          {standalone.map((item: any) => (
                                            <li key={item.id}>
                                              {item.product_name || `Product ${item.product_id}`}
                                              {item.size_name ? ` (${item.size_name})` : ''}
                                              {` × ${item.quantity} — $${Number(item.price).toFixed(2)}`}
                                            </li>
                                          ))}
                                        </ul>
                                      </details>
                                    );
                                  })() : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;