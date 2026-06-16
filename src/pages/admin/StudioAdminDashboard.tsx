import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
  schedulingStats?: {
    totalBookings: number;
    pendingBookings: number;
    approvedBookings: number;
    upcomingBookings: number;
    bookingRevenue: number;
    platformFees: number;
    bookingStripeFees: number;
    studioPayouts: number;
    upcomingBookingsList: {
      id: number;
      customerName: string;
      customerEmail: string;
      slotDate: string;
      startTime: string;
      sessionTypeName: string;
      paymentStatus: string;
      paymentAmount: number;
    }[];
  };
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
  const bookingRevenue = Number(stats.schedulingStats?.bookingRevenue ?? 0);
  const bookingStripeFees = Number(stats.schedulingStats?.bookingStripeFees ?? 0);
  const bookingPlatformFees = Number(stats.schedulingStats?.platformFees ?? 0);
  const totalCombinedRevenue = totalRevenueExTax + bookingRevenue;
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

  const cardStyle: React.CSSProperties = {
    background: 'rgba(22,22,35,0.95)',
    border: '1px solid rgba(124,92,255,0.15)',
    borderRadius: 14,
    padding: '1.2rem 1.25rem 1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.15rem',
  };

  const pillBtn = (active: boolean): React.CSSProperties => ({
    background: active ? 'rgba(124,92,255,0.25)' : 'none',
    border: `1.5px solid ${active ? 'rgba(124,92,255,0.7)' : 'rgba(124,92,255,0.3)'}`,
    color: active ? '#c4b5fd' : '#7c5cff',
    borderRadius: 6,
    padding: '3px 11px',
    fontSize: '0.73rem',
    fontWeight: 700,
    cursor: active ? 'default' : 'pointer',
    transition: 'background 0.15s, border 0.15s, color 0.15s',
  });

  const sectionHeading = (icon: string, label: string): React.ReactNode => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', margin: '1.75rem 0 0.85rem' }}>
      <span style={{ fontSize: '1.1rem' }}>{icon}</span>
      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#4a4a6a', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(124,92,255,0.12)', marginLeft: '0.3rem' }} />
    </div>
  );

  const cardHeader = (icon: string, label: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
      <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{icon}</span>
      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#8b8ba0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
    </div>
  );

  return (
    <AdminLayout>
      <div style={{ padding: '0 1rem 2rem' }}>
        {/* Page header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#fff', margin: '0 0 0.3rem', letterSpacing: '-0.01em' }}>
            Studio Dashboard
          </h1>
          <p style={{ color: '#6b6b80', fontSize: '0.9rem', margin: 0 }}>
            Business overview, revenue analytics, and booking stats
          </p>
        </div>

        {/* Quick-stat summary bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '0.25rem' }}>
          {[
            { label: 'Avg Order Value', value: `$${averageOrderValue}`, color: '#7ee787' },
            { label: 'Gross Margin', value: `${marginPercent}%`, color: '#86efac' },
            { label: 'Completion Rate', value: `${completionRate}%`, color: '#79c0ff' },
            { label: 'Upcoming Bookings', value: String(stats.schedulingStats?.upcomingBookings ?? 0), color: '#a78bfa' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(22,22,35,0.9)', border: '1px solid rgba(124,92,255,0.12)', borderRadius: 10, padding: '0.7rem 0.9rem' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: s.color, letterSpacing: '-0.01em' }}>{s.value}</div>
              <div style={{ fontSize: '0.72rem', color: '#6b6b80', fontWeight: 600, marginTop: '0.1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {sectionHeading('📊', 'Sales & Orders')}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          {/* Total Revenue */}
          <div style={cardStyle}>
            {cardHeader('💰', 'Total Revenue')}
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#7ee787', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              ${totalCombinedRevenue.toFixed(2)}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#5a5a72', marginBottom: '0.5rem' }}>
              Orders ${totalRevenueExTax.toFixed(2)}{bookingRevenue > 0 ? ` · Bookings $${bookingRevenue.toFixed(2)}` : ''} · excl. tax
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: '0.6rem' }}>
              <button style={pillBtn(revenueRange === 'day')} onClick={() => setRevenueRange('day')}>Day</button>
              <button style={pillBtn(revenueRange === 'week')} onClick={() => setRevenueRange('week')}>Week</button>
              <button style={pillBtn(revenueRange === 'month')} onClick={() => setRevenueRange('month')}>Month</button>
            </div>
            <DashboardChart data={revenueChart.data} labels={revenueChart.labels} label="Revenue (ex tax)" />
          </div>

          {/* Total Orders */}
          <div style={cardStyle}>
            {cardHeader('📦', 'Total Orders')}
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#79c0ff', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              {displayTotalOrders}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#5a5a72', marginBottom: '0.5rem' }}>
              {completionRate}% completion rate
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: '0.6rem' }}>
              <button style={pillBtn(ordersRange === 'day')} onClick={() => setOrdersRange('day')}>Day</button>
              <button style={pillBtn(ordersRange === 'week')} onClick={() => setOrdersRange('week')}>Week</button>
              <button style={pillBtn(ordersRange === 'month')} onClick={() => setOrdersRange('month')}>Month</button>
            </div>
            <DashboardChart data={ordersChart.data} labels={ordersChart.labels} label="Orders" />
          </div>

          {/* Pending Orders */}
          <div style={cardStyle}>
            {cardHeader('⏳', 'Pending Orders')}
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#ffa657', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              {Number(stats.pendingOrders || 0)}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#5a5a72', marginBottom: '0.5rem' }}>
              Requires attention
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: '0.6rem' }}>
              <button style={pillBtn(pendingRange === 'day')} onClick={() => setPendingRange('day')}>Day</button>
              <button style={pillBtn(pendingRange === 'week')} onClick={() => setPendingRange('week')}>Week</button>
              <button style={pillBtn(pendingRange === 'month')} onClick={() => setPendingRange('month')}>Month</button>
            </div>
            <DashboardChart data={pendingChart.data} labels={pendingChart.labels} label="Pending Orders" />
          </div>

          {/* Total Customers */}
          <div style={cardStyle}>
            {cardHeader('👥', 'Customers')}
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#d2a8ff', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              {Number(stats.totalCustomers || 0)}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#5a5a72', marginBottom: '0.5rem' }}>
              Active user accounts
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: '0.6rem' }}>
              <button style={pillBtn(customersRange === 'day')} onClick={() => setCustomersRange('day')}>Day</button>
              <button style={pillBtn(customersRange === 'week')} onClick={() => setCustomersRange('week')}>Week</button>
              <button style={pillBtn(customersRange === 'month')} onClick={() => setCustomersRange('month')}>Month</button>
            </div>
            <DashboardChart data={customersChart.data} labels={customersChart.labels} label="New Customers" />
          </div>

          {/* Tax Collected */}
          <div style={cardStyle}>
            {cardHeader('🧾', 'Tax Collected')}
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#fbbf24', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              ${totalTax.toFixed(2)}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#5a5a72', marginBottom: '0.5rem' }}>
              From completed orders
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: '0.6rem' }}>
              <button style={pillBtn(taxRange === 'day')} onClick={() => setTaxRange('day')}>Day</button>
              <button style={pillBtn(taxRange === 'week')} onClick={() => setTaxRange('week')}>Week</button>
              <button style={pillBtn(taxRange === 'month')} onClick={() => setTaxRange('month')}>Month</button>
            </div>
            <DashboardChart data={taxChart.data} labels={taxChart.labels} label="Tax Collected" />
          </div>

          {/* Profit */}
          <div style={cardStyle}>
            {cardHeader('📈', 'Gross Profit')}
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#86efac', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              ${totalMargin.toFixed(2)}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#5a5a72', marginBottom: '0.5rem' }}>
              {marginPercent}% margin (excl. tax)
            </div>
            <div style={{ marginBottom: '0.6rem' }} />
            <DashboardChart
              data={revenueChart.data.map((v) => v * (totalRevenueExTax > 0 ? (totalMargin / totalRevenueExTax) : 0))}
              labels={revenueChart.labels}
              label="Profit"
            />
          </div>
        </div>

        {sectionHeading('📅', 'Scheduling')}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          {/* Bookings */}
          <div style={cardStyle}>
            {cardHeader('📅', <Link to="/admin/scheduling" style={{ color: 'inherit', textDecoration: 'none' }}>Bookings ↗</Link>)}
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#a78bfa', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              {stats.schedulingStats?.totalBookings ?? 0}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#5a5a72', marginBottom: '0.5rem' }}>
              {stats.schedulingStats?.upcomingBookings ?? 0} upcoming · {stats.schedulingStats?.approvedBookings ?? 0} approved
            </div>
            {(stats.schedulingStats?.pendingBookings ?? 0) > 0 && (
              <div style={{ margin: '0.4rem 0 0.6rem', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.28)', borderRadius: 8, padding: '6px 10px', fontSize: '0.78rem', color: '#f59e0b', fontWeight: 700 }}>
                {stats.schedulingStats!.pendingBookings} pending review
              </div>
            )}
            {(stats.schedulingStats?.upcomingBookingsList?.length ?? 0) > 0 && (
              <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: '0.68rem', color: '#4a4a6a', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800 }}>Upcoming Sessions</div>
                {stats.schedulingStats!.upcomingBookingsList.map(bk => (
                  <div key={bk.id} style={{ background: 'rgba(124,92,255,0.06)', border: '1px solid rgba(124,92,255,0.15)', borderRadius: 8, padding: '8px 10px', fontSize: '0.8rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#a78bfa', fontWeight: 700, fontSize: '0.82rem' }}>
                        {bk.slotDate ? new Date(bk.slotDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                        {bk.startTime ? ` · ${bk.startTime}` : ''}
                      </span>
                      {bk.paymentStatus === 'paid' && (
                        <span style={{ fontSize: '0.68rem', background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 5, padding: '1px 6px', fontWeight: 700 }}>paid</span>
                      )}
                    </div>
                    <div style={{ color: '#c9c9e0', marginTop: 3, fontWeight: 600 }}>{bk.customerName}</div>
                    {bk.sessionTypeName && <div style={{ color: '#4a4a6a', fontSize: '0.74rem', marginTop: 1 }}>{bk.sessionTypeName}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Booking Revenue */}
          <div style={cardStyle}>
            {cardHeader('💳', <Link to="/admin/scheduling" style={{ color: 'inherit', textDecoration: 'none' }}>Booking Revenue ↗</Link>)}
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#7ee787', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              ${bookingRevenue.toFixed(2)}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#5a5a72', marginBottom: '0.75rem' }}>
              From paid session bookings
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '0.7rem 0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}>
                <span style={{ color: '#5a5a72' }}>Stripe fees (est.)</span>
                <span style={{ color: '#ffa657', fontWeight: 600 }}>−${bookingStripeFees.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}>
                <span style={{ color: '#5a5a72' }}>Platform fees</span>
                <span style={{ color: '#ffa657', fontWeight: 600 }}>−${bookingPlatformFees.toFixed(2)}</span>
              </div>
              <div style={{ height: 1, background: 'rgba(124,92,255,0.15)', margin: '0.1rem 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.88rem', fontWeight: 700 }}>
                <span style={{ color: '#c9c9e0' }}>Studio payout</span>
                <span style={{ color: '#22c55e' }}>${Number(stats.schedulingStats?.studioPayouts ?? 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default StudioAdminDashboard;