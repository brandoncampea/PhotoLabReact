import express from 'express';
import mssql from '../mssql.cjs';
import { adminRequired } from '../middleware/auth.js';

const { queryRow, queryRows, query } = mssql;
const router = express.Router();

const roundCurrency = (value) => {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) return 0;
    return Number(numeric.toFixed(2));
};

const resolveOrderDiscountAmount = ({ subtotal, shippingCost, taxAmount, totalAmount, discountCode }) => {
    const code = String(discountCode || '').trim();
    if (!code) return 0;

    const normalizedSubtotal = roundCurrency(subtotal);
    const normalizedShipping = roundCurrency(shippingCost);
    const normalizedTax = roundCurrency(taxAmount);
    const normalizedTotal = roundCurrency(totalAmount);

    const preferredComputed = roundCurrency((normalizedSubtotal + normalizedTax) - normalizedTotal);
    const fallbackComputed = roundCurrency((normalizedSubtotal + normalizedTax + normalizedShipping) - normalizedTotal);

    if (Number.isFinite(preferredComputed) && preferredComputed > 0) {
        return preferredComputed;
    }
    if (Number.isFinite(fallbackComputed) && fallbackComputed > 0) {
        return fallbackComputed;
    }
    return 0;
};

// Helper: ensure payout tracking tables exist
const ensurePayoutTables = async () => {
    const hasPayoutsTable = await queryRow(
        `SELECT CASE WHEN OBJECT_ID('studio_profit_payouts', 'U') IS NOT NULL THEN 1 ELSE 0 END as exists_`
    );
    if (!Number(hasPayoutsTable?.exists_)) {
        await query(`
            CREATE TABLE studio_profit_payouts (
                id INT IDENTITY(1,1) PRIMARY KEY,
                studio_id INT NOT NULL,
                amount FLOAT NOT NULL,
                notes NVARCHAR(MAX) NULL,
                created_by_user_id INT NULL,
                created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }
    const hasOrdersTable = await queryRow(
        `SELECT CASE WHEN OBJECT_ID('studio_payout_orders', 'U') IS NOT NULL THEN 1 ELSE 0 END as exists_`
    );
    if (!Number(hasOrdersTable?.exists_)) {
        await query(`
            CREATE TABLE studio_payout_orders (
                id INT IDENTITY(1,1) PRIMARY KEY,
                payout_id INT NOT NULL,
                order_id INT NOT NULL,
                CONSTRAINT uq_payout_order UNIQUE (payout_id, order_id)
            )
        `);
    }
};

// Super admin: Get all studio revenue/costs with drill-down
router.get('/studio-revenue-details', adminRequired, async (req, res) => {
    try {
        // Only super admins
        if (req.user?.role !== 'super_admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const [hasProductSizeIdRow, hasPackageNameRow] = await Promise.all([
            queryRow(`SELECT CASE WHEN COL_LENGTH('order_items', 'product_size_id') IS NOT NULL THEN 1 ELSE 0 END as v`),
            queryRow(`SELECT CASE WHEN COL_LENGTH('order_items', 'package_name') IS NOT NULL THEN 1 ELSE 0 END as v`),
        ]);
        const hasProductSizeId = Number(hasProductSizeIdRow?.v || 0) === 1;
        const hasPackageCols = Number(hasPackageNameRow?.v || 0) === 1;

        await ensurePayoutTables();

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
                             COALESCE(SUM(CASE WHEN discount_code IS NOT NULL AND discount_code <> '' AND (subtotal + tax_amount + shipping_cost - total) > 0 THEN (subtotal + tax_amount + shipping_cost - total) ELSE 0 END),0) as totalDiscounts
                FROM orders WHERE studio_id = $1
            `, [studio.id]);

            // All orders for this studio
            const orders = await queryRows(`
                SELECT
                  o.id,
                  o.user_id,
                  o.total,
                  o.subtotal,
                  o.tax_amount,
                  o.shipping_cost,
                  o.studio_shipping_cost,
                  o.shipping_margin,
                  o.stripe_fee_amount,
                  o.discount_code,
                  o.created_at,
                  o.status,
                  COALESCE(SUM(oi.price * oi.quantity), 0) as studio_revenue,
                  COALESCE(SUM(COALESCE(${hasProductSizeId ? 'ps.price' : 'NULL'}, p.price, 0) * oi.quantity), 0) as base_revenue
                FROM orders o
                LEFT JOIN order_items oi ON oi.order_id = o.id
                LEFT JOIN products p ON p.id = oi.product_id
                ${hasProductSizeId ? 'LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id' : ''}
                WHERE o.studio_id = $1
                GROUP BY o.id, o.user_id, o.total, o.subtotal, o.tax_amount, o.shipping_cost, o.studio_shipping_cost, o.shipping_margin, o.stripe_fee_amount, o.discount_code, o.created_at, o.status
                ORDER BY o.created_at DESC
            `, [studio.id]);

            // Fetch paid order IDs for this studio
            const paidOrderRows = await queryRows(`
                SELECT spo.order_id, spo.payout_id
                FROM studio_payout_orders spo
                INNER JOIN studio_profit_payouts spp ON spp.id = spo.payout_id
                WHERE spp.studio_id = $1
            `, [studio.id]);
            const paidOrderMap = new Map(paidOrderRows.map(r => [Number(r.order_id), Number(r.payout_id)]));

            // For each order, get line items and mark paid status
            for (const order of orders) {
                const studioRevenue = Number(order.studio_revenue || 0);
                const baseRevenue = Number(order.base_revenue || 0);
                const stripeFeeAmount = Number(order.stripe_fee_amount || 0);
                const discountAmount = resolveOrderDiscountAmount({
                    subtotal: order.subtotal,
                    shippingCost: order.shipping_cost,
                    taxAmount: order.tax_amount,
                    totalAmount: order.total,
                    discountCode: order.discount_code,
                });
                const studioRevenueNet = Math.max(0, studioRevenue - discountAmount);
                order.studio_profit = studioRevenueNet - baseRevenue - stripeFeeAmount;
                order.is_paid = paidOrderMap.has(Number(order.id));
                order.payout_id = paidOrderMap.get(Number(order.id)) || null;

                order.items = await queryRows(`
                    SELECT
                        oi.id,
                        oi.product_id,
                        oi.product_size_id,
                        oi.quantity,
                        oi.price,
                        oi.photo_id,
                        p.name as product_name,
                        ${hasProductSizeId ? 'ps.size_name' : "CAST(NULL AS NVARCHAR(255))"} as size_name
                        ${hasPackageCols ? ', oi.package_name, oi.package_price, oi.package_group_id' : ", CAST(NULL AS NVARCHAR(256)) as package_name, CAST(NULL AS DECIMAL(10,2)) as package_price, CAST(NULL AS INT) as package_group_id"}
                    FROM order_items oi
                    LEFT JOIN products p ON p.id = oi.product_id
                    ${hasProductSizeId ? 'LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id' : ''}
                    WHERE oi.order_id = $1
                `, [order.id]);
            }

            const totalStudioProfit = orders.reduce(
                (sum, order) => sum + Number(order.studio_profit || 0),
                0
            );
            const currentStudioProfit = orders
                .filter(o => !o.is_paid)
                .reduce((sum, order) => sum + Number(order.studio_profit || 0), 0);

            // Payout history for this studio
            const payoutHistory = await queryRows(`
                SELECT spp.id, spp.amount, spp.notes, spp.created_at as createdAt,
                       u.name as createdByName,
                       (SELECT COUNT(*) FROM studio_payout_orders spo WHERE spo.payout_id = spp.id) as orderCount
                FROM studio_profit_payouts spp
                LEFT JOIN users u ON u.id = spp.created_by_user_id
                WHERE spp.studio_id = $1
                ORDER BY spp.created_at DESC
            `, [studio.id]);
            const totalPayouts = payoutHistory.reduce((s, p) => s + Number(p.amount || 0), 0);

            studioDetails.push({
                studio,
                summary: {
                    ...summary,
                    totalStudioProfit,
                    currentStudioProfit,
                    totalPayouts,
                },
                orders,
                payoutHistory,
            });
        }
        res.json(studioDetails);
    } catch (err) {
        console.error('Error fetching studio revenue details:', err);
        res.status(500).json({ error: 'Failed to fetch studio revenue details' });
    }
});

// Super admin: Mark a studio's current unpaid orders as paid
router.post('/studio-payout/:studioId', adminRequired, async (req, res) => {
    try {
        if (req.user?.role !== 'super_admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const studioId = Number(req.params.studioId);
        if (!Number.isInteger(studioId) || studioId <= 0) {
            return res.status(400).json({ error: 'Invalid studio id' });
        }

        await ensurePayoutTables();

        const hasProductSizeIdRow = await queryRow(
            `SELECT CASE WHEN COL_LENGTH('order_items', 'product_size_id') IS NOT NULL THEN 1 ELSE 0 END as hasProductSizeId`
        );
        const hasProductSizeId = Number(hasProductSizeIdRow?.hasProductSizeId || 0) === 1;

        // Get all unpaid orders for this studio
        const allOrders = await queryRows(`
            SELECT
              o.id,
              o.stripe_fee_amount,
              COALESCE(SUM(oi.price * oi.quantity), 0) as studio_revenue,
              COALESCE(SUM(COALESCE(${hasProductSizeId ? 'ps.price' : 'NULL'}, p.price, 0) * oi.quantity), 0) as base_revenue
            FROM orders o
            LEFT JOIN order_items oi ON oi.order_id = o.id
            LEFT JOIN products p ON p.id = oi.product_id
            ${hasProductSizeId ? 'LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id' : ''}
            WHERE o.studio_id = $1
            GROUP BY o.id, o.stripe_fee_amount
        `, [studioId]);

        const paidOrderRows = await queryRows(`
            SELECT spo.order_id FROM studio_payout_orders spo
            INNER JOIN studio_profit_payouts spp ON spp.id = spo.payout_id
            WHERE spp.studio_id = $1
        `, [studioId]);
        const paidOrderIds = new Set(paidOrderRows.map(r => Number(r.order_id)));

        const unpaidOrders = allOrders.filter(o => !paidOrderIds.has(Number(o.id)));
        if (unpaidOrders.length === 0) {
            return res.status(400).json({ error: 'No unpaid orders for this studio' });
        }

        const amount = unpaidOrders.reduce((sum, o) => {
            const studioRevenue = Number(o.studio_revenue || 0);
            const baseRevenue = Number(o.base_revenue || 0);
            const stripeFeeAmount = Number(o.stripe_fee_amount || 0);
            return sum + (studioRevenue - baseRevenue - stripeFeeAmount);
        }, 0);

        const notes = req.body?.notes || null;

        // Insert payout record
        const payout = await queryRow(`
            INSERT INTO studio_profit_payouts (studio_id, amount, notes, created_by_user_id)
            OUTPUT INSERTED.id, INSERTED.studio_id as studioId, INSERTED.amount, INSERTED.notes, INSERTED.created_at as createdAt
            VALUES ($1, $2, $3, $4)
        `, [studioId, amount, notes, req.user?.id || null]);

        // Link unpaid orders to the payout
        for (const order of unpaidOrders) {
            await query(`
                INSERT INTO studio_payout_orders (payout_id, order_id)
                VALUES ($1, $2)
            `, [payout.id, order.id]);
        }

        res.status(201).json({
            message: 'Studio marked as paid',
            payout,
            orderCount: unpaidOrders.length,
            orderIds: unpaidOrders.map(o => Number(o.id)),
        });
    } catch (err) {
        console.error('Error creating studio payout:', err);
        res.status(500).json({ error: 'Failed to record studio payout' });
    }
});

router.get('/dashboard-stats', adminRequired, async (req, res) => {
            // Debug logging for session/cookie comparison
            console.log('[ADMIN DASHBOARD-STATS ROUTE] --- DEBUG START ---');
            console.log('[ADMIN DASHBOARD-STATS ROUTE] sessionID:', req.sessionID);
            console.log('[ADMIN DASHBOARD-STATS ROUTE] session:', req.session);
            if (req.headers.cookie) {
                console.log('[ADMIN DASHBOARD-STATS ROUTE] req.headers.cookie:', req.headers.cookie);
                const sidMatch = req.headers.cookie.match(/connect\.sid=([^;]+)/);
                if (sidMatch) {
                    console.log('[ADMIN DASHBOARD-STATS ROUTE] Parsed connect.sid from cookie:', decodeURIComponent(sidMatch[1]));
                }
            }
            console.log('[ADMIN DASHBOARD-STATS ROUTE] --- DEBUG END ---');
    try {
        const isSuperAdmin = req.user?.role === 'super_admin';
        const studioId = req.user?.acting_studio_id
          ? Number(req.user.acting_studio_id)
          : (!isSuperAdmin && req.user?.studio_id ? Number(req.user.studio_id) : null);
        const orderStudioFilter = studioId ? `o.studio_id = ${studioId}` : '';
        const customerStudioFilter = studioId ? `studio_id = ${studioId}` : '';
        const userStudioFilter = studioId ? ` AND studio_id = ${studioId}` : '';

        const totalOrdersRow = await queryRow(
            `SELECT COUNT(*) as count FROM orders o WHERE 1=1${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}`
        );
        const totalOrders = totalOrdersRow?.count || 0;

        const totalRevenueRow = await queryRow(
            `SELECT ISNULL(SUM(o.total), 0) as sum
             FROM orders o
             WHERE LOWER(o.status) NOT IN ('cancelled', 'refunded')${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}`
        );
        const totalRevenue = Number(totalRevenueRow?.sum || 0);

        const revenueCompositionRow = await queryRow(
            `SELECT
                COALESCE(SUM(COALESCE(o.subtotal, 0)), 0) as totalSubtotal,
                COALESCE(SUM(COALESCE(o.tax_amount, 0)), 0) as totalTax,
                COALESCE(SUM(COALESCE(o.shipping_cost, 0)), 0) as totalShipping,
                COALESCE(SUM(CASE
                    WHEN (COALESCE(o.subtotal, 0) + COALESCE(o.tax_amount, 0) + COALESCE(o.shipping_cost, 0) - COALESCE(o.total, 0)) > 0
                    THEN (COALESCE(o.subtotal, 0) + COALESCE(o.tax_amount, 0) + COALESCE(o.shipping_cost, 0) - COALESCE(o.total, 0))
                    ELSE 0
                END), 0) as totalDiscounts
             FROM orders o
             WHERE LOWER(o.status) NOT IN ('cancelled', 'refunded')${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}`
        );

                const hasProductSizeIdRow = await queryRow(
                        `SELECT CASE WHEN COL_LENGTH('order_items', 'product_size_id') IS NOT NULL THEN 1 ELSE 0 END as hasProductSizeId`
                );
                const hasProductSizeId = Number(hasProductSizeIdRow?.hasProductSizeId || 0) === 1;

                const revenueBreakdownRow = await queryRow(
                        `SELECT
                                COALESCE(SUM(oi.price * oi.quantity), 0) as totalStudioRevenue,
                                COALESCE(SUM(COALESCE(${hasProductSizeId ? 'ps.price' : 'NULL'}, p.price, 0) * oi.quantity), 0) as totalBaseRevenue,
                        COALESCE(SUM(COALESCE(${hasProductSizeId ? 'ps.cost' : 'NULL'}, p.cost, 0) * oi.quantity), 0) as totalWhccCost,
                        COALESCE(SUM(COALESCE(oi.quantity, 0)), 0) as totalProductsSold,
                                COALESCE(SUM(COALESCE(o.shipping_margin, 0)), 0) as totalShippingMargin,
                                COALESCE(SUM(
                                        COALESCE(o.stripe_fee_amount, 0) *
                                        CASE
                                            WHEN COALESCE(orderTotals.totalItemRevenue, 0) <= 0 THEN 0
                                            ELSE ((oi.price * oi.quantity) / orderTotals.totalItemRevenue)
                                        END
                                ), 0) as totalStripeFees
                         FROM orders o
                         INNER JOIN order_items oi ON oi.order_id = o.id
                         LEFT JOIN (
                             SELECT order_id, COALESCE(SUM(price * quantity), 0) as totalItemRevenue
                             FROM order_items
                             GROUP BY order_id
                         ) orderTotals ON orderTotals.order_id = o.id
                         LEFT JOIN products p ON p.id = oi.product_id
                         ${hasProductSizeId ? 'LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id' : ''}
                         WHERE LOWER(o.status) NOT IN ('cancelled', 'refunded')${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}`
                );

                const breakdownStudioRevenue = Number(revenueBreakdownRow?.totalStudioRevenue || 0);
                const breakdownBaseRevenue = Number(revenueBreakdownRow?.totalBaseRevenue || 0);
                // Super Admin Revenue = base price × qty (what studios pay the platform)
                // Super admin revenue = what customers actually paid (studio markup price)
                const breakdownSuperAdminRevenue = breakdownStudioRevenue;
                const breakdownWhccCost = Number(revenueBreakdownRow?.totalWhccCost || 0);
                const totalProductsSold = Number(revenueBreakdownRow?.totalProductsSold || 0);
                const breakdownShippingMargin = Number(revenueBreakdownRow?.totalShippingMargin || 0);
                const breakdownStripeFees = Number(revenueBreakdownRow?.totalStripeFees || 0);
                // Total profit = (markup price - WHCC cost) × qty
                const totalGrossMargin = breakdownStudioRevenue - breakdownWhccCost;
                const avgProfitPerProduct = totalProductsSold > 0 ? (totalGrossMargin / totalProductsSold) : 0;

        // Always count unique user_id from orders for total customers (active customers)
        const totalCustomersRow = await queryRow(`SELECT COUNT(DISTINCT user_id) as count FROM orders${customerStudioFilter ? ' WHERE ' + customerStudioFilter : ''}`);
        const totalCustomers = totalCustomersRow?.count || 0;

        const pendingOrdersRow = await queryRow(
            `SELECT COUNT(*) as count FROM orders o WHERE LOWER(o.status) = 'pending'${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}`
        );
        const pendingOrders = pendingOrdersRow?.count || 0;

        const batchOrdersRow = await queryRow(
            `SELECT COUNT(*) as count FROM orders o WHERE o.is_batch = 1${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}`
        );
        const batchOrders = batchOrdersRow?.count || 0;

        const recentOrderRows = await queryRows(
            `SELECT TOP 10
                o.id,
                o.user_id,
                o.total,
                o.subtotal,
                o.tax_amount,
                o.shipping_cost,
                o.discount_code,
                o.status,
                o.created_at,
                u.email as customer_email,
                COALESCE(SUM(oi.price * oi.quantity), 0) as studioRevenue,
                COALESCE(SUM(COALESCE(${hasProductSizeId ? 'ps.price' : 'NULL'}, p.price, 0) * oi.quantity), 0) as baseRevenue,
                COALESCE(MAX(COALESCE(o.stripe_fee_amount, 0)), 0) as stripeFeeAmount
             FROM orders o
             LEFT JOIN users u ON u.id = o.user_id
             LEFT JOIN order_items oi ON oi.order_id = o.id
             LEFT JOIN products p ON p.id = oi.product_id
             ${hasProductSizeId ? 'LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id' : ''}
             WHERE 1=1${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}
             GROUP BY o.id, o.user_id, o.total, o.subtotal, o.tax_amount, o.shipping_cost, o.discount_code, o.status, o.created_at, u.email
             ORDER BY o.created_at DESC`
        );

        const recentOrders = (recentOrderRows || []).map((order) => {
            const studioRevenue = Number(order.studioRevenue || 0);
            const baseRevenue = Number(order.baseRevenue || 0);
            const stripeFeeAmount = Number(order.stripeFeeAmount || 0);
            const discountAmount = resolveOrderDiscountAmount({
                subtotal: order.subtotal,
                shippingCost: order.shipping_cost,
                taxAmount: order.tax_amount,
                totalAmount: order.total,
                discountCode: order.discount_code,
            });
            const studioRevenueNet = Math.max(0, studioRevenue - discountAmount);
            const studioProfit = studioRevenueNet - baseRevenue - stripeFeeAmount;
            return {
                ...order,
                total: Number(order.total || 0),
                studioProfit,
            };
        });

        const revenueDayRows = await queryRows(
            `SELECT FORMAT(o.created_at, 'yyyy-MM-dd') as label, SUM(o.total) as value
             FROM orders o
             WHERE LOWER(o.status) NOT IN ('cancelled', 'refunded')
                 AND o.created_at >= DATEADD(day, -29, CAST(GETDATE() AS date))${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}
             GROUP BY FORMAT(o.created_at, 'yyyy-MM-dd')
             ORDER BY label ASC`
        );

        const revenueWeekRows = await queryRows(
            `SELECT FORMAT(DATEADD(day, -1 * (DATEPART(weekday, o.created_at) - 1), CAST(o.created_at AS date)), 'yyyy-MM-dd') as label,
                            SUM(o.total) as value
             FROM orders o
             WHERE LOWER(o.status) NOT IN ('cancelled', 'refunded')
                 AND o.created_at >= DATEADD(week, -11, CAST(GETDATE() AS date))${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}
             GROUP BY FORMAT(DATEADD(day, -1 * (DATEPART(weekday, o.created_at) - 1), CAST(o.created_at AS date)), 'yyyy-MM-dd')
             ORDER BY label ASC`
        );

        const revenueMonthRows = await queryRows(
            `SELECT FORMAT(o.created_at, 'yyyy-MM') as label, SUM(o.total) as value
             FROM orders o
             WHERE LOWER(o.status) NOT IN ('cancelled', 'refunded')
                 AND o.created_at >= DATEADD(month, -11, CAST(GETDATE() AS date))${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}
             GROUP BY FORMAT(o.created_at, 'yyyy-MM')
             ORDER BY label ASC`
        );

        const superAdminRevenueDayRows = await queryRows(
            `SELECT FORMAT(o.created_at, 'yyyy-MM-dd') as label,
                            SUM(COALESCE(${hasProductSizeId ? 'ps.price' : 'NULL'}, p.price, 0) * oi.quantity) as value
             FROM orders o
             INNER JOIN order_items oi ON oi.order_id = o.id
             LEFT JOIN products p ON p.id = oi.product_id
             ${hasProductSizeId ? 'LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id' : ''}
             WHERE LOWER(o.status) NOT IN ('cancelled', 'refunded')
                 AND o.created_at >= DATEADD(day, -29, CAST(GETDATE() AS date))${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}
             GROUP BY FORMAT(o.created_at, 'yyyy-MM-dd')
             ORDER BY label ASC`
        );

        const superAdminRevenueWeekRows = await queryRows(
            `SELECT FORMAT(DATEADD(day, -1 * (DATEPART(weekday, o.created_at) - 1), CAST(o.created_at AS date)), 'yyyy-MM-dd') as label,
                            SUM(COALESCE(${hasProductSizeId ? 'ps.price' : 'NULL'}, p.price, 0) * oi.quantity) as value
             FROM orders o
             INNER JOIN order_items oi ON oi.order_id = o.id
             LEFT JOIN products p ON p.id = oi.product_id
             ${hasProductSizeId ? 'LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id' : ''}
             WHERE LOWER(o.status) NOT IN ('cancelled', 'refunded')
                 AND o.created_at >= DATEADD(week, -11, CAST(GETDATE() AS date))${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}
             GROUP BY FORMAT(DATEADD(day, -1 * (DATEPART(weekday, o.created_at) - 1), CAST(o.created_at AS date)), 'yyyy-MM-dd')
             ORDER BY label ASC`
        );

        const superAdminRevenueMonthRows = await queryRows(
            `SELECT FORMAT(o.created_at, 'yyyy-MM') as label,
                            SUM(COALESCE(${hasProductSizeId ? 'ps.price' : 'NULL'}, p.price, 0) * oi.quantity) as value
             FROM orders o
             INNER JOIN order_items oi ON oi.order_id = o.id
             LEFT JOIN products p ON p.id = oi.product_id
             ${hasProductSizeId ? 'LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id' : ''}
             WHERE LOWER(o.status) NOT IN ('cancelled', 'refunded')
                 AND o.created_at >= DATEADD(month, -11, CAST(GETDATE() AS date))${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}
             GROUP BY FORMAT(o.created_at, 'yyyy-MM')
             ORDER BY label ASC`
        );

        const productsSoldDayRows = await queryRows(
            `SELECT FORMAT(o.created_at, 'yyyy-MM-dd') as label,
                            SUM(COALESCE(oi.quantity, 0)) as value
             FROM orders o
             INNER JOIN order_items oi ON oi.order_id = o.id
             WHERE LOWER(o.status) NOT IN ('cancelled', 'refunded')
                 AND o.created_at >= DATEADD(day, -29, CAST(GETDATE() AS date))${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}
             GROUP BY FORMAT(o.created_at, 'yyyy-MM-dd')
             ORDER BY label ASC`
        );

        const productsSoldWeekRows = await queryRows(
            `SELECT FORMAT(DATEADD(day, -1 * (DATEPART(weekday, o.created_at) - 1), CAST(o.created_at AS date)), 'yyyy-MM-dd') as label,
                            SUM(COALESCE(oi.quantity, 0)) as value
             FROM orders o
             INNER JOIN order_items oi ON oi.order_id = o.id
             WHERE LOWER(o.status) NOT IN ('cancelled', 'refunded')
                 AND o.created_at >= DATEADD(week, -11, CAST(GETDATE() AS date))${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}
             GROUP BY FORMAT(DATEADD(day, -1 * (DATEPART(weekday, o.created_at) - 1), CAST(o.created_at AS date)), 'yyyy-MM-dd')
             ORDER BY label ASC`
        );

        const productsSoldMonthRows = await queryRows(
            `SELECT FORMAT(o.created_at, 'yyyy-MM') as label,
                            SUM(COALESCE(oi.quantity, 0)) as value
             FROM orders o
             INNER JOIN order_items oi ON oi.order_id = o.id
             WHERE LOWER(o.status) NOT IN ('cancelled', 'refunded')
                 AND o.created_at >= DATEADD(month, -11, CAST(GETDATE() AS date))${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}
             GROUP BY FORMAT(o.created_at, 'yyyy-MM')
             ORDER BY label ASC`
        );

        const taxDayRows = await queryRows(
            `SELECT FORMAT(o.created_at, 'yyyy-MM-dd') as label, SUM(COALESCE(o.tax_amount, 0)) as value
             FROM orders o
             WHERE LOWER(o.status) NOT IN ('cancelled', 'refunded')
                 AND o.created_at >= DATEADD(day, -29, CAST(GETDATE() AS date))${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}
             GROUP BY FORMAT(o.created_at, 'yyyy-MM-dd')
             ORDER BY label ASC`
        );

        const taxWeekRows = await queryRows(
            `SELECT FORMAT(DATEADD(day, -1 * (DATEPART(weekday, o.created_at) - 1), CAST(o.created_at AS date)), 'yyyy-MM-dd') as label,
                            SUM(COALESCE(o.tax_amount, 0)) as value
             FROM orders o
             WHERE LOWER(o.status) NOT IN ('cancelled', 'refunded')
                 AND o.created_at >= DATEADD(week, -11, CAST(GETDATE() AS date))${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}
             GROUP BY FORMAT(DATEADD(day, -1 * (DATEPART(weekday, o.created_at) - 1), CAST(o.created_at AS date)), 'yyyy-MM-dd')
             ORDER BY label ASC`
        );

        const taxMonthRows = await queryRows(
            `SELECT FORMAT(o.created_at, 'yyyy-MM') as label, SUM(COALESCE(o.tax_amount, 0)) as value
             FROM orders o
             WHERE LOWER(o.status) NOT IN ('cancelled', 'refunded')
                 AND o.created_at >= DATEADD(month, -11, CAST(GETDATE() AS date))${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}
             GROUP BY FORMAT(o.created_at, 'yyyy-MM')
             ORDER BY label ASC`
        );

        const ordersDayRows = await queryRows(
            `SELECT FORMAT(o.created_at, 'yyyy-MM-dd') as label, COUNT(*) as value
             FROM orders o
             WHERE o.created_at >= DATEADD(day, -29, CAST(GETDATE() AS date))${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}
             GROUP BY FORMAT(o.created_at, 'yyyy-MM-dd')
             ORDER BY label ASC`
        );

        const ordersWeekRows = await queryRows(
            `SELECT FORMAT(DATEADD(day, -1 * (DATEPART(weekday, o.created_at) - 1), CAST(o.created_at AS date)), 'yyyy-MM-dd') as label,
                            COUNT(*) as value
             FROM orders o
             WHERE o.created_at >= DATEADD(week, -11, CAST(GETDATE() AS date))${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}
             GROUP BY FORMAT(DATEADD(day, -1 * (DATEPART(weekday, o.created_at) - 1), CAST(o.created_at AS date)), 'yyyy-MM-dd')
             ORDER BY label ASC`
        );

        const ordersMonthRows = await queryRows(
            `SELECT FORMAT(o.created_at, 'yyyy-MM') as label, COUNT(*) as value
             FROM orders o
             WHERE o.created_at >= DATEADD(month, -11, CAST(GETDATE() AS date))${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}
             GROUP BY FORMAT(o.created_at, 'yyyy-MM')
             ORDER BY label ASC`
        );

        // Customers graph: count new unique customers who placed their first order in each period
        const customersDayRows = await queryRows(
            `SELECT label, COUNT(*) as value FROM (
                SELECT FORMAT(MIN(o.created_at), 'yyyy-MM-dd') as label, o.user_id
                FROM orders o
                WHERE o.created_at >= DATEADD(day, -29, CAST(GETDATE() AS date))${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}
                GROUP BY o.user_id
            ) t
            GROUP BY label
            ORDER BY label ASC`
        );

        const customersWeekRows = await queryRows(
            `SELECT label, COUNT(*) as value FROM (
                SELECT FORMAT(DATEADD(day, -1 * (DATEPART(weekday, MIN(o.created_at)) - 1), CAST(MIN(o.created_at) AS date)), 'yyyy-MM-dd') as label, o.user_id
                FROM orders o
                WHERE o.created_at >= DATEADD(week, -11, CAST(GETDATE() AS date))${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}
                GROUP BY o.user_id
            ) t
            GROUP BY label
            ORDER BY label ASC`
        );

        const customersMonthRows = await queryRows(
            `SELECT label, COUNT(*) as value FROM (
                SELECT FORMAT(MIN(o.created_at), 'yyyy-MM') as label, o.user_id
                FROM orders o
                WHERE o.created_at >= DATEADD(month, -11, CAST(GETDATE() AS date))${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}
                GROUP BY o.user_id
            ) t
            GROUP BY label
            ORDER BY label ASC`
        );

        const pendingDayRows = await queryRows(
            `SELECT FORMAT(o.created_at, 'yyyy-MM-dd') as label, COUNT(*) as value
             FROM orders o
             WHERE LOWER(o.status) = 'pending'
                 AND o.created_at >= DATEADD(day, -29, CAST(GETDATE() AS date))${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}
             GROUP BY FORMAT(o.created_at, 'yyyy-MM-dd')
             ORDER BY label ASC`
        );

        const pendingWeekRows = await queryRows(
            `SELECT FORMAT(DATEADD(day, -1 * (DATEPART(weekday, o.created_at) - 1), CAST(o.created_at AS date)), 'yyyy-MM-dd') as label,
                            COUNT(*) as value
             FROM orders o
             WHERE LOWER(o.status) = 'pending'
                 AND o.created_at >= DATEADD(week, -11, CAST(GETDATE() AS date))${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}
             GROUP BY FORMAT(DATEADD(day, -1 * (DATEPART(weekday, o.created_at) - 1), CAST(o.created_at AS date)), 'yyyy-MM-dd')
             ORDER BY label ASC`
        );

        const pendingMonthRows = await queryRows(
            `SELECT FORMAT(o.created_at, 'yyyy-MM') as label, COUNT(*) as value
             FROM orders o
             WHERE LOWER(o.status) = 'pending'
                 AND o.created_at >= DATEADD(month, -11, CAST(GETDATE() AS date))${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}
             GROUP BY FORMAT(o.created_at, 'yyyy-MM')
             ORDER BY label ASC`
        );

        const batchDayRows = await queryRows(
            `SELECT FORMAT(o.created_at, 'yyyy-MM-dd') as label, COUNT(*) as value
             FROM orders o
             WHERE o.is_batch = 1
                 AND o.created_at >= DATEADD(day, -29, CAST(GETDATE() AS date))${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}
             GROUP BY FORMAT(o.created_at, 'yyyy-MM-dd')
             ORDER BY label ASC`
        );

        const batchWeekRows = await queryRows(
            `SELECT FORMAT(DATEADD(day, -1 * (DATEPART(weekday, o.created_at) - 1), CAST(o.created_at AS date)), 'yyyy-MM-dd') as label,
                            COUNT(*) as value
             FROM orders o
             WHERE o.is_batch = 1
                 AND o.created_at >= DATEADD(week, -11, CAST(GETDATE() AS date))${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}
             GROUP BY FORMAT(DATEADD(day, -1 * (DATEPART(weekday, o.created_at) - 1), CAST(o.created_at AS date)), 'yyyy-MM-dd')
             ORDER BY label ASC`
        );

        const batchMonthRows = await queryRows(
            `SELECT FORMAT(o.created_at, 'yyyy-MM') as label, COUNT(*) as value
             FROM orders o
             WHERE o.is_batch = 1
                 AND o.created_at >= DATEADD(month, -11, CAST(GETDATE() AS date))${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}
             GROUP BY FORMAT(o.created_at, 'yyyy-MM')
             ORDER BY label ASC`
        );

        const discountOverviewRow = await queryRow(
            `SELECT
                COUNT(*) as discountedOrders,
                COALESCE(SUM(CASE
                    WHEN discount_code IS NOT NULL AND discount_code <> ''
                    THEN CASE
                        WHEN (COALESCE(subtotal, 0) + COALESCE(tax_amount, 0) + COALESCE(shipping_cost, 0) - COALESCE(total, 0)) > 0
                        THEN (COALESCE(subtotal, 0) + COALESCE(tax_amount, 0) + COALESCE(shipping_cost, 0) - COALESCE(total, 0))
                        ELSE 0
                    END
                    ELSE 0
                END), 0) as totalDiscountAmount,
                COALESCE(SUM(CASE WHEN discount_code IS NOT NULL AND discount_code <> '' THEN COALESCE(total, 0) ELSE 0 END), 0) as discountedRevenue
             FROM orders o
             WHERE discount_code IS NOT NULL AND discount_code <> ''${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}`
        );

        const topDiscountCodes = await queryRows(
            `SELECT TOP 5
                discount_code as code,
                COUNT(*) as uses,
                COALESCE(SUM(CASE
                    WHEN (COALESCE(subtotal, 0) + COALESCE(tax_amount, 0) + COALESCE(shipping_cost, 0) - COALESCE(total, 0)) > 0
                    THEN (COALESCE(subtotal, 0) + COALESCE(tax_amount, 0) + COALESCE(shipping_cost, 0) - COALESCE(total, 0))
                    ELSE 0
                END), 0) as totalDiscountAmount,
                COALESCE(SUM(COALESCE(total, 0)), 0) as revenueInfluenced,
                MAX(created_at) as lastUsedAt
             FROM orders o
             WHERE discount_code IS NOT NULL AND discount_code <> ''${orderStudioFilter ? ' AND ' + orderStudioFilter : ''}
             GROUP BY discount_code
             ORDER BY uses DESC, totalDiscountAmount DESC`
        );

        const formatSeries = (rows) => ({
            labels: rows.map((r) => r.label),
            data: rows.map((r) => Number(r.value)),
        });

        // Support analytics time range
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

            const albumPhotoStudioFilter = studioId
                ? ` AND (
                        al.studio_id = ${studioId}
                        OR (al.id IS NULL AND JSON_VALUE(a.event_data, '$.studioId') = '${studioId}')
                    )`
                : '';

            // Determine time range
            let analyticsTimeFilter = '';
            const range = req.query.range;
            if (range === 'today') {
                analyticsTimeFilter = `created_at >= CAST(GETDATE() AS date)`;
            } else if (range === 'week') {
                analyticsTimeFilter = `created_at >= DATEADD(day, -6, CAST(GETDATE() AS date))`;
            } else if (range === 'month') {
                analyticsTimeFilter = `created_at >= DATEADD(month, -1, CAST(GETDATE() AS date))`;
            }

            // Helper to build WHERE clause
            function buildWhere(base, studioFilter, timeFilter) {
                // Always treat filters as strings
                const clauses = [];
                if (base && typeof base === 'string' && base.trim()) clauses.push(base.trim());
                if (studioFilter && typeof studioFilter === 'string' && studioFilter.trim()) {
                    // Remove leading 'AND ' if present
                    clauses.push(studioFilter.trim().replace(/^AND /i, ''));
                }
                if (timeFilter && typeof timeFilter === 'string' && timeFilter.trim()) clauses.push(timeFilter.trim());
                return clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
            }



              // Log and run analytics queries for debugging
              const totalVisitorsQuery = `SELECT COUNT(DISTINCT JSON_VALUE(event_data, '$.sessionId')) as count
                  FROM analytics
                  ${buildWhere("event_type = 'site_visit'", analyticsStudioFilter, analyticsTimeFilter)}`;
              console.log('[analytics] totalVisitorsQuery:', totalVisitorsQuery);
              const totalVisitorsRow = await queryRow(totalVisitorsQuery);
              console.log('[analytics] totalVisitorsRow:', totalVisitorsRow);

              const totalPageViewsQuery = `SELECT COUNT(*) as count
                  FROM analytics
                  ${buildWhere("event_type = 'page_view'", analyticsStudioFilter, analyticsTimeFilter)}`;
              console.log('[analytics] totalPageViewsQuery:', totalPageViewsQuery);
              const totalPageViewsRow = await queryRow(totalPageViewsQuery);
              console.log('[analytics] totalPageViewsRow:', totalPageViewsRow);

              const albumViewsQuery = `SELECT TOP 5
                                        TRY_CAST(JSON_VALUE(a.event_data, '$.albumId') AS INT) as albumId,
                                        COALESCE(NULLIF(MAX(JSON_VALUE(a.event_data, '$.albumName')), ''), MAX(al.name), CONCAT('Album #', TRY_CAST(JSON_VALUE(a.event_data, '$.albumId') AS INT))) as albumName,
                                        MAX(al.cover_image_url) as coverImageUrl,
                                        SUM(CASE WHEN a.event_type = 'album_view' THEN 1 ELSE 0 END) as opens,
                                        SUM(CASE WHEN a.event_type = 'album_card_click' THEN 1 ELSE 0 END) as clicks,
                                        COUNT(*) as views
                                    FROM analytics a
                                    LEFT JOIN albums al ON al.id = TRY_CAST(JSON_VALUE(a.event_data, '$.albumId') AS INT)
                                    ${buildWhere("a.event_type IN ('album_view', 'album_card_click')", '', analyticsTimeFilter ? analyticsTimeFilter.replace(/\bcreated_at\b/g, 'a.created_at') : '')}
                                    ${albumPhotoStudioFilter}
                                    GROUP BY TRY_CAST(JSON_VALUE(a.event_data, '$.albumId') AS INT)
                  ORDER BY views DESC`;
              console.log('[analytics] albumViewsQuery:', albumViewsQuery);
              const albumViewsRows = await queryRows(albumViewsQuery);
              console.log('[analytics] albumViewsRows:', albumViewsRows);

              const photoViewsQuery = `SELECT TOP 5
                                        TRY_CAST(JSON_VALUE(a.event_data, '$.photoId') AS INT) as photoId,
                                        COALESCE(MAX(TRY_CAST(JSON_VALUE(a.event_data, '$.albumId') AS INT)), MAX(p.album_id)) as albumId,
                                        COALESCE(NULLIF(MAX(JSON_VALUE(a.event_data, '$.photoFileName')), ''), MAX(p.file_name)) as photoFileName,
                                        COALESCE(NULLIF(MAX(JSON_VALUE(a.event_data, '$.albumName')), ''), MAX(al.name)) as albumName,
                                        MAX(p.thumbnail_url) as thumbnailUrl,
                                        MAX(p.full_image_url) as fullImageUrl,
                                        SUM(CASE WHEN a.event_type = 'photo_view' THEN 1 ELSE 0 END) as opens,
                                        SUM(CASE WHEN a.event_type = 'photo_thumbnail_click' THEN 1 ELSE 0 END) as clicks,
                                        COUNT(*) as views
                                    FROM analytics a
                                    LEFT JOIN photos p ON p.id = TRY_CAST(JSON_VALUE(a.event_data, '$.photoId') AS INT)
                                    LEFT JOIN albums al ON al.id = COALESCE(TRY_CAST(JSON_VALUE(a.event_data, '$.albumId') AS INT), p.album_id)
                                    ${buildWhere("a.event_type IN ('photo_view', 'photo_thumbnail_click')", '', analyticsTimeFilter ? analyticsTimeFilter.replace(/\bcreated_at\b/g, 'a.created_at') : '')}
                                    ${albumPhotoStudioFilter}
                                    GROUP BY TRY_CAST(JSON_VALUE(a.event_data, '$.photoId') AS INT)
                  ORDER BY views DESC`;
              console.log('[analytics] photoViewsQuery:', photoViewsQuery);
              const photoViewsRows = await queryRows(photoViewsQuery);
              console.log('[analytics] photoViewsRows:', photoViewsRows);

            analytics = {
                totalVisitors: Number(totalVisitorsRow?.count || 0),
                totalPageViews: Number(totalPageViewsRow?.count || 0),
                albumViews: (albumViewsRows || []).map((r) => ({
                    albumId: Number(r.albumId || 0),
                    albumName: r.albumName || 'Unknown Album',
                    coverImageUrl: r.coverImageUrl || null,
                    opens: Number(r.opens || 0),
                    clicks: Number(r.clicks || 0),
                    views: Number(r.views || 0),
                })),
                photoViews: (photoViewsRows || []).map((r) => ({
                    photoId: Number(r.photoId || 0),
                    albumId: Number(r.albumId || 0),
                    photoFileName: r.photoFileName || 'Unknown Photo',
                    albumName: r.albumName || 'Unknown Album',
                    thumbnailUrl: r.thumbnailUrl || null,
                    fullImageUrl: r.fullImageUrl || null,
                    opens: Number(r.opens || 0),
                    clicks: Number(r.clicks || 0),
                    views: Number(r.views || 0),
                })),
            };
        } catch {
            // Analytics table may not exist yet in some environments.
        }

        // Scheduling stats
        let schedulingStats = { totalBookings: 0, pendingBookings: 0, approvedBookings: 0, upcomingBookings: 0, bookingRevenue: 0, platformFees: 0, bookingStripeFees: 0, studioPayouts: 0, upcomingBookingsList: [] };
        try {
            const schedFilter = studioId ? `AND b.studio_id = ${studioId}` : '';
            const schedRow = await queryRow(
                `SELECT
                    COUNT(*) as totalBookings,
                    SUM(CASE WHEN b.status = 'pending' THEN 1 ELSE 0 END) as pendingBookings,
                    SUM(CASE WHEN b.status = 'approved' THEN 1 ELSE 0 END) as approvedBookings,
                    COALESCE(SUM(CASE WHEN b.payment_status = 'paid' THEN b.payment_amount ELSE 0 END), 0) as bookingRevenue,
                    COALESCE(SUM(CASE WHEN b.payment_status = 'paid' THEN b.platform_fee_amount ELSE 0 END), 0) as platformFees,
                    COALESCE(SUM(CASE WHEN b.payment_status = 'paid' THEN b.studio_payout_amount ELSE 0 END), 0) as studioPayouts,
                    COALESCE(SUM(CASE WHEN b.payment_status = 'paid' THEN ROUND(b.payment_amount * 0.029, 2) + 0.30 ELSE 0 END), 0) as bookingStripeFees
                 FROM scheduling_bookings b
                 WHERE b.status NOT IN ('rejected', 'cancelled') ${schedFilter}`
            );
            const upcomingRow = await queryRow(
                `SELECT COUNT(*) as count
                 FROM scheduling_bookings b
                 LEFT JOIN scheduling_availability a ON a.id = b.availability_id
                 WHERE b.status = 'approved'
                 AND COALESCE(a.slot_date, b.manual_date) >= CAST(GETDATE() AS DATE) ${schedFilter}`
            );
            const upcomingBookingsRows = await queryRows(
                `SELECT TOP 5
                    b.id,
                    b.customer_name as customerName,
                    b.customer_email as customerEmail,
                    CONVERT(VARCHAR(10), COALESCE(a.slot_date, b.manual_date), 23) as slotDate,
                    COALESCE(b.booking_start_time, b.manual_start_time) as startTime,
                    t.name as sessionTypeName,
                    b.payment_status as paymentStatus,
                    b.payment_amount as paymentAmount
                 FROM scheduling_bookings b
                 LEFT JOIN scheduling_availability a ON a.id = b.availability_id
                 LEFT JOIN scheduling_session_types t ON t.id = b.session_type_id
                 WHERE b.status = 'approved'
                 AND COALESCE(a.slot_date, b.manual_date) >= CAST(GETDATE() AS DATE) ${schedFilter}
                 ORDER BY COALESCE(a.slot_date, b.manual_date) ASC,
                          COALESCE(b.booking_start_time, b.manual_start_time) ASC`
            );
            schedulingStats = {
                totalBookings: Number(schedRow?.totalBookings || 0),
                pendingBookings: Number(schedRow?.pendingBookings || 0),
                approvedBookings: Number(schedRow?.approvedBookings || 0),
                upcomingBookings: Number(upcomingRow?.count || 0),
                bookingRevenue: Number(schedRow?.bookingRevenue || 0),
                platformFees: Number(schedRow?.platformFees || 0),
                bookingStripeFees: Number(schedRow?.bookingStripeFees || 0),
                studioPayouts: Number(schedRow?.studioPayouts || 0),
                upcomingBookingsList: (upcomingBookingsRows || []).map(r => ({
                    id: Number(r.id),
                    customerName: r.customerName || '',
                    customerEmail: r.customerEmail || '',
                    slotDate: r.slotDate || '',
                    startTime: r.startTime || '',
                    sessionTypeName: r.sessionTypeName || '',
                    paymentStatus: r.paymentStatus || '',
                    paymentAmount: Number(r.paymentAmount || 0),
                })),
            };
        } catch { /* scheduling tables may not exist */ }

        res.json({
            totalOrders,
            totalRevenue,
            revenueComposition: {
                totalSubtotal: Number(revenueCompositionRow?.totalSubtotal || 0),
                totalTax: Number(revenueCompositionRow?.totalTax || 0),
                totalShipping: Number(revenueCompositionRow?.totalShipping || 0),
                totalDiscounts: Number(revenueCompositionRow?.totalDiscounts || 0),
                recomputedTotal:
                    Number(revenueCompositionRow?.totalSubtotal || 0)
                    + Number(revenueCompositionRow?.totalTax || 0)
                    + Number(revenueCompositionRow?.totalShipping || 0)
                    - Number(revenueCompositionRow?.totalDiscounts || 0),
            },
            grossMarginBreakdown: {
                totalStudioRevenue: breakdownStudioRevenue,
                totalBaseRevenue: breakdownBaseRevenue,
                totalSuperAdminRevenue: breakdownSuperAdminRevenue,
                totalWhccCost: breakdownWhccCost,
                totalProductsSold,
                avgProfitPerProduct,
                totalShippingMargin: breakdownShippingMargin,
                totalStripeFees: breakdownStripeFees,
                totalGrossMargin,
            },
            totalSuperAdminRevenue: breakdownSuperAdminRevenue,
            totalProductsSold,
            avgProfitPerProduct,
            totalCustomers,
            pendingOrders,
            batchOrders,
            discountOverview: {
                discountedOrders: Number(discountOverviewRow?.discountedOrders || 0),
                totalDiscountAmount: Number(discountOverviewRow?.totalDiscountAmount || 0),
                discountedRevenue: Number(discountOverviewRow?.discountedRevenue || 0),
            },
            topDiscountCodes: (topDiscountCodes || []).map((row) => ({
                code: row.code || '',
                uses: Number(row.uses || 0),
                totalDiscountAmount: Number(row.totalDiscountAmount || 0),
                revenueInfluenced: Number(row.revenueInfluenced || 0),
                lastUsedAt: row.lastUsedAt || null,
            })),
            analytics,
            recentOrders,
            revenueSeries: {
                day: formatSeries(revenueDayRows),
                week: formatSeries(revenueWeekRows),
                month: formatSeries(revenueMonthRows),
            },
            superAdminRevenueSeries: {
                day: formatSeries(superAdminRevenueDayRows),
                week: formatSeries(superAdminRevenueWeekRows),
                month: formatSeries(superAdminRevenueMonthRows),
            },
            productsSoldSeries: {
                day: formatSeries(productsSoldDayRows),
                week: formatSeries(productsSoldWeekRows),
                month: formatSeries(productsSoldMonthRows),
            },
            taxSeries: {
                day: formatSeries(taxDayRows),
                week: formatSeries(taxWeekRows),
                month: formatSeries(taxMonthRows),
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
            schedulingStats,
        });
    } catch (err) {
        console.error('Error fetching dashboard stats:', err);
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});

console.log('[adminDashboard.js] Router loaded');
export default router;
