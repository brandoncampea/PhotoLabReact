// Migration: Add whcc_order_id to orders table if not present
module.exports = async function migrateWhccOrderIdColumn(db) {
  // Check if column exists
  const result = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'whcc_order_id'`);
  if (result.rows.length === 0) {
    await db.query(`ALTER TABLE orders ADD COLUMN whcc_order_id VARCHAR(64)`);
    console.log('Added whcc_order_id column to orders table');
  } else {
    console.log('whcc_order_id column already exists');
  }
};
