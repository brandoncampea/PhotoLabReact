const db = require('../server/mssql.cjs');

(async () => {
  try {
    const { query, queryRow, tableExists } = db;

    const beforeOrders = await queryRow('SELECT COUNT(*) as count FROM orders', []);
    const beforeItems = await queryRow('SELECT COUNT(*) as count FROM order_items', []);

    console.log('Before:', {
      orders: Number(beforeOrders?.count || 0),
      orderItems: Number(beforeItems?.count || 0),
    });

    if (await tableExists('studio_invoice_items')) {
      await query('DELETE FROM studio_invoice_items WHERE order_id IS NOT NULL', []);
    }

    await query('DELETE FROM order_items', []);
    await query('DELETE FROM orders', []);

    // Reset identities when present
    try { await query("DBCC CHECKIDENT ('order_items', RESEED, 0)", []); } catch {}
    try { await query("DBCC CHECKIDENT ('orders', RESEED, 0)", []); } catch {}

    const afterOrders = await queryRow('SELECT COUNT(*) as count FROM orders', []);
    const afterItems = await queryRow('SELECT COUNT(*) as count FROM order_items', []);

    console.log('After:', {
      orders: Number(afterOrders?.count || 0),
      orderItems: Number(afterItems?.count || 0),
    });

    process.exit(0);
  } catch (error) {
    console.error('Failed to clear orders:', error?.message || error);
    process.exit(1);
  }
})();
