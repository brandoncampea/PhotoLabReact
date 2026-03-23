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

    res.json({
      totalOrders,
      totalRevenue,
      totalCustomers,
      pendingOrders,
      recentOrders,
      topAlbums
    });
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

export default router;
