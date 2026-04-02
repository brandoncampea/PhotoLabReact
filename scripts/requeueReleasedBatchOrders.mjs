import mssql from '../server/mssql.cjs';

const { query, queryRows } = mssql;

const ids = Array.from({ length: 20 }, (_, i) => i + 12);
const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');

const selectSql = `
  SELECT id,
         is_batch as isBatch,
         lab_submitted as labSubmitted,
         batch_queue_status as batchQueueStatus,
         batch_lab_vendor as batchLabVendor,
         lab_submitted_at as labSubmittedAt
  FROM orders
  WHERE id IN (${placeholders})
  ORDER BY id
`;

const updateSql = `
  UPDATE orders
  SET lab_submitted = 0,
      lab_submitted_at = NULL,
      batch_queue_status = 'queued',
      batch_lab_vendor = NULL,
      whcc_confirmation_id = NULL,
      whcc_import_response = NULL,
      whcc_submit_response = NULL,
      whcc_request_log = NULL,
      whcc_last_error = NULL,
      whcc_order_number = NULL,
      whcc_webhook_status = NULL,
      whcc_webhook_event = NULL,
      shipping_carrier = NULL,
      tracking_number = NULL,
      tracking_url = NULL,
      shipped_at = NULL,
      status = CASE WHEN status = 'processing' THEN 'pending' ELSE status END
  WHERE is_batch = 1
    AND id IN (${placeholders})
`;

const before = await queryRows(selectSql, ids);
await query(updateSql, ids);
const after = await queryRows(selectSql, ids);

console.log(JSON.stringify({ updatedOrderIds: ids, before, after }, null, 2));
