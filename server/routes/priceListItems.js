// Add items (products with sizes) to a price list
import express from 'express';
import { db } from '../database.js';
import { adminRequired } from '../middleware/auth.js';
const router = express.Router();

// ...existing routes...

// Add items to price list (products with sizes)
router.post('/:id/items', adminRequired, (req, res) => {
  try {
    console.log('[PriceListItems] Received request:', { params: req.params, body: req.body });
    const priceListId = parseInt(req.params.id, 10);
    const items = req.body.items || [];
    if (!Array.isArray(items) || items.length === 0) {
      console.error('[PriceListItems] No items provided:', req.body);
      return res.status(400).json({ error: 'No items provided' });
    }

    items.forEach(item => {
      try {
        // Skip products with missing or empty name
        if (!item.productName || typeof item.productName !== 'string' || item.productName.trim() === '') {
          console.warn('[PriceListItems] Skipping product with empty name:', item);
          return;
        }

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
        console.log('[PriceListItems] Computed product price:', price, 'for', item.productName);

        // Insert product if not exists
        let product = db.prepare('SELECT id FROM products WHERE name = ?').get(item.productName);
        if (!product) {
          const sql = 'INSERT INTO products (name, description, category, price) VALUES (?, ?, ?, ?)';
          const sqlArgs = [item.productName, item.description || '', item.category || 'Other', price];
          console.log('[PriceListItems] SQL:', sql, 'ARGS:', sqlArgs);
          const result = db.prepare(sql).run(...sqlArgs);
          product = { id: result.lastInsertRowid };
        }

        // Link product to price list if not already linked
        const exists = db.prepare('SELECT 1 FROM price_list_products WHERE price_list_id = ? AND product_id = ?')
          .get(priceListId, product.id);
        if (!exists) {
          db.prepare('INSERT INTO price_list_products (price_list_id, product_id) VALUES (?, ?)')
            .run(priceListId, product.id);
        }

        // Insert sizes for this product
        (item.sizes || []).forEach(size => {
          try {
            // Always use size.name if present, fallback to size.sizeName, always trim
            const rawName = (size.name !== undefined ? String(size.name) : '').trim();
            const rawSizeName = (size.sizeName !== undefined ? String(size.sizeName) : '').trim();
            const sizeName = rawName || rawSizeName;
            console.log('[PriceListItems] Checking size:', { size, rawName, rawSizeName, sizeName });
            if (!sizeName) {
              console.warn('[PriceListItems] Skipping size with empty name:', { size, rawName, rawSizeName });
              return;
            }
            // Default NULL or missing price/cost to 0
            const safePrice = (typeof size.price === 'number' && !isNaN(size.price)) ? size.price : 0;
            const safeCost = (typeof size.cost === 'number' && !isNaN(size.cost)) ? size.cost : 0;
            // Check if size exists for this product and price list
            const sizeExists = db.prepare('SELECT 1 FROM product_sizes WHERE product_id = ? AND price_list_id = ? AND size_name = ?')
              .get(product.id, priceListId, sizeName);
            if (!sizeExists) {
              db.prepare('INSERT INTO product_sizes (product_id, price_list_id, size_name, price, cost) VALUES (?, ?, ?, ?, ?)')
                .run(product.id, priceListId, sizeName, safePrice, safeCost);
              console.log('[PriceListItems] Inserted size:', { productId: product.id, priceListId, sizeName, safePrice, safeCost });
            }
          } catch (sizeError) {
            console.error('[PriceListItems] Error inserting size:', size, sizeError);
            throw sizeError;
          }
        });
      } catch (itemError) {
        console.error('[PriceListItems] Error processing item:', item, itemError);
        throw itemError;
      }
    });

    res.json({ message: 'Items added to price list' });
  } catch (error) {
    console.error('[PriceListItems] Unexpected error:', error, req.body);
    res.status(500).json({ error: error.message });
  }
});

export default router;
