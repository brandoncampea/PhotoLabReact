-- Add can_receive_free_batch_shipping column to studios table if not present
IF COL_LENGTH('studios', 'can_receive_free_batch_shipping') IS NULL
    ALTER TABLE studios ADD can_receive_free_batch_shipping BIT DEFAULT 0;
GO
