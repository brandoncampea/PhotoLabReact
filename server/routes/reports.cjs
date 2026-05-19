// Reports API endpoints for CSV exports
const express = require('express');
const router = express.Router();
const { parseISO, isValid } = require('date-fns');
const reports = require('../reports');
const { requireStudioOrSuperAdmin, requireSuperAdmin } = require('../middleware/auth');

// Helper: parse and validate date range
function getDateRange(req) {
  const { start, end } = req.query;
  const startDate = isValid(parseISO(start)) ? start : null;
  const endDate = isValid(parseISO(end)) ? end : null;
  if (!startDate || !endDate) throw new Error('Invalid date range');
  return { startDate, endDate };
}

// Helper: get studioId for super admin filtering
function getStudioId(req) {
  return req.query.studioId || null;
}

// Orders Report
router.get('/orders', requireStudioOrSuperAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    const studioId = getStudioId(req);
    const csv = await reports.ordersReport({ startDate, endDate, studioId });
    res.header('Content-Type', 'text/csv');
    res.attachment('orders_report.csv');
    res.send(csv);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Sales Summary Report
router.get('/sales-summary', requireStudioOrSuperAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    const studioId = getStudioId(req);
    const csv = await reports.salesSummaryReport({ startDate, endDate, studioId });
    res.header('Content-Type', 'text/csv');
    res.attachment('sales_summary_report.csv');
    res.send(csv);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Photo Uploads Report
router.get('/photo-uploads', requireStudioOrSuperAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    const studioId = getStudioId(req);
    const csv = await reports.photoUploadsReport({ startDate, endDate, studioId });
    res.header('Content-Type', 'text/csv');
    res.attachment('photo_uploads_report.csv');
    res.send(csv);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Product Popularity Report
router.get('/product-popularity', requireStudioOrSuperAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    const studioId = getStudioId(req);
    const csv = await reports.productPopularityReport({ startDate, endDate, studioId });
    res.header('Content-Type', 'text/csv');
    res.attachment('product_popularity_report.csv');
    res.send(csv);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Customer List Report
router.get('/customer-list', requireStudioOrSuperAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    const studioId = getStudioId(req);
    const csv = await reports.customerListReport({ startDate, endDate, studioId });
    res.header('Content-Type', 'text/csv');
    res.attachment('customer_list_report.csv');
    res.send(csv);
  } catch (err) {
    res.status(400).json({ error: err.message });
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
    const studioId = getStudioId(req);
    const csv = await reports.failedOrdersReport({ startDate, endDate, studioId });
    res.header('Content-Type', 'text/csv');
    res.attachment('failed_orders_report.csv');
    res.send(csv);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
