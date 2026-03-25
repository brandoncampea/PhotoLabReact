-- 2026-03-24-addProductOrderIndex.sql
-- Adds order_index column to products table for custom ordering

ALTER TABLE products ADD COLUMN order_index INTEGER DEFAULT 0;
