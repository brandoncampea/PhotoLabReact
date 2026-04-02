const db = require('../server/mssql.cjs');

(async () => {
  try {
    const row = await db.queryRow(
      `SELECT TOP 1 id, whcc_import_response, whcc_request_log
       FROM orders
       WHERE whcc_import_response IS NOT NULL
       ORDER BY created_at DESC`,
      []
    );

    if (!row) {
      console.log('No rows');
      return;
    }

    const resp = JSON.parse(row.whcc_import_response || '{}');
    const req = JSON.parse(row.whcc_request_log || '{}');

    console.log('orderId', row.id);
    console.log('brokenRules', JSON.stringify(resp.BrokenRules || [], null, 2));

    const items = req?.resolvedItems || [];
    console.log('resolvedItemsCount', items.length);
    for (const it of items) {
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
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }
})();
