-- Reset orders 47 and 48 to batch state for re-release
-- This script sets the relevant fields to allow batch release again

UPDATE orders
SET
  status = 'pending',
  lab_submitted = 0,
  lab_submitted_at = NULL,
  whcc_confirmation_id = NULL,
  whcc_import_response = NULL,
  whcc_submit_response = NULL,
  whcc_request_log = NULL,
  whcc_last_error = NULL,
  batch_queue_status = 'pending',
  batch_lab_vendor = NULL,
  whcc_webhook_id = NULL
WHERE id IN (47, 48);

-- Optionally, reset any related batch shipping fields if needed
UPDATE orders
SET batch_shipping_address = NULL
WHERE id IN (47, 48);

-- Optionally, reset order_items if you want to clear any fulfillment state
-- UPDATE order_items SET fulfilled = 0, fulfilled_at = NULL WHERE order_id IN (47, 48);

-- Review the changes before running in production!