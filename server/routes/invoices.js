import express from 'express';
import { queryRow, queryRows, query, tableExists, columnExists } from '../mssql.js';
import { authRequired, adminRequired, superAdminRequired } from '../middleware/auth.js';
const router = express.Router();

// All invoice routes require auth
router.use(authRequired);

// Helper: get studio_id for current user (studio_admin only)
const requireStudioAdmin = (req, res, next) => {
  if (req.user.role !== 'studio_admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

/**
 * GET /api/invoices/current
 * Studio admin: get their current open invoice with line items
 */
router.get('/current', adminRequired, async (req, res) => {
  try {
    const studioId = req.user.role === 'super_admin'
      ? Number(req.query.studioId)
      : Number(req.user.studio_id);

    if (!studioId) {
      return res.status(400).json({ error: 'Studio context required' });
    }

    const [hasInvoicesTable, hasInvoiceItemsTable, hasInvoiceItemProductSizeId] = await Promise.all([
      tableExists('studio_invoices'),
      tableExists('studio_invoice_items'),
      columnExists('studio_invoice_items', 'product_size_id'),
    ]);

    if (!hasInvoicesTable) {
      return res.json(null);
    }

    const invoice = await queryRow(
      `SELECT id, studio_id as studioId, billing_period_start as periodStart,
              billing_period_end as periodEnd, status, total_amount as totalAmount,
              item_count as itemCount, created_at as createdAt, updated_at as updatedAt
       FROM studio_invoices
       WHERE studio_id = $1 AND status = 'open'
       ORDER BY created_at DESC`,
      [studioId]
    );

    if (!invoice) {
      return res.json(null);
    }

    // Get subscription renewal date for due date
    const studio = await queryRow(
      'SELECT subscription_end FROM studios WHERE id = $1',
      [studioId]
    );

    // Get line items with product info
    const items = hasInvoiceItemsTable
      ? await queryRows(
          `SELECT
             sii.id,
             sii.order_id as orderId,
             sii.product_id as productId,
             ${hasInvoiceItemProductSizeId ? 'sii.product_size_id' : 'CAST(NULL AS INT)'} as productSizeId,
             sii.quantity,
             sii.unit_cost as unitCost,
             sii.total_cost as totalCost,
             sii.order_date as orderDate,
             p.name as productName,
             ${hasInvoiceItemProductSizeId ? 'ps.size_name' : 'CAST(NULL AS NVARCHAR(255))'} as sizeName
           FROM studio_invoice_items sii
           LEFT JOIN products p ON p.id = sii.product_id
           ${hasInvoiceItemProductSizeId ? 'LEFT JOIN product_sizes ps ON ps.id = sii.product_size_id' : ''}
           WHERE sii.invoice_id = $1
           ORDER BY sii.order_date DESC`,
          [invoice.id]
        )
      : [];

    res.json({
      ...invoice,
      dueDate: studio?.subscription_end || null,
      items,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/invoices/history
 * Studio admin: past invoices (closed/billed/paid)
 */
router.get('/history', adminRequired, async (req, res) => {
  try {
    const studioId = req.user.role === 'super_admin'
      ? Number(req.query.studioId)
      : Number(req.user.studio_id);

    if (!studioId) {
      return res.status(400).json({ error: 'Studio context required' });
    }

    if (!(await tableExists('studio_invoices'))) {
      return res.json([]);
    }

    const invoices = await queryRows(
      `SELECT id, studio_id as studioId, billing_period_start as periodStart,
              billing_period_end as periodEnd, status, total_amount as totalAmount,
              item_count as itemCount, created_at as createdAt
       FROM studio_invoices
       WHERE studio_id = $1 AND status <> 'open'
       ORDER BY created_at DESC`,
      [studioId]
    );

    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/invoices/admin/all
 * Super admin: all studios' current open invoice balances + totals
 */
router.get('/admin/all', superAdminRequired, async (req, res) => {
  try {
    const hasInvoicesTable = await tableExists('studio_invoices');
    const studioBalances = hasInvoicesTable
      ? await queryRows(
          `SELECT
             s.id as studioId,
             s.name as studioName,
             s.subscription_end as subscriptionEnd,
             COALESCE(si.total_amount, 0) as outstandingAmount,
             COALESCE(si.item_count, 0) as itemCount,
             si.billing_period_start as periodStart,
             si.id as invoiceId,
             si.status
           FROM studios s
           LEFT JOIN studio_invoices si ON si.studio_id = s.id AND si.status = 'open'
           ORDER BY s.name ASC`,
          []
        )
      : await queryRows(
          `SELECT
             s.id as studioId,
             s.name as studioName,
             s.subscription_end as subscriptionEnd,
             CAST(0 AS FLOAT) as outstandingAmount,
             CAST(0 AS INT) as itemCount,
             CAST(NULL AS DATETIME2) as periodStart,
             CAST(NULL AS INT) as invoiceId,
             CAST(NULL AS NVARCHAR(50)) as status
           FROM studios s
           ORDER BY s.name ASC`,
          []
        );

    const totalOutstanding = studioBalances.reduce(
      (sum, row) => sum + (Number(row.outstandingAmount) || 0),
      0
    );

    res.json({ studioBalances, studios: studioBalances, totalOutstanding });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/invoices/admin/studio/:studioId
 * Super admin: full invoice history for a specific studio
 */
router.get('/admin/studio/:studioId', superAdminRequired, async (req, res) => {
  try {
    const studioId = Number(req.params.studioId);
    if (!studioId) return res.status(400).json({ error: 'Invalid studio id' });

    if (!(await tableExists('studio_invoices'))) {
      return res.json([]);
    }

    const invoices = await queryRows(
      `SELECT id, studio_id as studioId, billing_period_start as periodStart,
              billing_period_end as periodEnd, status, total_amount as totalAmount,
              item_count as itemCount, created_at as createdAt
       FROM studio_invoices
       WHERE studio_id = $1
       ORDER BY created_at DESC`,
      [studioId]
    );

    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/invoices/:invoiceId/close
 * Super admin: close a studio invoice (mark as billed, opens new period)
 */
router.post('/:invoiceId/close', superAdminRequired, async (req, res) => {
  try {
    const invoiceId = Number(req.params.invoiceId);
    if (!invoiceId) return res.status(400).json({ error: 'Invalid invoice id' });

    if (!(await tableExists('studio_invoices'))) {
      return res.status(400).json({ error: 'Invoice storage is not available yet' });
    }

    const invoice = await queryRow(
      'SELECT id, studio_id as studioId, status FROM studio_invoices WHERE id = $1',
      [invoiceId]
    );

    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.status !== 'open') return res.status(400).json({ error: 'Invoice is not open' });

    await query(
      `UPDATE studio_invoices
       SET status = 'billed', billing_period_end = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [invoiceId]
    );

    // Open a fresh invoice for the next period
    await query(
      `INSERT INTO studio_invoices (studio_id, billing_period_start, status, total_amount, item_count)
       VALUES ($1, CURRENT_TIMESTAMP, 'open', 0, 0)`,
      [invoice.studioId]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/invoices/:invoiceId/status
 * Super admin: mark an invoice as paid
 */
router.patch('/:invoiceId/status', superAdminRequired, async (req, res) => {
  try {
    const invoiceId = Number(req.params.invoiceId);
    const { status } = req.body;

    const allowed = ['open', 'billed', 'paid'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    if (!(await tableExists('studio_invoices'))) {
      return res.status(400).json({ error: 'Invoice storage is not available yet' });
    }

    await query(
      `UPDATE studio_invoices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [status, invoiceId]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
