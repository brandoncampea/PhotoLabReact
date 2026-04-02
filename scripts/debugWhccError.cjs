const db = require('../server/mssql.cjs');

const preview = (value, limit = 1200) => String(value || '').slice(0, limit);

(async () => {
  try {
    const r = await db.query('SELECT TOP 10 id, whcc_import_response, whcc_submit_response, whcc_last_error, whcc_request_log FROM orders ORDER BY id DESC');
    const rows = r.rows || [];

    for (const row of rows) {
      const importText = String(row.whcc_import_response || '');
      const submitText = String(row.whcc_submit_response || '');
      const errorText = String(row.whcc_last_error || '');
      const hasBrokenRules = /BrokenRules|412\.02|Invalid Business Rules/i.test(importText) || /BrokenRules|412\.02|Invalid Business Rules/i.test(submitText) || /BrokenRules|412\.02|Invalid Business Rules/i.test(errorText);
      if (!hasBrokenRules) continue;

      console.log('\n=== ORDER', row.id, '===');
      console.log('whcc_last_error:', preview(errorText));
      console.log('whcc_import_response:', preview(importText));
      console.log('whcc_submit_response:', preview(submitText));

      let requestLog = {};
      try {
        requestLog = JSON.parse(row.whcc_request_log || '{}');
      } catch {
        requestLog = {};
      }

      const items = (requestLog.resolvedItems || []).map((i) => ({
        line: i?.payload?.LineItemID,
        productName: i?.productName,
        sizeName: i?.sizeName,
        catalog: i?.catalogProductName,
        productUID: i?.payload?.ProductUID,
        productNodeID: i?.payload?.ItemAssets?.[0]?.ProductNodeID,
        attrs: (i?.payload?.ItemAttributes || []).map((a) => a?.AttributeUID),
      }));
      console.log('resolvedItems:', JSON.stringify(items, null, 2));
    }

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
