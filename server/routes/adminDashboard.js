import express from 'express';
import mssql from '../mssql.cjs';
import { adminRequired } from '../middleware/auth.js';

const { queryRow, queryRows } = mssql;
const router = express.Router();

// Super admin: Get all studio revenue/costs with drill-down
router.get('/studio-revenue-details', adminRequired, async (req, res) => {
    try {
        // Only super admins
        if (req.user?.role !== 'super_admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }
        // Get all studios
        const studios = await queryRows('SELECT id, name FROM studios ORDER BY name');
        // For each studio, get revenue/costs summary and all orders
        const studioDetails = [];
        for (const studio of studios) {
            // Revenue/costs summary
            const summary = await queryRow(`
                SELECT COUNT(*) as orderCount,
                             COALESCE(SUM(total),0) as totalRevenue,
                             COALESCE(SUM(subtotal),0) as totalSubtotal,
                             COALESCE(SUM(tax_amount),0) as totalTax,
                             COALESCE(SUM(shipping_cost),0) as totalShipping,
                             COALESCE(SUM(studio_shipping_cost),0) as totalStudioShipping,
                             COALESCE(SUM(shipping_margin),0) as totalShippingMargin,
                             COALESCE(SUM(stripe_fee_amount),0) as totalStripeFees,
                             COALESCE(SUM(total - subtotal),0) as totalDiscounts
                FROM orders WHERE studio_id = $1
            `, [studio.id]);
            // All orders for this studio
            const orders = await queryRows(`
                SELECT id, user_id, total, subtotal, tax_amount, shipping_cost, studio_shipping_cost, shipping_margin, stripe_fee_amount, discount_code, created_at, status
                FROM orders WHERE studio_id = $1 ORDER BY created_at DESC
            `, [studio.id]);
            // For each order, get line items
            for (const order of orders) {
                order.items = await queryRows(`
                    SELECT id, product_id, product_size_id, quantity, price, photo_id
                    FROM order_items WHERE order_id = $1
                `, [order.id]);
            }
            studioDetails.push({
                studio,
                summary,
                orders
            });
        }
        res.json(studioDetails);
    } catch (err) {
        console.error('Error fetching studio revenue details:', err);
        res.status(500).json({ error: 'Failed to fetch studio revenue details' });
    }
});

router.get('/dashboard-stats', adminRequired, async (req, res) => {
    try {
        const studioId = req.user?.studio_id ? Number(req.user.studio_id) : null;
        const orderStudioFilter = studioId ? ` AND o.studio_id = ${studioId}` : '';
        const userStudioFilter = studioId ? ` AND studio_id = ${studioId}` : '';

        const totalOrdersRow = await queryRow(
            `SELECT COUNT(*) as count FROM orders o WHERE 1=1${orderStudioFilter}`
        );
        const totalOrders = totalOrdersRow?.count || 0;

        const totalRevenueRow = await queryRow(
            `SELECT ISNULL(SUM(o.total), 0) as sum
             FROM orders o
             WHERE LOWER(o.status) NOT IN ('cancelled', 'refunded')${orderStudioFilter}`
        );
        const totalRevenue = Number(totalRevenueRow?.sum || 0);

        const totalCustomersRow = studioId
            ? await queryRow(`SELECT COUNT(*) as count FROM users WHERE role = 'customer'${userStudioFilter}`)
            : await queryRow('SELECT COUNT(DISTINCT user_id) as count FROM orders');
        const totalCustomers = totalCustomersRow?.count || 0;

        const pendingOrdersRow = await queryRow(
            `SELECT COUNT(*) as count FROM orders o WHERE LOWER(o.status) = 'pending'${orderStudioFilter}`
        );
        const pendingOrders = pendingOrdersRow?.count || 0;

        const batchOrdersRow = await queryRow(
            `SELECT COUNT(*) as count FROM orders o WHERE o.is_batch = 1${orderStudioFilter}`
        );
        const batchOrders = batchOrdersRow?.count || 0;

        const recentOrders = await queryRows(
            `SELECT TOP 10
                    o.id,
                    o.user_id,
                    o.total,
                    o.status,
                    o.created_at,
                    u.email as customer_email
             FROM orders o
             LEFT JOIN users u ON u.id = o.user_id
             WHERE 1=1${orderStudioFilter}
             ORDER BY o.created_at DESC`
        );

        const revenueDayRows = await queryRows(
            `SELECT FORMAT(o.created_at, 'yyyy-MM-dd') as label, SUM(o.total) as value
             FROM orders o
             WHERE LOWER(o.status) NOT IN ('cancelled', 'refunded')
                 AND o.created_at >= DATEADD(day, -29, CAST(GETDATE() AS date))${orderStudioFilter}
             GROUP BY FORMAT(o.created_at, 'yyyy-MM-dd')
             ORDER BY label ASC`
        );

        const revenueWeekRows = await queryRows(
            `SELECT FORMAT(DATEADD(day, -1 * (DATEPART(weekday, o.created_at) - 1), CAST(o.created_at AS date)), 'yyyy-MM-dd') as label,
                            SUM(o.total) as value
             FROM orders o
             WHERE LOWER(o.status) NOT IN ('cancelled', 'refunded')
                 AND o.created_at >= DATEADD(week, -11, CAST(GETDATE() AS date))${orderStudioFilter}
             GROUP BY FORMAT(DATEADD(day, -1 * (DATEPART(weekday, o.created_at) - 1), CAST(o.created_at AS date)), 'yyyy-MM-dd')
             ORDER BY label ASC`
        );

        const revenueMonthRows = await queryRows(
            `SELECT FORMAT(o.created_at, 'yyyy-MM') as label, SUM(o.total) as value
             FROM orders o
             WHERE LOWER(o.status) NOT IN ('cancelled', 'refunded')
                 AND o.created_at >= DATEADD(month, -11, CAST(GETDATE() AS date))${orderStudioFilter}
             GROUP BY FORMAT(o.created_at, 'yyyy-MM')
             ORDER BY label ASC`
        );

        const ordersDayRows = await queryRows(
            `SELECT FORMAT(o.created_at, 'yyyy-MM-dd') as label, COUNT(*) as value
             FROM orders o
             WHERE o.created_at >= DATEADD(day, -29, CAST(GETDATE() AS date))${orderStudioFilter}
             GROUP BY FORMAT(o.created_at, 'yyyy-MM-dd')
             ORDER BY label ASC`
        );

        const ordersWeekRows = await queryRows(
            `SELECT FORMAT(DATEADD(day, -1 * (DATEPART(weekday, o.created_at) - 1), CAST(o.created_at AS date)), 'yyyy-MM-dd') as label,
                            COUNT(*) as value
             FROM orders o
             WHERE o.created_at >= DATEADD(week, -11, CAST(GETDATE() AS date))${orderStudioFilter}
             GROUP BY FORMAT(DATEADD(day, -1 * (DATEPART(weekday, o.created_at) - 1), CAST(o.created_at AS date)), 'yyyy-MM-dd')
             ORDER BY label ASC`
        );

        const ordersMonthRows = await queryRows(
            `SELECT FORMAT(o.created_at, 'yyyy-MM') as label, COUNT(*) as value
             FROM orders o
             WHERE o.created_at >= DATEADD(month, -11, CAST(GETDATE() AS date))${orderStudioFilter}
             GROUP BY FORMAT(o.created_at, 'yyyy-MM')
             ORDER BY label ASC`
        );

        const customersDayRows = await queryRows(
            `SELECT FORMAT(created_at, 'yyyy-MM-dd') as label, COUNT(*) as value
             FROM users
             WHERE created_at >= DATEADD(day, -29, CAST(GETDATE() AS date))${userStudioFilter}
             GROUP BY FORMAT(created_at, 'yyyy-MM-dd')
             ORDER BY label ASC`
        );

        const customersWeekRows = await queryRows(
            `SELECT FORMAT(DATEADD(day, -1 * (DATEPART(weekday, created_at) - 1), CAST(created_at AS date)), 'yyyy-MM-dd') as label,
                            COUNT(*) as value
             FROM users
             WHERE created_at >= DATEADD(week, -11, CAST(GETDATE() AS date))${userStudioFilter}
             GROUP BY FORMAT(DATEADD(day, -1 * (DATEPART(weekday, created_at) - 1), CAST(created_at AS date)), 'yyyy-MM-dd')
             ORDER BY label ASC`
        );

        const customersMonthRows = await queryRows(
            `SELECT FORMAT(created_at, 'yyyy-MM') as label, COUNT(*) as value
             FROM users
             WHERE created_at >= DATEADD(month, -11, CAST(GETDATE() AS date))${userStudioFilter}
             GROUP BY FORMAT(created_at, 'yyyy-MM')
             ORDER BY label ASC`
        );

        const pendingDayRows = await queryRows(
            `SELECT FORMAT(o.created_at, 'yyyy-MM-dd') as label, COUNT(*) as value
             FROM orders o
             WHERE LOWER(o.status) = 'pending'
                 AND o.created_at >= DATEADD(day, -29, CAST(GETDATE() AS date))${orderStudioFilter}
             GROUP BY FORMAT(o.created_at, 'yyyy-MM-dd')
             ORDER BY label ASC`
        );

        const pendingWeekRows = await queryRows(
            `SELECT FORMAT(DATEADD(day, -1 * (DATEPART(weekday, o.created_at) - 1), CAST(o.created_at AS date)), 'yyyy-MM-dd') as label,
                            COUNT(*) as value
             FROM orders o
             WHERE LOWER(o.status) = 'pending'
                 AND o.created_at >= DATEADD(week, -11, CAST(GETDATE() AS date))${orderStudioFilter}
             GROUP BY FORMAT(DATEADD(day, -1 * (DATEPART(weekday, o.created_at) - 1), CAST(o.created_at AS date)), 'yyyy-MM-dd')
             ORDER BY label ASC`
        );

        const pendingMonthRows = await queryRows(
            `SELECT FORMAT(o.created_at, 'yyyy-MM') as label, COUNT(*) as value
             FROM orders o
             WHERE LOWER(o.status) = 'pending'
                 AND o.created_at >= DATEADD(month, -11, CAST(GETDATE() AS date))${orderStudioFilter}
             GROUP BY FORMAT(o.created_at, 'yyyy-MM')
             ORDER BY label ASC`
        );

        const batchDayRows = await queryRows(
            `SELECT FORMAT(o.created_at, 'yyyy-MM-dd') as label, COUNT(*) as value
             FROM orders o
             WHERE o.is_batch = 1
                 AND o.created_at >= DATEADD(day, -29, CAST(GETDATE() AS date))${orderStudioFilter}
             GROUP BY FORMAT(o.created_at, 'yyyy-MM-dd')
             ORDER BY label ASC`
        );

        const batchWeekRows = await queryRows(
            `SELECT FORMAT(DATEADD(day, -1 * (DATEPART(weekday, o.created_at) - 1), CAST(o.created_at AS date)), 'yyyy-MM-dd') as label,
                            COUNT(*) as value
             FROM orders o
             WHERE o.is_batch = 1
                 AND o.created_at >= DATEADD(week, -11, CAST(GETDATE() AS date))${orderStudioFilter}
             GROUP BY FORMAT(DATEADD(day, -1 * (DATEPART(weekday, o.created_at) - 1), CAST(o.created_at AS date)), 'yyyy-MM-dd')
             ORDER BY label ASC`
        );

        const batchMonthRows = await queryRows(
            `SELECT FORMAT(o.created_at, 'yyyy-MM') as label, COUNT(*) as value
             FROM orders o
             WHERE o.is_batch = 1
                 AND o.created_at >= DATEADD(month, -11, CAST(GETDATE() AS date))${orderStudioFilter}
             GROUP BY FORMAT(o.created_at, 'yyyy-MM')
             ORDER BY label ASC`
        );

        const formatSeries = (rows) => ({
            labels: rows.map((r) => r.label),
            data: rows.map((r) => Number(r.value)),
        });

        let analytics = {
            totalVisitors: 0,
            totalPageViews: 0,
            albumViews: [],
            photoViews: [],
        };

        try {
            const analyticsStudioFilter = studioId
                ? ` AND JSON_VALUE(event_data, '$.studioId') = '${studioId}'`
                : '';

            const totalVisitorsRow = await queryRow(
                `SELECT COUNT(DISTINCT JSON_VALUE(event_data, '$.sessionId')) as count
                 FROM analytics
                 WHERE event_type = 'site_visit'${analyticsStudioFilter}`
            );
            const totalPageViewsRow = await queryRow(
                `SELECT COUNT(*) as count
                 FROM analytics
                 WHERE event_type = 'page_view'${analyticsStudioFilter}`
            );

            const albumViewsRows = await queryRows(
                `SELECT TOP 5
                    TRY_CAST(JSON_VALUE(event_data, '$.albumId') AS INT) as albumId,
                    JSON_VALUE(event_data, '$.albumName') as albumName,
                    COUNT(*) as views
                 FROM analytics
                 WHERE event_type = 'album_view'${analyticsStudioFilter}
                 GROUP BY JSON_VALUE(event_data, '$.albumId'), JSON_VALUE(event_data, '$.albumName')
                 ORDER BY views DESC`
            );

            const photoViewsRows = await queryRows(
                `SELECT TOP 5
                    TRY_CAST(JSON_VALUE(event_data, '$.photoId') AS INT) as photoId,
                    TRY_CAST(JSON_VALUE(event_data, '$.albumId') AS INT) as albumId,
                    JSON_VALUE(event_data, '$.photoFileName') as photoFileName,
                    JSON_VALUE(event_data, '$.albumName') as albumName,
                    p.thumbnail_url as thumbnailUrl,
                    p.full_image_url as fullImageUrl,
                    COUNT(*) as views
                 FROM analytics
                 LEFT JOIN photos p ON p.id = TRY_CAST(JSON_VALUE(event_data, '$.photoId') AS INT)
                 WHERE event_type = 'photo_view'${analyticsStudioFilter}
                 GROUP BY JSON_VALUE(event_data, '$.photoId'), JSON_VALUE(event_data, '$.albumId'), JSON_VALUE(event_data, '$.photoFileName'), JSON_VALUE(event_data, '$.albumName'), p.thumbnail_url, p.full_image_url
                 ORDER BY views DESC`
            );

            analytics = {
                totalVisitors: Number(totalVisitorsRow?.count || 0),
                totalPageViews: Number(totalPageViewsRow?.count || 0),
                albumViews: (albumViewsRows || []).map((r) => ({
                    albumId: Number(r.albumId || 0),
                    albumName: r.albumName || 'Unknown Album',
                    views: Number(r.views || 0),
                })),
                photoViews: (photoViewsRows || []).map((r) => ({
                    photoId: Number(r.photoId || 0),
                    albumId: Number(r.albumId || 0),
                    photoFileName: r.photoFileName || 'Unknown Photo',
                    albumName: r.albumName || 'Unknown Album',
                    thumbnailUrl: r.thumbnailUrl || null,
                    fullImageUrl: r.fullImageUrl || null,
                    views: Number(r.views || 0),
                })),
            };
        } catch {
            // Analytics table may not exist yet in some environments.
        }

        res.json({
            totalOrders,
            totalRevenue,
            totalCustomers,
            pendingOrders,
            batchOrders,
            analytics,
            recentOrders,
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
            batchOrdersSeries: {
                day: formatSeries(batchDayRows),
                week: formatSeries(batchWeekRows),
                month: formatSeries(batchMonthRows),
            },
        });
    } catch (err) {
        console.error('Error fetching dashboard stats:', err);
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});

console.log('[adminDashboard.js] Router loaded');
export default router;
