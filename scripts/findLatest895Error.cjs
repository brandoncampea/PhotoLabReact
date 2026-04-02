const mssql = require('../server/mssql.cjs');

(async () => {
  try {
    const rows = await mssql.queryRows(
      `SELECT TOP 1 id, whcc_import_response FROM orders WHERE whcc_import_response LIKE '%895%' ORDER BY created_at DESC`,
      []
    );
    
    if (rows.length > 0) {
      const resp = JSON.parse(rows[0].whcc_import_response);
      console.log(JSON.stringify(resp, null, 2));
    } else {
      console.log('No orders found with product 895');
    }
    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
})();
