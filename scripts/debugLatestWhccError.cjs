const db = require('../server/mssql.cjs');

(async () => {
  try {
    const row = await db.queryRow(
      `SELECT TOP 1 *
       FROM orders
       WHERE whcc_import_response IS NOT NULL
       ORDER BY created_at DESC`,
      []
    );

    if (!row) {
      console.log('No order rows found');
      process.exit(0);
    }

    const resp = (() => {
      try { return JSON.parse(row.whcc_import_response || '{}'); } catch { return row.whcc_import_response; }
    })();
    const reqLogRaw = row.request_log ?? row.whcc_request_log ?? row.whcc_payload ?? row.whcc_order_payload ?? null;
    const reqLog = (() => {
      try { return JSON.parse(reqLogRaw || '{}'); } catch { return reqLogRaw; }
    })();

    console.log('Order ID:', row.id);
    console.log('Order columns:', Object.keys(row));
    console.log('BrokenRules:', JSON.stringify(resp?.BrokenRules || resp, null, 2));

    const resolved = reqLog?.resolvedItems || [];
    console.log('Resolved items:');
    for (const item of resolved) {
      console.log(JSON.stringify({
        localItemId: item.localItemId,
        productName: item.productName,
        sizeName: item.sizeName,
        productCategory: item.productCategory,
        productUID: item.payload?.ProductUID,
        productNodeID: item.payload?.ItemAssets?.[0]?.ProductNodeID,
        attrs: (item.payload?.ItemAttributes || []).map((a) => a.AttributeUID),
        catalogProductName: item.catalogProductName,
        mappingSource: item.mappingSource,
      }, null, 2));
    }

    process.exit(0);
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }
})();
