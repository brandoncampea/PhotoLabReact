import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mssql = require('../mssql.cjs');

(async () => {
  try {
    const { query } = mssql;

    await query(`
      IF COL_LENGTH('order_items', 'product_options_snapshot') IS NULL
        ALTER TABLE order_items ADD product_options_snapshot NVARCHAR(MAX) NULL;
      IF COL_LENGTH('order_items', 'attributes') IS NULL
        ALTER TABLE order_items ADD attributes NVARCHAR(MAX) NULL;
      IF COL_LENGTH('order_items', 'fulfillment_type') IS NULL
        ALTER TABLE order_items ADD fulfillment_type NVARCHAR(32) NULL;
      IF COL_LENGTH('order_items', 'digital_download_scope') IS NULL
        ALTER TABLE order_items ADD digital_download_scope NVARCHAR(32) NULL;
      IF COL_LENGTH('order_items', 'source_album_id') IS NULL
        ALTER TABLE order_items ADD source_album_id INT NULL;
      IF COL_LENGTH('order_items', 'pricing_snapshot') IS NULL
        ALTER TABLE order_items ADD pricing_snapshot NVARCHAR(MAX) NULL;
      IF COL_LENGTH('order_items', 'studio_revenue_amount') IS NULL
        ALTER TABLE order_items ADD studio_revenue_amount FLOAT NULL;
      IF COL_LENGTH('order_items', 'base_revenue_amount') IS NULL
        ALTER TABLE order_items ADD base_revenue_amount FLOAT NULL;
      IF COL_LENGTH('order_items', 'production_cost_amount') IS NULL
        ALTER TABLE order_items ADD production_cost_amount FLOAT NULL;
      IF COL_LENGTH('order_items', 'gross_studio_markup_amount') IS NULL
        ALTER TABLE order_items ADD gross_studio_markup_amount FLOAT NULL;
      IF COL_LENGTH('order_items', 'studio_payout_amount') IS NULL
        ALTER TABLE order_items ADD studio_payout_amount FLOAT NULL;
      IF COL_LENGTH('order_items', 'super_admin_share_amount') IS NULL
        ALTER TABLE order_items ADD super_admin_share_amount FLOAT NULL;
      IF COL_LENGTH('order_items', 'stripe_fee_allocated_amount') IS NULL
        ALTER TABLE order_items ADD stripe_fee_allocated_amount FLOAT NULL;
      IF COL_LENGTH('order_items', 'studio_net_payout_amount') IS NULL
        ALTER TABLE order_items ADD studio_net_payout_amount FLOAT NULL;
      IF COL_LENGTH('order_items', 'package_group_id') IS NULL
        ALTER TABLE order_items ADD package_group_id NVARCHAR(128) NULL;
      IF COL_LENGTH('order_items', 'package_price') IS NULL
        ALTER TABLE order_items ADD package_price FLOAT NULL;
      IF COL_LENGTH('order_items', 'package_name') IS NULL
        ALTER TABLE order_items ADD package_name NVARCHAR(256) NULL;
    `);

    console.log('[startup] Order item accounting columns migration complete');
  } catch (err) {
    console.error('[startup] Failed to run order item accounting columns migration:', err);
  }
})();
