// Script to reset orders 40, 41, 42, 43 to 'waiting' status
const mssql = require('../server/mssql.cjs');

async function resetOrders() {
  const orderIds = [40, 41, 42, 43];
  for (const id of orderIds) {
    await mssql.query(
      `UPDATE orders SET status = 'waiting', cancel_reason = NULL, cancel_by = NULL, cancel_at = NULL, refund_status = NULL, refund_id = NULL, refund_error = NULL WHERE id = @p1`,
      [id]
    );
    console.log(`Order ${id} reset to waiting.`);
  }
  process.exit(0);
}

resetOrders().catch((err) => {
  console.error('Error resetting orders:', err);
  process.exit(1);
});
