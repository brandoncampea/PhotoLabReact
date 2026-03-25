import express from 'express';
import { query, queryRow, queryRows } from '../mssql.mjs';
const router = express.Router();

// TODO: Replace with real DB queries
router.get('/dashboard-stats', async (req, res) => {
  try {
    // Total Orders
    const totalOrdersRow = await queryRow('SELECT COUNT(*) as count FROM orders');
    const totalOrders = totalOrdersRow?.count || 0;
    // Total Revenue
    const totalRevenueRow = await queryRow('SELECT ISNULL(SUM(total), 0) as sum FROM orders WHERE status = @p1', ['completed']);
    const totalRevenue = totalRevenueRow?.sum || 0;
    // Total Customers
    const totalCustomersRow = await queryRow('SELECT COUNT(DISTINCT user_id) as count FROM orders');
    const totalCustomers = totalCustomersRow?.count || 0;
    // Pending Orders
    const pendingOrdersRow = await queryRow('SELECT COUNT(*) as count FROM orders WHERE status = @p1', ['pending']);
    const pendingOrders = pendingOrdersRow?.count || 0;
    // Recent Orders (last 5)
    const recentOrders = await queryRows('SELECT TOP 5 id, user_id, total, status, created_at FROM orders ORDER BY created_at DESC');
    // Top Albums (by photo count)
    const topAlbums = await queryRows('SELECT TOP 5 id, name, photo_count FROM albums ORDER BY photo_count DESC');

    // --- Time Series Data ---
    // Revenue by day (last 30 days)
    const revenueDayRows = await queryRows(`
      SELECT FORMAT(created_at, 'yyyy-MM-dd') as label, SUM(total) as value
      FROM orders
      WHERE status = @p1 AND created_at >= DATEADD(day, -29, CAST(GETDATE() AS date))
      GROUP BY FORMAT(created_at, 'yyyy-MM-dd')
      ORDER BY label ASC
    `, ['completed']);
    // Revenue by week (last 12 weeks)
    const revenueWeekRows = await queryRows(`
      SELECT FORMAT(DATEADD(day, -1 * (DATEPART(weekday, created_at) - 1), CAST(created_at AS date)), 'yyyy-MM-dd') as label, SUM(total) as value
      FROM orders
      WHERE status = @p1 AND created_at >= DATEADD(week, -11, CAST(GETDATE() AS date))
      GROUP BY FORMAT(DATEADD(day, -1 * (DATEPART(weekday, created_at) - 1), CAST(created_at AS date)), 'yyyy-MM-dd')
      ORDER BY label ASC
    `, ['completed']);
    // Revenue by month (last 12 months)
    const revenueMonthRows = await queryRows(`
      SELECT FORMAT(created_at, 'yyyy-MM') as label, SUM(total) as value
      FROM orders
      WHERE status = @p1 AND created_at >= DATEADD(month, -11, CAST(GETDATE() AS date))
      GROUP BY FORMAT(created_at, 'yyyy-MM')
      ORDER BY label ASC
    `, ['completed']);

    // Orders by day/week/month
    const ordersDayRows = await queryRows(`
      SELECT FORMAT(created_at, 'yyyy-MM-dd') as label, COUNT(*) as value
      FROM orders
      WHERE created_at >= DATEADD(day, -29, CAST(GETDATE() AS date))
      GROUP BY FORMAT(created_at, 'yyyy-MM-dd')
      ORDER BY label ASC
    `);
    const ordersWeekRows = await queryRows(`
      SELECT FORMAT(DATEADD(day, -1 * (DATEPART(weekday, created_at) - 1), CAST(created_at AS date)), 'yyyy-MM-dd') as label, COUNT(*) as value
      FROM orders
      WHERE created_at >= DATEADD(week, -11, CAST(GETDATE() AS date))
      GROUP BY FORMAT(DATEADD(day, -1 * (DATEPART(weekday, created_at) - 1), CAST(created_at AS date)), 'yyyy-MM-dd')
      ORDER BY label ASC
    `);
    const ordersMonthRows = await queryRows(`
      SELECT FORMAT(created_at, 'yyyy-MM') as label, COUNT(*) as value
      FROM orders
      WHERE created_at >= DATEADD(month, -11, CAST(GETDATE() AS date))
      GROUP BY FORMAT(created_at, 'yyyy-MM')
      ORDER BY label ASC
    `);

    // Customers by day/week/month (unique new customers)
    const customersDayRows = await queryRows(`
      SELECT FORMAT(created_at, 'yyyy-MM-dd') as label, COUNT(*) as value
      FROM users
      WHERE created_at >= DATEADD(day, -29, CAST(GETDATE() AS date))
      GROUP BY FORMAT(created_at, 'yyyy-MM-dd')
      ORDER BY label ASC
    `);
    const customersWeekRows = await queryRows(`
      SELECT FORMAT(DATEADD(day, -1 * (DATEPART(weekday, created_at) - 1), CAST(created_at AS date)), 'yyyy-MM-dd') as label, COUNT(*) as value
      FROM users
      WHERE created_at >= DATEADD(week, -11, CAST(GETDATE() AS date))
      GROUP BY FORMAT(DATEADD(day, -1 * (DATEPART(weekday, created_at) - 1), CAST(created_at AS date)), 'yyyy-MM-dd')
      ORDER BY label ASC
    `);
    const customersMonthRows = await queryRows(`
      SELECT FORMAT(created_at, 'yyyy-MM') as label, COUNT(*) as value
      FROM users
      WHERE created_at >= DATEADD(month, -11, CAST(GETDATE() AS date))
      GROUP BY FORMAT(created_at, 'yyyy-MM')
      ORDER BY label ASC
    `);

    // Pending Orders by day/week/month
    const pendingDayRows = await queryRows(`
      SELECT FORMAT(created_at, 'yyyy-MM-dd') as label, COUNT(*) as value
      FROM orders
      WHERE status = @p1 AND created_at >= DATEADD(day, -29, CAST(GETDATE() AS date))
      GROUP BY FORMAT(created_at, 'yyyy-MM-dd')
      ORDER BY label ASC
    `, ['pending']);
    const pendingWeekRows = await queryRows(`
      SELECT FORMAT(DATEADD(day, -1 * (DATEPART(weekday, created_at) - 1), CAST(created_at AS date)), 'yyyy-MM-dd') as label, COUNT(*) as value
      FROM orders
      WHERE status = @p1 AND created_at >= DATEADD(week, -11, CAST(GETDATE() AS date))
      GROUP BY FORMAT(DATEADD(day, -1 * (DATEPART(weekday, created_at) - 1), CAST(created_at AS date)), 'yyyy-MM-dd')
      ORDER BY label ASC
    `, ['pending']);
    const pendingMonthRows = await queryRows(`
      SELECT FORMAT(created_at, 'yyyy-MM') as label, COUNT(*) as value
      FROM orders
      WHERE status = @p1 AND created_at >= DATEADD(month, -11, CAST(GETDATE() AS date))
      GROUP BY FORMAT(created_at, 'yyyy-MM')
      ORDER BY label ASC
    `, ['pending']);

    // Helper to format series
    const formatSeries = (rows) => ({
      labels: rows.map(r => r.label),
      data: rows.map(r => Number(r.value)),
    });

    res.json({
      totalOrders,
      totalRevenue,
      totalCustomers,
      pendingOrders,
      recentOrders,
      topAlbums,
      revenueSeries: {
        day: formatSeries(revenueDayRows),
        week: formatSeries(revenueWeekRows),
        month: formatSeries(revenueMonthRows),
      },
      ordersSeries: {
        day: formatSeries(ordersDayRows),
        week: formatSeries(ordersWeekRows),
        month: formatSeries(ordersMonthRows),
      },
      customersSeries: {
        day: formatSeries(customersDayRows),
        week: formatSeries(customersWeekRows),
        month: formatSeries(customersMonthRows),
      },
      pendingOrdersSeries: {
        day: formatSeries(pendingDayRows),
        week: formatSeries(pendingWeekRows),
        month: formatSeries(pendingMonthRows),
      },
    });
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

export default router;
