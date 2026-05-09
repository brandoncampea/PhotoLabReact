-- Reset orders 47 and 48 to batch state for re-release
-- This script sets the relevant fields to allow batch release again




-- Optionally, reset any related batch shipping fields if needed
UPDATE orders
SET batch_shipping_address = NULL
WHERE id IN (47, 48);

-- Optionally, reset order_items if you want to clear any fulfillment state
-- UPDATE order_items SET fulfilled = 0, fulfilled_at = NULL WHERE order_id IN (47, 48);

-- Review the changes before running in production!