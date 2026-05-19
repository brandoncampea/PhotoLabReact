// Reports API endpoints for CSV exports (ESM)
import express from 'express';
import { parseISO, isValid } from 'date-fns';
import * as reports from '../reports/index.js';
import { requireStudioOrSuperAdmin, requireSuperAdmin } from '../middleware/auth.js';

const router = express.Router();

// Helper: parse and validate date range
function getDateRange(req) {
  const { start, end } = req.query;
  let startDate = null, endDate = null;
  if (start) {
    startDate = isValid(parseISO(start)) ? start : null;
    if (!startDate) throw new Error('Invalid start date');
  }
  if (end) {
    endDate = isValid(parseISO(end)) ? end : null;
    if (!endDate) throw new Error('Invalid end date');
  }
  return { startDate, endDate };
}

// Helper: get studioIds for super admin filtering
function getStudioIds(req) {
  // Accepts studioIds[] (array) or studioId (single)
  let ids = req.query.studioIds || req.query.studioId || null;
  if (!ids) return null;
  if (Array.isArray(ids)) return ids.filter(Boolean);
  if (typeof ids === 'string' && ids.includes(',')) return ids.split(',').map(s => s.trim()).filter(Boolean);
  return [ids];
}

// Orders Report
router.get('/orders', requireStudioOrSuperAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    const studioIds = getStudioIds(req);
    const csv = await reports.ordersReport({ startDate, endDate, studioIds });
    res.header('Content-Type', 'text/csv');
    res.attachment('orders_report.csv');
    res.send(csv);
  } catch (err) {
    console.error('[REPORTS][ORDERS] Error:', err.message, '\nStack:', err.stack, '\nParams:', req.query);
    res.status(400).json({ error: err.message, details: err.stack, params: req.query });
  }
});

// Sales Summary Report
router.get('/sales-summary', requireStudioOrSuperAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    const studioIds = getStudioIds(req);
    const csv = await reports.salesSummaryReport({ startDate, endDate, studioIds });
    res.header('Content-Type', 'text/csv');
    res.attachment('sales_summary_report.csv');
    res.send(csv);
  } catch (err) {
    console.error('[REPORTS][SALES SUMMARY] Error:', err.message, '\nStack:', err.stack, '\nParams:', req.query);
    res.status(400).json({ error: err.message, details: err.stack, params: req.query });
  }
});

// Photo Uploads Report
router.get('/photo-uploads', requireStudioOrSuperAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    const studioIds = getStudioIds(req);
    const csv = await reports.photoUploadsReport({ startDate, endDate, studioIds });
    res.header('Content-Type', 'text/csv');
    res.attachment('photo_uploads_report.csv');
    res.send(csv);
  } catch (err) {
    console.error('[REPORTS][PHOTO UPLOADS] Error:', err.message, '\nStack:', err.stack, '\nParams:', req.query);
    res.status(400).json({ error: err.message, details: err.stack, params: req.query });
  }
});

// Product Popularity Report
router.get('/product-popularity', requireStudioOrSuperAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    const studioIds = getStudioIds(req);
    const csv = await reports.productPopularityReport({ startDate, endDate, studioIds });
    res.header('Content-Type', 'text/csv');
    res.attachment('product_popularity_report.csv');
    res.send(csv);
  } catch (err) {
    console.error('[REPORTS][PRODUCT POPULARITY] Error:', err.message, '\nStack:', err.stack, '\nParams:', req.query);
    res.status(400).json({ error: err.message, details: err.stack, params: req.query });
  }
});

// Customer List Report
router.get('/customer-list', requireStudioOrSuperAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    const studioIds = getStudioIds(req);
    const csv = await reports.customerListReport({ startDate, endDate, studioIds });
    res.header('Content-Type', 'text/csv');
    res.attachment('customer_list_report.csv');
    res.send(csv);
  } catch (err) {
    console.error('[REPORTS][CUSTOMER LIST] Error:', err.message, '\nStack:', err.stack, '\nParams:', req.query);
    res.status(400).json({ error: err.message, details: err.stack, params: req.query });
  }
});

// Studio Sales Comparison Report (super admin only)
router.get('/studio-sales-comparison', requireSuperAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    const csv = await reports.studioSalesComparisonReport({ startDate, endDate });
    res.header('Content-Type', 'text/csv');
    res.attachment('studio_sales_comparison_report.csv');
    res.send(csv);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Top Products Across Studios Report (super admin only)
router.get('/top-products', requireSuperAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    const csv = await reports.topProductsReport({ startDate, endDate });
    res.header('Content-Type', 'text/csv');
    res.attachment('top_products_report.csv');
    res.send(csv);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Studio Activity Report (super admin only)
router.get('/studio-activity', requireSuperAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    const csv = await reports.studioActivityReport({ startDate, endDate });
    res.header('Content-Type', 'text/csv');
    res.attachment('studio_activity_report.csv');
    res.send(csv);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Failed/Cancelled Orders Report
router.get('/failed-orders', requireStudioOrSuperAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    const studioIds = getStudioIds(req);
    const csv = await reports.failedOrdersReport({ startDate, endDate, studioIds });
    res.header('Content-Type', 'text/csv');
    res.attachment('failed_orders_report.csv');
    res.send(csv);
  } catch (err) {
    console.error('[REPORTS][FAILED ORDERS] Error:', err.message, '\nStack:', err.stack, '\nParams:', req.query);
    res.status(400).json({ error: err.message, details: err.stack, params: req.query });
  }
});

// Export router (ESM)
export default router;
