// Add items (products with sizes) to a price list
import express from 'express';
import mssql from '../mssql.cjs';
const { queryRow, query } = mssql;
import { superAdminRequired } from '../middleware/auth.js';
const router = express.Router();

// ...existing routes...

// Add items to price list (products with sizes)
router.post('/:id/items', superAdminRequired, async (req, res) => {
  try {
    // ...existing code...
    const priceListId = parseInt(req.params.id, 10);
    const items = req.body.items || [];
    if (!Array.isArray(items) || items.length === 0) {
      // ...existing code...
      return res.status(400).json({ error: 'No items provided' });
    }

    const normalizeName = (value) => String(value || '').trim().toLowerCase();
    const existingRows = await query(
      `SELECT p.name
       FROM products p
       INNER JOIN price_list_products plp ON plp.product_id = p.id
       WHERE plp.price_list_id = $1`,
      [priceListId]
    );
    const existingProductNames = new Set(
      (existingRows.rows || []).map((row) => normalizeName(row.name)).filter(Boolean)
    );

    const seenIncomingProductNames = new Set();
    const skippedProducts = [];
    let insertedProducts = 0;
    let insertedSizes = 0;

    for (const item of items) {
      try {
        // Skip products with missing or empty name
        if (!item.productName || typeof item.productName !== 'string' || item.productName.trim() === '') {
          // ...existing code...
          continue;
        }

        const normalizedProductName = normalizeName(item.productName);
        if (!normalizedProductName) {
          continue;
        }

        // Skip duplicates in target price list and duplicates within this import payload
        if (existingProductNames.has(normalizedProductName) || seenIncomingProductNames.has(normalizedProductName)) {
          skippedProducts.push(item.productName);
          continue;
        }
        seenIncomingProductNames.add(normalizedProductName);

        // Find first valid price in sizes array
        let price = 0;
        if (Array.isArray(item.sizes) && item.sizes.length > 0) {
          const validPriceObj = item.sizes.find(s => typeof s.price === 'number' && !isNaN(s.price));
          if (validPriceObj && validPriceObj.price != null) {
            price = validPriceObj.price;
          }
        }
        // Force price to a valid number (0 if not finite)
        price = Number(price);
        if (!Number.isFinite(price)) price = 0;
        // ...existing code...

        // Insert product if not exists
        let product = await queryRow('SELECT id FROM products WHERE name = $1', [item.productName]);
        if (!product) {
          const sql = 'INSERT INTO products (name, description, category, price) VALUES ($1, $2, $3, $4) RETURNING id';
          const sqlArgs = [item.productName, item.description || '', item.category || 'Other', price];
          // ...existing code...
          product = await queryRow(sql, sqlArgs);
        }

        // Link product to price list if not already linked
        const exists = await queryRow('SELECT 1 FROM price_list_products WHERE price_list_id = $1 AND product_id = $2', [priceListId, product.id]);
        if (!exists) {
          await query('INSERT INTO price_list_products (price_list_id, product_id) VALUES ($1, $2)', [priceListId, product.id]);
          insertedProducts += 1;
        }

        // Insert sizes for this product
        const seenIncomingSizeNames = new Set();
        for (const size of (item.sizes || [])) {
          try {
            // Always use size.name if present, fallback to size.sizeName, always trim
            const rawName = (size.name !== undefined ? String(size.name) : '').trim();
            const rawSizeName = (size.sizeName !== undefined ? String(size.sizeName) : '').trim();
            const sizeName = rawName || rawSizeName;
            // ...existing code...
            if (!sizeName) {
              // ...existing code...
              continue;
            }

            const normalizedSizeName = normalizeName(sizeName);
            if (!normalizedSizeName || seenIncomingSizeNames.has(normalizedSizeName)) {
              continue;
            }
            seenIncomingSizeNames.add(normalizedSizeName);
            // Default NULL or missing price/cost to 0
            const safePrice = (typeof size.price === 'number' && !isNaN(size.price)) ? size.price : 0;
            const safeCost = (typeof size.cost === 'number' && !isNaN(size.cost)) ? size.cost : 0;
            // Check if size exists for this product and price list
            const sizeExists = await queryRow('SELECT 1 FROM product_sizes WHERE product_id = $1 AND price_list_id = $2 AND size_name = $3', [product.id, priceListId, sizeName]);
            if (!sizeExists) {
              await query('INSERT INTO product_sizes (product_id, price_list_id, size_name, price, cost) VALUES ($1, $2, $3, $4, $5)', [product.id, priceListId, sizeName, safePrice, safeCost]);
              insertedSizes += 1;
              // ...existing code...
            }
          } catch (sizeError) {
            // ...existing code...
            throw sizeError;
          }
        }
      } catch (itemError) {
        // ...existing code...
        throw itemError;
      }
    }

    res.json({
      message: 'Items added to price list',
      insertedProducts,
      insertedSizes,
      skippedProducts,
    });
  } catch (error) {
    // ...existing code...
    res.status(500).json({ error: error.message });
  }
});

export default router;
