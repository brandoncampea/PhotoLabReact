import mssql from '../server/mssql.cjs';
const { queryRows, query } = mssql;

// Check current state
const before = await queryRows('SELECT id, status, is_batch, batch_queue_status, lab_submitted FROM orders WHERE id IN (40,41,42,43)');
console.log('BEFORE:', JSON.stringify(before, null, 2));

// Mark orders 40, 41, 42 as submitted (released from batch)
await query(`
  UPDATE orders
  SET lab_submitted = 1,
      lab_submitted_at = CURRENT_TIMESTAMP,
      batch_queue_status = 'submitted',
      status = 'processing'
  WHERE id IN (40, 41, 42)
`);
console.log('Updated orders 40, 41, 42 → lab_submitted=1, batch_queue_status=submitted, status=processing');

// Move order 43 from cancelled into the batch (pending, batch queue)
await query(`
  UPDATE orders
  SET status = 'pending',
      is_batch = 1,
      batch_queue_status = 'pending',
      lab_submitted = 0,
      lab_submitted_at = NULL
  WHERE id = 43
`);
console.log('Updated order 43 → status=pending, is_batch=1, batch_queue_status=pending');

const after = await queryRows('SELECT id, status, is_batch, batch_queue_status, lab_submitted FROM orders WHERE id IN (40,41,42,43)');
console.log('AFTER:', JSON.stringify(after, null, 2));

process.exit(0);
