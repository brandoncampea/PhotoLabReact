import express from 'express';
import crypto from 'crypto';
import { queryRow, queryRows, query, transaction, tableExists, columnExists } from '../mssql.js';
import { SUBSCRIPTION_PLANS, SUBSCRIPTION_STATUSES } from '../constants/subscriptions.js';
import { authRequired } from '../middleware/auth.js';
import stripeService from '../services/stripeService.js';

const router = express.Router();

const getStudioProfitPayoutThreshold = async () => {
  const hasTable = await tableExists('studio_profit_payout_config');
  if (!hasTable) return 500;
  const row = await queryRow('SELECT payout_threshold as payoutThreshold FROM studio_profit_payout_config WHERE id = 1');
  return Number(row?.payoutThreshold) || 500;
};

const getStudioProfitPayoutsTotal = async (studioId) => {
  const hasTable = await tableExists('studio_profit_payouts');
  if (!hasTable) return 0;
  const row = await queryRow(
    'SELECT COALESCE(SUM(amount), 0) as totalPayouts FROM studio_profit_payouts WHERE studio_id = $1',
    [studioId]
  );
  return Number(row?.totalPayouts) || 0;
};

const getStudioProfitGross = async (studioId) => {
  const hasInvoiceItems = await tableExists('studio_invoice_items');

  const revenueRow = await queryRow(
    `SELECT COALESCE(SUM(oi.price * oi.quantity), 0) as studioRevenue
     FROM orders o
     INNER JOIN order_items oi ON oi.order_id = o.id
     INNER JOIN photos ph ON ph.id = oi.photo_id
     INNER JOIN albums a ON a.id = ph.album_id
     WHERE a.studio_id = $1
       AND (o.status IS NULL OR LOWER(o.status) <> 'cancelled')`,
    [studioId]
  );

  let superAdminProfit = 0;
  if (hasInvoiceItems) {
    const costRow = await queryRow(
      `SELECT COALESCE(SUM(total_cost), 0) as superAdminProfit
       FROM studio_invoice_items
       WHERE studio_id = $1`,
      [studioId]
    );
    superAdminProfit = Number(costRow?.superAdminProfit) || 0;
  } else {
    const costRow = await queryRow(
      `SELECT COALESCE(SUM(COALESCE(ps.price, p.price, 0) * oi.quantity), 0) as superAdminProfit
       FROM orders o
       INNER JOIN order_items oi ON oi.order_id = o.id
       INNER JOIN photos ph ON ph.id = oi.photo_id
       INNER JOIN albums a ON a.id = ph.album_id
       LEFT JOIN products p ON p.id = oi.product_id
       LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id
       WHERE a.studio_id = $1
         AND (o.status IS NULL OR LOWER(o.status) <> 'cancelled')`,
      [studioId]
    );
    superAdminProfit = Number(costRow?.superAdminProfit) || 0;
  }

  const studioRevenue = Number(revenueRow?.studioRevenue) || 0;
  return {
    studioRevenue,
    superAdminProfit,
    studioProfitGross: studioRevenue - superAdminProfit,
  };
};

// Create/signup new studio
router.post('/signup', async (req, res) => {
  try {
    const { studioName, studioEmail, adminEmail, adminName, adminPassword, subscriptionPlan } = req.body;

    // Validate inputs
    if (!studioName || !studioEmail || !adminEmail || !adminName || !adminPassword) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Subscription plan is optional now
    if (subscriptionPlan && !SUBSCRIPTION_PLANS[subscriptionPlan]) {
      return res.status(400).json({ error: 'Invalid subscription plan' });
    }

    // Check if studio email already exists
    const existingStudio = await queryRow('SELECT id FROM studios WHERE email = $1', [studioEmail]);
    if (existingStudio) {
      return res.status(409).json({ error: 'Studio email already exists' });
    }

    // Check if admin email already exists
    const existingUser = await queryRow('SELECT id FROM users WHERE email = $1', [adminEmail]);
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Begin transaction
    const { studioId, userId } = await transaction(async (client) => {
      const studioResult = await client.query(`
        INSERT INTO studios (name, email, subscription_plan, subscription_status, created_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        RETURNING id
      `, [studioName, studioEmail, subscriptionPlan || null, SUBSCRIPTION_STATUSES.inactive]);

      const createdStudioId = studioResult.rows[0].id;

      const userResult = await client.query(`
        INSERT INTO users (email, password, name, role, studio_id, is_active, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        RETURNING id
      `, [adminEmail, adminPassword, adminName, 'studio_admin', createdStudioId, 1]);

      return { studioId: createdStudioId, userId: userResult.rows[0].id };
    });

    res.status(201).json({
      message: 'Studio created successfully',
      studioId,
      userId,
      studio: {
        id: studioId,
        name: studioName,
        email: studioEmail,
        subscriptionPlan,
        subscriptionStatus: SUBSCRIPTION_STATUSES.inactive
      }
    });
  } catch (error) {
    console.error('Studio signup error:', error);
    res.status(500).json({ error: 'Failed to create studio' });
  }
});

// Get all studios (super admin only)
router.get('/', authRequired, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studios = await queryRows(`
      SELECT 
        s.id,
        s.name,
        s.email,
        s.subscription_plan,
        s.subscription_status,
        s.subscription_start,
        s.subscription_end,
        s.stripe_customer_id,
        s.stripe_subscription_id,
        s.fee_type,
        s.fee_value,
        s.billing_cycle,
        s.is_free_subscription,
        s.cancellation_requested,
        s.cancellation_date,
        s.created_at,
        COUNT(DISTINCT u.id) as userCount
      FROM studios s
      LEFT JOIN users u ON u.studio_id = s.id AND u.role != 'super_admin'
      GROUP BY s.id, s.name, s.email, s.subscription_plan, s.subscription_status, s.subscription_start, s.subscription_end, s.stripe_customer_id, s.stripe_subscription_id, s.fee_type, s.fee_value, s.billing_cycle, s.is_free_subscription, s.cancellation_requested, s.cancellation_date, s.created_at
      ORDER BY s.created_at DESC
    `);

    res.json(studios);
  } catch (error) {
    console.error('Get studios error:', error);
    res.status(500).json({ error: 'Failed to fetch studios' });
  }
});

// Get super-admin subscription payment configuration
router.get('/subscription-payment-config', authRequired, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const config = await queryRow('SELECT * FROM subscription_stripe_config WHERE id = 1');
    if (!config) {
      return res.status(404).json({ error: 'Subscription payment config not found' });
    }

    res.json({
      id: config.id,
      publishableKey: config.publishable_key,
      secretKey: config.secret_key,
      webhookSecret: config.webhook_secret,
      isLiveMode: Boolean(config.is_live_mode),
      isActive: Boolean(config.is_active),
    });
  } catch (error) {
    console.error('Get subscription payment config error:', error);
    res.status(500).json({ error: 'Failed to fetch subscription payment config' });
  }
});

// Update super-admin subscription payment configuration
router.put('/subscription-payment-config', authRequired, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { publishableKey, secretKey, webhookSecret, isLiveMode, isActive } = req.body || {};

    await query(`
      IF EXISTS (SELECT 1 FROM subscription_stripe_config WHERE id = 1)
      BEGIN
        UPDATE subscription_stripe_config
        SET publishable_key = $1,
            secret_key = $2,
            webhook_secret = $3,
            is_live_mode = $4,
            is_active = $5,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      END
      ELSE
      BEGIN
        INSERT INTO subscription_stripe_config (id, publishable_key, secret_key, webhook_secret, is_live_mode, is_active)
        VALUES (1, $1, $2, $3, $4, $5)
      END
    `, [publishableKey || null, secretKey || null, webhookSecret || null, !!isLiveMode, !!isActive]);

    const updated = await queryRow('SELECT * FROM subscription_stripe_config WHERE id = 1');
    res.json({
      id: updated.id,
      publishableKey: updated.publishable_key,
      secretKey: updated.secret_key,
      webhookSecret: updated.webhook_secret,
      isLiveMode: Boolean(updated.is_live_mode),
      isActive: Boolean(updated.is_active),
    });
  } catch (error) {
    console.error('Update subscription payment config error:', error);
    res.status(500).json({ error: 'Failed to update subscription payment config' });
  }
});

// Get studio profit payout threshold config (super admin configurable)
router.get('/profit-payout-config', authRequired, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin' && req.user.role !== 'studio_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const payoutThreshold = await getStudioProfitPayoutThreshold();
    res.json({ payoutThreshold });
  } catch (error) {
    console.error('Get payout config error:', error);
    res.status(500).json({ error: 'Failed to fetch payout config' });
  }
});

router.put('/profit-payout-config', authRequired, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const threshold = Number(req.body?.payoutThreshold);
    if (!Number.isFinite(threshold) || threshold < 0) {
      return res.status(400).json({ error: 'Payout threshold must be a non-negative number' });
    }

    await query(
      `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'studio_profit_payout_config')
       BEGIN
         CREATE TABLE studio_profit_payout_config (
           id INT PRIMARY KEY,
           payout_threshold FLOAT NOT NULL DEFAULT 500,
           updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
           CONSTRAINT ck_studio_profit_payout_config_id CHECK (id = 1)
         )
       END

       IF EXISTS (SELECT 1 FROM studio_profit_payout_config WHERE id = 1)
       BEGIN
         UPDATE studio_profit_payout_config
         SET payout_threshold = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = 1
       END
       ELSE
       BEGIN
         INSERT INTO studio_profit_payout_config (id, payout_threshold)
         VALUES (1, $1)
       END`,
      [threshold]
    );

    res.json({ payoutThreshold: threshold });
  } catch (error) {
    console.error('Update payout config error:', error);
    res.status(500).json({ error: 'Failed to update payout config' });
  }
});

// Get payout history for a studio
router.get('/:studioId/profit-payouts', authRequired, async (req, res) => {
  try {
    const studioId = Number(req.params.studioId);
    if (!Number.isInteger(studioId) || studioId <= 0) {
      return res.status(400).json({ error: 'Invalid studio id' });
    }

    if (req.user.role !== 'super_admin' && req.user.studio_id !== studioId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const hasTable = await tableExists('studio_profit_payouts');
    if (!hasTable) {
      return res.json({ studioId, payouts: [], totalPayouts: 0 });
    }

    const payouts = await queryRows(
      `SELECT
         spp.id,
         spp.studio_id as studioId,
         spp.amount,
         spp.notes,
         spp.created_at as createdAt,
         spp.created_by_user_id as createdByUserId,
         u.name as createdByName
       FROM studio_profit_payouts spp
       LEFT JOIN users u ON u.id = spp.created_by_user_id
       WHERE spp.studio_id = $1
       ORDER BY spp.created_at DESC`,
      [studioId]
    );

    const totalPayouts = payouts.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    res.json({ studioId, payouts, totalPayouts });
  } catch (error) {
    console.error('Get studio payout history error:', error);
    res.status(500).json({ error: 'Failed to fetch payout history' });
  }
});

// Mark payout sent for a studio (super admin only)
router.post('/:studioId/profit-payouts', authRequired, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studioId = Number(req.params.studioId);
    if (!Number.isInteger(studioId) || studioId <= 0) {
      return res.status(400).json({ error: 'Invalid studio id' });
    }

    const studio = await queryRow('SELECT id, name FROM studios WHERE id = $1', [studioId]);
    if (!studio) {
      return res.status(404).json({ error: 'Studio not found' });
    }

    const payoutThreshold = await getStudioProfitPayoutThreshold();
    const gross = await getStudioProfitGross(studioId);
    const totalPayouts = await getStudioProfitPayoutsTotal(studioId);
    const availableProfit = (Number(gross.studioProfitGross) || 0) - totalPayouts;

    const requestedAmount = req.body?.amount !== undefined ? Number(req.body.amount) : availableProfit;
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      return res.status(400).json({ error: 'Payout amount must be greater than 0' });
    }

    if (requestedAmount > availableProfit) {
      return res.status(400).json({
        error: 'Payout amount exceeds available studio profit',
        availableProfit,
      });
    }

    const hasTable = await tableExists('studio_profit_payouts');
    if (!hasTable) {
      await query(`
        CREATE TABLE studio_profit_payouts (
          id INT IDENTITY(1,1) PRIMARY KEY,
          studio_id INT NOT NULL FOREIGN KEY REFERENCES studios(id) ON DELETE CASCADE,
          amount FLOAT NOT NULL,
          notes NVARCHAR(MAX) NULL,
          created_by_user_id INT NULL FOREIGN KEY REFERENCES users(id),
          created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    const inserted = await queryRow(
      `INSERT INTO studio_profit_payouts (studio_id, amount, notes, created_by_user_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, studio_id as studioId, amount, notes, created_at as createdAt`,
      [studioId, requestedAmount, req.body?.notes || null, req.user.id || null]
    );

    const nextTotalPayouts = totalPayouts + requestedAmount;
    const netStudioProfit = (Number(gross.studioProfitGross) || 0) - nextTotalPayouts;

    res.status(201).json({
      message: 'Payout recorded successfully',
      payoutThreshold,
      payout: inserted,
      availableProfit: netStudioProfit,
      isPayoutEligible: netStudioProfit >= payoutThreshold,
      amountToNextPayout: Math.max(0, payoutThreshold - netStudioProfit),
    });
  } catch (error) {
    console.error('Create studio payout error:', error);
    res.status(500).json({ error: 'Failed to record payout' });
  }
});

// Get studio profit breakdown by order (studio admin / super admin)
router.get('/:studioId/profit', authRequired, async (req, res) => {
  try {
    const studioId = Number(req.params.studioId);
    if (!Number.isInteger(studioId) || studioId <= 0) {
      return res.status(400).json({ error: 'Invalid studio id' });
    }

    if (req.user.role !== 'super_admin' && req.user.studio_id !== studioId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studio = await queryRow('SELECT id, name FROM studios WHERE id = $1', [studioId]);
    if (!studio) {
      return res.status(404).json({ error: 'Studio not found' });
    }

    const hasInvoiceItems = await tableExists('studio_invoice_items');
    const payoutThreshold = await getStudioProfitPayoutThreshold();

    const byOrder = hasInvoiceItems
      ? await queryRows(
          `SELECT
             o.id as orderId,
             o.created_at as orderDate,
             COALESCE(SUM(oi.price * oi.quantity), 0) as studioRevenue,
             COALESCE(MAX(invAgg.superAdminProfit), 0) as superAdminProfit,
             COALESCE(SUM(oi.quantity), 0) as itemCount
           FROM orders o
           INNER JOIN order_items oi ON oi.order_id = o.id
           INNER JOIN photos ph ON ph.id = oi.photo_id
           INNER JOIN albums a ON a.id = ph.album_id
           LEFT JOIN (
             SELECT order_id as orderId, studio_id as studioId, COALESCE(SUM(total_cost), 0) as superAdminProfit
             FROM studio_invoice_items
             WHERE studio_id = $1
             GROUP BY order_id, studio_id
           ) invAgg ON invAgg.orderId = o.id AND invAgg.studioId = $1
           WHERE a.studio_id = $1
             AND (o.status IS NULL OR LOWER(o.status) <> 'cancelled')
           GROUP BY o.id, o.created_at
           ORDER BY o.created_at DESC`,
          [studioId]
        )
      : await queryRows(
          `SELECT
             o.id as orderId,
             o.created_at as orderDate,
             COALESCE(SUM(oi.price * oi.quantity), 0) as studioRevenue,
             COALESCE(SUM(COALESCE(ps.price, p.price, 0) * oi.quantity), 0) as superAdminProfit,
             COALESCE(SUM(oi.quantity), 0) as itemCount
           FROM orders o
           INNER JOIN order_items oi ON oi.order_id = o.id
           INNER JOIN photos ph ON ph.id = oi.photo_id
           INNER JOIN albums a ON a.id = ph.album_id
           LEFT JOIN products p ON p.id = oi.product_id
           LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id
           WHERE a.studio_id = $1
             AND (o.status IS NULL OR LOWER(o.status) <> 'cancelled')
           GROUP BY o.id, o.created_at
           ORDER BY o.created_at DESC`,
          [studioId]
        );

    const orders = byOrder.map((row) => {
      const revenue = Number(row.studioRevenue) || 0;
      const superAdminProfit = Number(row.superAdminProfit) || 0;
      return {
        orderId: Number(row.orderId) || 0,
        orderDate: row.orderDate,
        itemCount: Number(row.itemCount) || 0,
        studioRevenue: revenue,
        superAdminProfit,
        studioProfit: revenue - superAdminProfit,
      };
    });

    const summary = orders.reduce(
      (acc, row) => {
        acc.totalStudioRevenue += row.studioRevenue;
        acc.totalSuperAdminProfit += row.superAdminProfit;
        acc.totalStudioProfitGross += row.studioProfit;
        acc.totalItems += row.itemCount;
        return acc;
      },
      {
        totalStudioRevenue: 0,
        totalSuperAdminProfit: 0,
        totalStudioProfitGross: 0,
        totalItems: 0,
      }
    );

    const totalPayouts = await getStudioProfitPayoutsTotal(studioId);
    const totalStudioProfit = summary.totalStudioProfitGross - totalPayouts;

    const isPayoutEligible = totalStudioProfit >= payoutThreshold;
    const amountToNextPayout = Math.max(0, payoutThreshold - totalStudioProfit);

    res.json({
      studioId,
      studioName: studio.name,
      totalOrders: orders.length,
      payoutThreshold,
      isPayoutEligible,
      amountToNextPayout,
      totalPayouts,
      totalStudioProfit,
      ...summary,
      orders,
    });
  } catch (error) {
    console.error('Get studio profit error:', error);
    res.status(500).json({ error: 'Failed to fetch studio profit' });
  }
});

// Get profit summary for all studios (super admin only)
router.get('/profit/summary', authRequired, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const hasInvoiceItems = await tableExists('studio_invoice_items');
    const hasOrderItemProductSizeId = await columnExists('order_items', 'product_size_id');
    const payoutThreshold = await getStudioProfitPayoutThreshold();

    const byStudioRows = hasInvoiceItems
      ? await queryRows(
          `SELECT
             s.id as studioId,
             s.name as studioName,
             COALESCE(rev.studioRevenue, 0) as studioRevenue,
             COALESCE(cost.superAdminProfit, 0) as superAdminProfit,
             COALESCE(rev.orderCount, 0) as orderCount
           FROM studios s
           LEFT JOIN (
             SELECT
               a.studio_id as studioId,
               COALESCE(SUM(oi.price * oi.quantity), 0) as studioRevenue,
               COUNT(DISTINCT o.id) as orderCount
             FROM orders o
             INNER JOIN order_items oi ON oi.order_id = o.id
             INNER JOIN photos ph ON ph.id = oi.photo_id
             INNER JOIN albums a ON a.id = ph.album_id
             WHERE (o.status IS NULL OR LOWER(o.status) <> 'cancelled')
             GROUP BY a.studio_id
           ) rev ON rev.studioId = s.id
           LEFT JOIN (
             SELECT
               studio_id as studioId,
               COALESCE(SUM(total_cost), 0) as superAdminProfit
             FROM studio_invoice_items
             GROUP BY studio_id
           ) cost ON cost.studioId = s.id
           ORDER BY s.name ASC`,
          []
        )
      : await queryRows(
          `SELECT
             s.id as studioId,
             s.name as studioName,
             COALESCE(SUM(oi.price * oi.quantity), 0) as studioRevenue,
             COALESCE(SUM(COALESCE(${hasOrderItemProductSizeId ? 'ps.price' : 'NULL'}, p.price, 0) * oi.quantity), 0) as superAdminProfit,
             COUNT(DISTINCT o.id) as orderCount
           FROM studios s
           LEFT JOIN albums a ON a.studio_id = s.id
           LEFT JOIN photos ph ON ph.album_id = a.id
           LEFT JOIN order_items oi ON oi.photo_id = ph.id
           LEFT JOIN orders o ON o.id = oi.order_id AND (o.status IS NULL OR LOWER(o.status) <> 'cancelled')
           LEFT JOIN products p ON p.id = oi.product_id
           ${hasOrderItemProductSizeId ? 'LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id' : ''}
           GROUP BY s.id, s.name
           ORDER BY s.name ASC`,
          []
        );

    const payoutRows = await tableExists('studio_profit_payouts')
      ? await queryRows(
          `SELECT studio_id as studioId, COALESCE(SUM(amount), 0) as totalPayouts, COUNT(*) as payoutCount
           FROM studio_profit_payouts
           GROUP BY studio_id`,
          []
        )
      : [];

    const payoutMap = new Map(
      payoutRows.map((row) => [Number(row.studioId) || 0, {
        totalPayouts: Number(row.totalPayouts) || 0,
        payoutCount: Number(row.payoutCount) || 0,
      }])
    );

    const byStudio = byStudioRows.map((row) => {
      const studioRevenue = Number(row.studioRevenue) || 0;
      const superAdminProfit = Number(row.superAdminProfit) || 0;
      const studioProfitGross = studioRevenue - superAdminProfit;
      const payout = payoutMap.get(Number(row.studioId) || 0);
      const totalPayouts = payout?.totalPayouts || 0;
      const studioProfit = studioProfitGross - totalPayouts;
      const isPayoutEligible = studioProfit >= payoutThreshold;
      return {
        studioId: Number(row.studioId) || 0,
        studioName: row.studioName || 'Unknown Studio',
        orderCount: Number(row.orderCount) || 0,
        studioRevenue,
        superAdminProfit,
        studioProfitGross,
        totalPayouts,
        payoutCount: payout?.payoutCount || 0,
        studioProfit,
        isPayoutEligible,
        amountToNextPayout: Math.max(0, payoutThreshold - studioProfit),
      };
    });

    const totals = byStudio.reduce(
      (acc, row) => {
        acc.totalStudioRevenue += row.studioRevenue;
        acc.totalSuperAdminProfit += row.superAdminProfit;
        acc.totalStudioProfitGross += row.studioProfitGross;
        acc.totalPayouts += row.totalPayouts;
        acc.totalStudioProfit += row.studioProfit;
        acc.totalOrders += row.orderCount;
        if (row.isPayoutEligible) {
          acc.eligibleStudioCount += 1;
          acc.totalEligibleStudioPayout += row.studioProfit;
        }
        return acc;
      },
      {
        totalStudioRevenue: 0,
        totalSuperAdminProfit: 0,
        totalStudioProfitGross: 0,
        totalPayouts: 0,
        totalStudioProfit: 0,
        totalOrders: 0,
        eligibleStudioCount: 0,
        totalEligibleStudioPayout: 0,
      }
    );

    res.json({ payoutThreshold, totals, byStudio });
  } catch (error) {
    console.error('Get super admin profit summary error:', error);
    res.status(500).json({ error: 'Failed to fetch profit summary' });
  }
});

// Get studio by ID
router.get('/:studioId', authRequired, async (req, res) => {
  try {
    const { studioId } = req.params;

    // Super admin can view any studio, studio users can only view their own
    if (req.user.role !== 'super_admin' && req.user.studio_id !== parseInt(studioId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studio = await queryRow(`
      SELECT 
        s.id,
        s.name,
        s.email,
        s.subscription_plan,
        s.subscription_status,
        s.subscription_start,
        s.subscription_end,
        s.stripe_customer_id,
        s.stripe_subscription_id,
        s.fee_type,
        s.fee_value,
        s.billing_cycle,
        s.is_free_subscription,
        s.cancellation_requested,
        s.cancellation_date,
        s.created_at,
        COUNT(DISTINCT u.id) as userCount
      FROM studios s
      LEFT JOIN users u ON u.studio_id = s.id AND u.role != 'super_admin'
      WHERE s.id = $1
      GROUP BY s.id, s.name, s.email, s.subscription_plan, s.subscription_status, s.subscription_start, s.subscription_end, s.stripe_customer_id, s.stripe_subscription_id, s.fee_type, s.fee_value, s.billing_cycle, s.is_free_subscription, s.cancellation_requested, s.cancellation_date, s.created_at
    `, [studioId]);

    if (!studio) {
      return res.status(404).json({ error: 'Studio not found' });
    }

    res.json(studio);
  } catch (error) {
    console.error('Get studio error:', error);
    res.status(500).json({ error: 'Failed to fetch studio' });
  }
});

// Get subscription info
router.get('/:studioId/subscription', authRequired, async (req, res) => {
  try {
    const { studioId } = req.params;

    // Check authorization - only studio members can view their studio's subscription
    if (req.user.role !== 'super_admin' && req.user.studio_id !== parseInt(studioId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studio = await queryRow(`
      SELECT 
        id,
        name,
        subscription_plan,
        subscription_status,
        subscription_start,
        subscription_end,
        is_free_subscription,
        cancellation_requested,
        cancellation_date,
        billing_cycle
      FROM studios
      WHERE id = $1
    `, [studioId]);

    if (!studio) {
      return res.status(404).json({ error: 'Studio not found' });
    }

    // Get the plan details
    const plan = studio.subscription_plan ? SUBSCRIPTION_PLANS[studio.subscription_plan] : null;

    res.json({
      studio,
      plan
    });
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

// Get studio usage stats against subscription limits
router.get('/:studioId/usage', authRequired, async (req, res) => {
  try {
    const { studioId } = req.params;
    const parsedStudioId = parseInt(studioId, 10);

    if (req.user.role !== 'super_admin' && req.user.studio_id !== parsedStudioId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studio = await queryRow(
      `SELECT id, subscription_plan as subscriptionPlan
       FROM studios
       WHERE id = $1`,
      [parsedStudioId]
    );

    if (!studio) {
      return res.status(404).json({ error: 'Studio not found' });
    }

    const plan = studio.subscriptionPlan ? SUBSCRIPTION_PLANS[studio.subscriptionPlan] : null;

    const albumStats = await queryRow(
      `SELECT COUNT(*) as albumCount
       FROM albums
       WHERE studio_id = $1`,
      [parsedStudioId]
    );

    const photoStats = await queryRow(
      `SELECT
         COUNT(*) as photoCount,
         COALESCE(SUM(COALESCE(p.file_size_bytes, 0)), 0) as storageBytes
       FROM photos p
       INNER JOIN albums a ON a.id = p.album_id
       WHERE a.studio_id = $1`,
      [parsedStudioId]
    );

    const albumCount = Number(albumStats?.albumCount) || 0;
    const photoCount = Number(photoStats?.photoCount) || 0;
    const storageBytes = Number(photoStats?.storageBytes) || 0;
    const storageGbUsed = storageBytes / (1024 ** 3);

    res.json({
      usage: {
        albumCount,
        photoCount,
        storageBytes,
        storageGbUsed,
      },
      limits: {
        maxAlbums: plan?.maxAlbums ?? null,
        maxPhotos: plan?.maxPhotos ?? null,
        maxStorageGb: plan?.maxStorageGb ?? null,
      },
      plan: plan
        ? {
            id: plan.id,
            name: plan.name,
          }
        : null,
    });
  } catch (error) {
    console.error('Get studio usage error:', error);
    res.status(500).json({ error: 'Failed to fetch studio usage' });
  }
});

// Cancel subscription (takes effect at renewal date)
router.post('/:studioId/subscription/cancel', authRequired, async (req, res) => {
  try {
    const { studioId } = req.params;

    // Verify authorization (studio admin or super admin)
    if (req.user.role !== 'studio_admin' || req.user.studio_id !== parseInt(studioId)) {
      if (req.user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }

    const studio = await queryRow('SELECT * FROM studios WHERE id = $1', [studioId]);
    if (!studio) {
      return res.status(404).json({ error: 'Studio not found' });
    }

    if (studio.subscription_status !== 'active') {
      return res.status(400).json({ error: 'No active subscription to cancel' });
    }

    if (studio.cancellation_requested) {
      return res.status(400).json({ error: 'Cancellation already requested' });
    }

    // Mark for cancellation at end of billing period
    await query(`
      UPDATE studios
      SET cancellation_requested = $1, cancellation_date = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [1, studioId]);

    // If using Stripe, cancel at period end
    if (studio.stripe_subscription_id) {
      try {
        await stripeService.setCancelAtPeriodEnd(studio.stripe_subscription_id, true);
      } catch (stripeError) {
        console.error('Stripe cancellation error:', stripeError);
        // Continue anyway - we've marked it in our DB
      }
    }

    const updated = await queryRow('SELECT * FROM studios WHERE id = $1', [studioId]);
    res.json({
      message: 'Subscription will be cancelled at the end of your billing period',
      studio: updated,
      cancelsOn: studio.subscription_end
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// Reactivate cancelled subscription (undo cancellation)
router.post('/:studioId/subscription/reactivate', authRequired, async (req, res) => {
  try {
    const { studioId } = req.params;

    // Verify authorization
    if (req.user.role !== 'studio_admin' || req.user.studio_id !== parseInt(studioId)) {
      if (req.user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }

    const studio = await queryRow('SELECT * FROM studios WHERE id = $1', [studioId]);
    if (!studio) {
      return res.status(404).json({ error: 'Studio not found' });
    }

    if (!studio.cancellation_requested) {
      return res.status(400).json({ error: 'No cancellation to undo' });
    }

    // Remove cancellation flag
    await query(`
      UPDATE studios
      SET cancellation_requested = $1, cancellation_date = NULL
      WHERE id = $2
    `, [0, studioId]);

    // If using Stripe, un-cancel subscription
    if (studio.stripe_subscription_id) {
      try {
        await stripeService.setCancelAtPeriodEnd(studio.stripe_subscription_id, false);
      } catch (stripeError) {
        console.error('Stripe reactivation error:', stripeError);
      }
    }

    const updated = await queryRow('SELECT * FROM studios WHERE id = $1', [studioId]);
    res.json({
      message: 'Subscription reactivated successfully',
      studio: updated
    });
  } catch (error) {
    console.error('Reactivate subscription error:', error);
    res.status(500).json({ error: 'Failed to reactivate subscription' });
  }
});

// Update studio subscription
router.patch('/:studioId/subscription', authRequired, async (req, res) => {
  try {
    const { studioId } = req.params;
    const { subscriptionPlan, subscriptionStatus, stripeCustomerId, stripeSubscriptionId, billingCycle, isFreeSubscription } = req.body;

    // Only super admin can update subscriptions
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (subscriptionPlan && !SUBSCRIPTION_PLANS[subscriptionPlan]) {
      return res.status(400).json({ error: 'Invalid subscription plan' });
    }

    const updateData = {};
    if (subscriptionPlan) updateData.subscription_plan = subscriptionPlan;
    if (subscriptionStatus) updateData.subscription_status = subscriptionStatus;
    if (stripeCustomerId) updateData.stripe_customer_id = stripeCustomerId;
    if (stripeSubscriptionId) updateData.stripe_subscription_id = stripeSubscriptionId;
    if (billingCycle) updateData.billing_cycle = billingCycle;
    if (isFreeSubscription !== undefined) updateData.is_free_subscription = !!isFreeSubscription;
    
    // If activating subscription, clear any pending cancellation
    if (subscriptionStatus === 'active') {
      updateData.cancellation_requested = 0;
      updateData.cancellation_date = null;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const updateKeys = Object.keys(updateData);
    const setClauses = updateKeys.map((key, index) => `${key} = $${index + 1}`).join(', ');
    const values = updateKeys.map(key => updateData[key]);
    values.push(studioId);

    await query(`
      UPDATE studios
      SET ${setClauses}
      WHERE id = $${values.length}
    `, values);

    const updatedStudio = await queryRow('SELECT * FROM studios WHERE id = $1', [studioId]);
    res.json(updatedStudio);
  } catch (error) {
    console.error('Update subscription error:', error);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

// Get subscription plans (public)
router.get('/plans/list', (req, res) => {
  res.json(SUBSCRIPTION_PLANS);
});

// Get studio fees
router.get('/:studioId/fees', authRequired, async (req, res) => {
  try {
    const { studioId } = req.params;

    // Check authorization
    if (req.user.role !== 'super_admin' && req.user.studio_id !== parseInt(studioId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studio = await queryRow(`
      SELECT id, name, fee_type, fee_value
      FROM studios
      WHERE id = $1
    `, [studioId]);

    if (!studio) {
      return res.status(404).json({ error: 'Studio not found' });
    }

    res.json({
      studioId: studio.id,
      studioName: studio.name,
      feeType: studio.fee_type || 'percentage',
      feeValue: studio.fee_value || 0
    });
  } catch (error) {
    console.error('Error fetching studio fees:', error);
    res.status(500).json({ error: 'Failed to fetch fees' });
  }
});

// Update studio fees (super admin only)
router.put('/:studioId/fees', authRequired, async (req, res) => {
  try {
    const { studioId } = req.params;
    const { feeType, feeValue } = req.body;

    // Verify super admin role
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admins can set studio fees' });
    }

    // Validate input
    if (!feeType || !['percentage', 'fixed'].includes(feeType)) {
      return res.status(400).json({ error: 'Invalid feeType. Must be "percentage" or "fixed"' });
    }

    if (typeof feeValue !== 'number' || feeValue < 0) {
      return res.status(400).json({ error: 'feeValue must be a non-negative number' });
    }

    if (feeType === 'percentage' && feeValue > 100) {
      return res.status(400).json({ error: 'Percentage fee cannot exceed 100%' });
    }

    // Check studio exists
    const studio = await queryRow('SELECT id FROM studios WHERE id = $1', [studioId]);
    if (!studio) {
      return res.status(404).json({ error: 'Studio not found' });
    }

    // Update fees
    await query(`
      UPDATE studios
      SET fee_type = $1, fee_value = $2
      WHERE id = $3
    `, [feeType, feeValue, studioId]);

    const updated = await queryRow(`
      SELECT id, name, fee_type, fee_value
      FROM studios
      WHERE id = $1
    `, [studioId]);

    res.json({
      message: 'Studio fees updated successfully',
      studio: {
        studioId: updated.id,
        studioName: updated.name,
        feeType: updated.fee_type,
        feeValue: updated.fee_value
      }
    });
  } catch (error) {
    console.error('Error updating studio fees:', error);
    res.status(500).json({ error: 'Failed to update fees' });
  }
});

// Get studio feature availability (labs/payment vendors)
router.get('/:studioId/features', authRequired, async (req, res) => {
  try {
    const { studioId } = req.params;
    const parsedStudioId = parseInt(studioId, 10);

    if (req.user.role !== 'super_admin' && req.user.studio_id !== parsedStudioId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studio = await queryRow(
      'SELECT id, payment_vendors as paymentVendors, lab_vendors as labVendors FROM studios WHERE id = $1',
      [parsedStudioId]
    );

    if (!studio) {
      return res.status(404).json({ error: 'Studio not found' });
    }

    const defaultSettings = {
      paymentVendors: ['stripe'],
      labVendors: ['roes', 'whcc', 'mpix'],
    };

    let paymentVendors = defaultSettings.paymentVendors;
    let labVendors = defaultSettings.labVendors;

    try {
      if (studio.paymentVendors) {
        const parsed = JSON.parse(studio.paymentVendors);
        if (Array.isArray(parsed) && parsed.length > 0) {
          paymentVendors = parsed;
        }
      }
    } catch {
      // keep default
    }

    try {
      if (studio.labVendors) {
        const parsed = JSON.parse(studio.labVendors);
        if (Array.isArray(parsed) && parsed.length > 0) {
          labVendors = parsed;
        }
      }
    } catch {
      // keep default
    }

    res.json({ paymentVendors, labVendors });
  } catch (error) {
    console.error('Error fetching studio features:', error);
    res.status(500).json({ error: 'Failed to fetch studio feature settings' });
  }
});

// Update studio feature availability (super admin only)
router.put('/:studioId/features', authRequired, async (req, res) => {
  try {
    const { studioId } = req.params;
    const parsedStudioId = parseInt(studioId, 10);
    const { paymentVendors, labVendors } = req.body || {};

    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admins can update studio feature settings' });
    }

    const allowedPayment = ['stripe'];
    const allowedLabs = ['roes', 'whcc', 'mpix'];

    const safePaymentVendors = Array.isArray(paymentVendors)
      ? paymentVendors.filter((vendor) => allowedPayment.includes(vendor))
      : ['stripe'];
    const safeLabVendors = Array.isArray(labVendors)
      ? labVendors.filter((vendor) => allowedLabs.includes(vendor))
      : ['roes', 'whcc', 'mpix'];

    await query(
      `UPDATE studios
       SET payment_vendors = $1,
           lab_vendors = $2
       WHERE id = $3`,
      [JSON.stringify(safePaymentVendors), JSON.stringify(safeLabVendors), parsedStudioId]
    );

    res.json({
      message: 'Studio feature settings updated',
      paymentVendors: safePaymentVendors,
      labVendors: safeLabVendors,
    });
  } catch (error) {
    console.error('Error updating studio features:', error);
    res.status(500).json({ error: 'Failed to update studio feature settings' });
  }
});

// Get studio admins (super admin can view all, studio_admin can view their own)
router.get('/:studioId/admins', authRequired, async (req, res) => {
  try {
    const { studioId } = req.params;

    // Check authorization
    if (req.user.role === 'studio_admin' && req.user.studio_id !== parseInt(studioId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (req.user.role !== 'studio_admin' && req.user.role !== 'super_admin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Get all studio admins for this studio
    const admins = await queryRows(`
      SELECT 
        u.id,
        u.email,
        u.name,
        u.role,
        u.is_active as isActive,
        u.created_at as createdAt,
        u.last_login_at as lastLoginAt,
        s.id as studioId,
        s.name as studioName
      FROM users u
      LEFT JOIN studios s ON u.studio_id = s.id
      WHERE u.studio_id = $1 AND u.role IN ('studio_admin', 'super_admin')
      ORDER BY u.created_at DESC
    `, [studioId]);

    res.json(admins);
  } catch (error) {
    console.error('Error fetching studio admins:', error);
    res.status(500).json({ error: 'Failed to fetch studio admins' });
  }
});

// Create a new studio admin (super admin or existing studio_admin can add to their studio)
router.post('/:studioId/admins', authRequired, async (req, res) => {
  try {
    const { studioId } = req.params;
    const { email, name, role = 'studio_admin' } = req.body;

    // Validate role is studio_admin or super_admin
    if (role !== 'studio_admin' && role !== 'super_admin') {
      return res.status(400).json({ error: 'Role must be studio_admin or super_admin' });
    }

    // Check authorization - only super_admin or existing studio_admin of that studio can add
    if (req.user.role !== 'super_admin') {
      if (req.user.role !== 'studio_admin' || req.user.studio_id !== parseInt(studioId)) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }

    // Verify studio exists
    const studio = await queryRow('SELECT id, name FROM studios WHERE id = $1', [studioId]);
    if (!studio) {
      return res.status(404).json({ error: 'Studio not found' });
    }

    // Check if user already exists
    const existingUser = await queryRow('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Create new studio admin user
    const randomPassword = crypto.randomBytes(16).toString('hex');

    const newUser = await queryRow(`
      INSERT INTO users (email, password, name, role, studio_id, is_active, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      RETURNING id, email, name, role, is_active as isActive, created_at as createdAt
    `, [email, randomPassword, name || email.split('@')[0], role, studioId, 1]);

    res.status(201).json({
      message: `${role} created successfully`,
      admin: {
        ...newUser,
        studioId: studio.id,
        studioName: studio.name,
        temporaryPassword: randomPassword
      }
    });
  } catch (error) {
    console.error('Error creating studio admin:', error);
    res.status(500).json({ error: 'Failed to create studio admin' });
  }
});

// Delete a studio admin
router.delete('/:studioId/admins/:userId', authRequired, async (req, res) => {
  try {
    const { studioId, userId } = req.params;

    // Check authorization
    if (req.user.role === 'studio_admin') {
      if (req.user.studio_id !== parseInt(studioId)) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      // Studio admin cannot delete another admin if it's the only one or if it's a super_admin
      const targetAdmin = await queryRow(
        'SELECT role, studio_id FROM users WHERE id = $1',
        [userId]
      );
      if (targetAdmin?.role === 'super_admin' || targetAdmin?.studio_id !== parseInt(studioId)) {
        return res.status(403).json({ error: 'Cannot delete this admin' });
      }
    } else if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Verify the admin exists in this studio
    const admin = await queryRow(
      'SELECT id, role FROM users WHERE id = $1 AND studio_id = $2',
      [userId, studioId]
    );
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found in this studio' });
    }

    // Don't allow deletion if it's the last admin
    const adminCount = await queryRow(
      'SELECT COUNT(*) as count FROM users WHERE studio_id = $1 AND role IN (\'studio_admin\', \'super_admin\')',
      [studioId]
    );
    
    if (adminCount.count <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last admin of a studio' });
    }

    // Delete the admin
    await query('DELETE FROM users WHERE id = $1', [userId]);

    res.json({ message: 'Admin deleted successfully' });
  } catch (error) {
    console.error('Error deleting studio admin:', error);
    res.status(500).json({ error: 'Failed to delete studio admin' });
  }
});

// Create Stripe checkout session
router.post('/:studioId/checkout', authRequired, async (req, res) => {
  try {
    const { studioId } = req.params;
    const { planId, billingCycle = 'monthly' } = req.body;

    // Verify authorization
    if (req.user.role !== 'studio_admin' || req.user.studio_id !== parseInt(studioId)) {
      if (req.user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }

    // Validate plan against constants
    const planConstant = SUBSCRIPTION_PLANS[planId];
    if (!planConstant) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    // Get studio
    const studio = await queryRow('SELECT * FROM studios WHERE id = $1', [studioId]);
    if (!studio) {
      return res.status(404).json({ error: 'Studio not found' });
    }

    // Update billing cycle in studio record
    await query('UPDATE studios SET billing_cycle = $1 WHERE id = $2', [billingCycle, studioId]);

    // Build success and cancel URLs
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const successUrl = `${baseUrl}/admin/dashboard?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/admin/dashboard`;

    // Prefer price IDs stored in DB over hardcoded constants
    let priceId;
    try {
      const dbPlan = await queryRow(
        `SELECT stripe_monthly_price_id, stripe_yearly_price_id
         FROM subscription_plans
         WHERE LOWER(name) = LOWER($1) AND is_active = 1`,
        [planId]
      );
      if (dbPlan) {
        priceId = billingCycle === 'yearly'
          ? dbPlan.stripe_yearly_price_id
          : dbPlan.stripe_monthly_price_id;
      }
    } catch (_) { /* table may not exist yet */ }

    // Fall back to hardcoded constants if DB has none
    if (!priceId) {
      priceId = billingCycle === 'yearly'
        ? planConstant.stripeYearlyPriceId
        : planConstant.stripePriceId;
    }

    if (!priceId) {
      return res.status(400).json({
        error: 'No Stripe price ID configured for this plan. Set one in the Super Admin Dashboard → Subscription Plans.'
      });
    }

    // Create Stripe checkout session
    const session = await stripeService.createCheckoutSession(
      studioId,
      priceId,
      successUrl,
      cancelUrl
    );

    res.json({
      checkoutUrl: session.url,
      sessionId: session.id
    });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

export default router;
