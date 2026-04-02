const db = require('../server/mssql.cjs');

(async () => {
  try {
    const rows = await db.queryRows(
      `SELECT TOP 5 id, created_at, whcc_import_response, whcc_request_log
       FROM orders
       WHERE whcc_import_response LIKE '%Gallery Wrap Type%'
          OR whcc_import_response LIKE '%Framed Print Printing Media%'
       ORDER BY created_at DESC`,
      []
    );

    console.log('rows', rows.length);
    for (const row of rows) {
      const resp = JSON.parse(row.whcc_import_response || '{}');
      const req = JSON.parse(row.whcc_request_log || '{}');
      console.log('\norder', row.id, 'created', row.created_at);
      console.log('brokenRules', JSON.stringify(resp.BrokenRules || [], null, 2));
      for (const it of req?.resolvedItems || []) {
        console.log(JSON.stringify({
          localItemId: it.localItemId,
          productName: it.productName,
          sizeName: it.sizeName,
          category: it.productCategory,
          mappingSource: it.mappingSource,
          catalogProductName: it.catalogProductName,
          productUID: it?.payload?.ProductUID,
          nodeId: it?.payload?.ItemAssets?.[0]?.ProductNodeID,
          attrs: (it?.payload?.ItemAttributes || []).map((a) => a.AttributeUID),
        }, null, 2));
      }
    }
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }
})();
