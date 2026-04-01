
import mssql from '../mssql.js';
// Super Admin Price List Routes
import express from 'express';
import multer from 'multer';
import { uploadImageBufferToAzure } from '../services/azureStorage.js';
const router = express.Router();

const categoryImageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const ensureCategoryImagesTable = async () => {
  try {
    await mssql.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'super_price_list_category_images')
      CREATE TABLE super_price_list_category_images (
        id INT IDENTITY(1,1) PRIMARY KEY,
        super_price_list_id INT NOT NULL,
        category_name NVARCHAR(255) NOT NULL,
        image_url NVARCHAR(2048),
        updated_at DATETIME DEFAULT GETDATE()
      )
    `);
  } catch (_) { /* table may already exist */ }
};

// POST import multiple products/sizes to super price list (no digital restriction)
router.post('/:id/import-items', async (req, res) => {
  const { id } = req.params;
  const items = req.body.items;
  console.log('[superPriceLists] import-items start', { listId: id, itemCount: Array.isArray(items) ? items.length : 0 });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items array required' });
  try {
    let importedCount = 0;
    let skippedCount = 0;
    const errorSamples = [];

    // Bridge price list for creating local product_sizes rows used by super price list items
    let bridgePriceListId = null;
    try {
      const bridge = await mssql.query("SELECT TOP 1 id FROM price_lists WHERE name = @p1 ORDER BY id ASC", ['WHCC Import Bridge']);
      bridgePriceListId = bridge[0]?.id || null;
      if (!bridgePriceListId) {
        await mssql.query('INSERT INTO price_lists (studio_id, name, description) VALUES (NULL, @p1, @p2)', ['WHCC Import Bridge', 'System bridge price list for WHCC imports']);
        const createdBridge = await mssql.query("SELECT TOP 1 id FROM price_lists WHERE name = @p1 ORDER BY id DESC", ['WHCC Import Bridge']);
        bridgePriceListId = createdBridge[0]?.id || null;
      }
    } catch (bridgeErr) {
      // If this fails, item-level error handling below will surface details.
    }

    for (const item of items) {
      try {
        let { product_size_id, base_cost, markup_percent } = item;
        let resolvedProductSizeId = Number(product_size_id || 0);

        // Extract WHCC product mapping fields supplied by the frontend import
        const whccProductUID = Number(item.whccProductUID || 0) || null;
        const whccProductNodeID = Number(item.whccProductNodeID || 0) || null;
        const rawAttrUIDs = Array.isArray(item.whccItemAttributeUIDs)
          ? item.whccItemAttributeUIDs.map(Number).filter(v => Number.isInteger(v) && v > 0)
          : null;
        // Build the options JSON that submitOrderToWhcc() will use to resolve correct WHCC IDs
        const whccOptionsJson = (whccProductUID || whccProductNodeID || (rawAttrUIDs && rawAttrUIDs.length))
          ? JSON.stringify({
              ...(whccProductUID ? { whccProductUID } : {}),
              ...(whccProductNodeID ? { whccProductNodeID } : {}),
              ...(rawAttrUIDs && rawAttrUIDs.length ? { whccItemAttributeUIDs: rawAttrUIDs } : {}),
            })
          : null;

        // If product_size_id is not a real local product_sizes.id, create local product + size for WHCC row.
        let sizeExists = [];
        if (resolvedProductSizeId > 0) {
          sizeExists = await mssql.query('SELECT TOP 1 id FROM product_sizes WHERE id = @p1', [resolvedProductSizeId]);
        }

        if (!sizeExists.length) {
          const productName = (item.product_name || item.name || item.display_name || `WHCC Product ${resolvedProductSizeId || ''}`).toString().trim();
          const sizeName = (item.size_name || item.size || productName).toString().trim();
          const category = (item.category || 'whcc').toString().trim();
          const description = (item.description || 'Imported from WHCC').toString();

          // Find or create product
          let productRows = await mssql.query('SELECT TOP 1 id FROM products WHERE name = @p1 AND category = @p2', [productName, category]);
          let productId = productRows[0]?.id;
          if (!productId) {
            // Try schema with price/cost first (MSSQL bootstrap table), then fallback schema with is_digital.
            try {
              await mssql.query(
                'INSERT INTO products (name, category, price, description, cost, options) VALUES (@p1, @p2, @p3, @p4, @p5, @p6)',
                [productName, category, Number(base_cost ?? 0), description, Number(base_cost ?? 0), whccOptionsJson]
              );
            } catch (insertErr1) {
              await mssql.query('INSERT INTO products (name, category, is_digital, description) VALUES (@p1, @p2, 0, @p3)', [productName, category, description]);
            }
            productRows = await mssql.query('SELECT TOP 1 id FROM products WHERE name = @p1 AND category = @p2 ORDER BY id DESC', [productName, category]);
            productId = productRows[0]?.id;
          } else if (whccOptionsJson) {
            // Product already exists — merge WHCC mapping into its options so order submission can find them
            try {
              const existingRows = await mssql.query('SELECT TOP 1 options FROM products WHERE id = @p1', [productId]);
              const existing = {};
              try { Object.assign(existing, JSON.parse(existingRows[0]?.options || '{}')); } catch (_) {}
              const merged = {
                ...existing,
                ...(whccProductUID ? { whccProductUID } : {}),
                ...(whccProductNodeID ? { whccProductNodeID } : {}),
                ...(rawAttrUIDs && rawAttrUIDs.length ? { whccItemAttributeUIDs: rawAttrUIDs } : {}),
              };
              await mssql.query('UPDATE products SET options = @p1 WHERE id = @p2', [JSON.stringify(merged), productId]);
            } catch (_) { /* non-fatal — catalog match will still work as fallback */ }
          }

          if (!productId) {
            skippedCount++;
            continue;
          }

          // Find or create product size (schema: product_sizes has price_list_id + size_name)
          let sizeRows = await mssql.query(
            'SELECT TOP 1 id FROM product_sizes WHERE price_list_id = @p1 AND product_id = @p2 AND size_name = @p3 ORDER BY id DESC',
            [bridgePriceListId, productId, sizeName]
          );
          if (!sizeRows.length) {
            await mssql.query(
              'INSERT INTO product_sizes (price_list_id, product_id, size_name, price, cost) VALUES (@p1, @p2, @p3, @p4, @p5)',
              [bridgePriceListId, productId, sizeName, Number(base_cost ?? 0), Number(base_cost ?? 0)]
            );
            sizeRows = await mssql.query(
              'SELECT TOP 1 id FROM product_sizes WHERE price_list_id = @p1 AND product_id = @p2 AND size_name = @p3 ORDER BY id DESC',
              [bridgePriceListId, productId, sizeName]
            );
          }
          resolvedProductSizeId = Number(sizeRows[0]?.id || 0);
        }

        if (!resolvedProductSizeId) {
          skippedCount++;
          continue;
        }

        // Upsert super price list item (avoid unique collisions)
        const existing = await mssql.query(
          'SELECT TOP 1 id FROM super_price_list_items WHERE super_price_list_id = @p1 AND product_size_id = @p2',
          [id, resolvedProductSizeId]
        );

        if (existing.length) {
          await mssql.query(
            'UPDATE super_price_list_items SET base_cost = @p1, markup_percent = @p2, is_active = 1 WHERE id = @p3',
            [base_cost ?? null, markup_percent ?? null, existing[0].id]
          );
        } else {
          await mssql.query(
            'INSERT INTO super_price_list_items (super_price_list_id, product_size_id, base_cost, markup_percent, is_active) VALUES (@p1, @p2, @p3, @p4, 1)',
            [id, resolvedProductSizeId, base_cost ?? null, markup_percent ?? null]
          );
        }

        importedCount++;
      } catch (itemErr) {
        skippedCount++;
        if (errorSamples.length < 10) {
          errorSamples.push({
            product_size_id: item?.product_size_id,
            product_name: item?.product_name,
            size_name: item?.size_name,
            error: itemErr?.originalError?.info?.message || itemErr?.message || String(itemErr),
          });
        }
      }
    }

    console.log('[superPriceLists] import-items done', { listId: id, importedCount, skippedCount });
    res.status(201).json({ success: true, importedCount, skippedCount, errorSamples });
  } catch (err) {
    res.status(500).json({ error: 'Failed to import items to super price list', details: err?.message || String(err) });
  }
});



// GET all super price lists
router.get('/', async (req, res) => {
  try {
    const lists = await mssql.query(`
      SELECT
        spl.id,
        spl.name,
        spl.description,
        spl.is_active AS isActive,
        COUNT(spi.id) AS productCount
      FROM super_price_lists spl
      LEFT JOIN super_price_list_items spi
        ON spi.super_price_list_id = spl.id
      GROUP BY spl.id, spl.name, spl.description, spl.is_active
      ORDER BY spl.name
    `);
    res.json(lists);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch super price lists' });
  }
});

// POST create new super price list
router.post('/', async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    await mssql.query('INSERT INTO super_price_lists (name, description, is_active) VALUES (@p1, @p2, 1)', [name, description || '']);
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create super price list' });
  }
});

// GET all items for a super price list
router.get('/:id/items', async (req, res) => {
  const { id } = req.params;
  try {
    const items = await mssql.query(`
      SELECT spi.id, spi.super_price_list_id, spi.product_size_id, spi.base_cost,
             spi.markup_percent, spi.is_active,
             ps.size_name, p.name as product_name, p.category as product_category
      FROM super_price_list_items spi
      LEFT JOIN product_sizes ps ON spi.product_size_id = ps.id
      LEFT JOIN products p ON ps.product_id = p.id
      WHERE spi.super_price_list_id = @p1
      ORDER BY p.category, p.name, ps.size_name
    `, [id]);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch super price list items' });
  }
});

// POST add product/size to super price list
router.post('/:id/items', async (req, res) => {
  const { id } = req.params;
  const { product_size_id, base_cost, markup_percent } = req.body;
  try {
    const forceDigitalOnly = req.body?.is_digital_only === true;
    let resolvedProductSizeId = Number(product_size_id || 0);

    // Check existing size id first
    let sizeExists = [];
    if (resolvedProductSizeId > 0) {
      sizeExists = await mssql.query('SELECT TOP 1 id FROM product_sizes WHERE id = @p1', [resolvedProductSizeId]);
    }

    // If missing/non-existent, allow manual creation via product/size fields
    if (!sizeExists.length) {
      const productName = (req.body.product_name || req.body.name || req.body.display_name || '').toString().trim();
      const sizeName = (req.body.size_name || req.body.size || '').toString().trim();
      const category = (req.body.category || (forceDigitalOnly ? 'Digital' : 'General')).toString().trim();
      const description = (req.body.description || (forceDigitalOnly ? 'Digital download product' : 'Added manually')).toString();

      if (!productName || !sizeName) {
        return res.status(400).json({ error: 'Provide valid product_size_id or product_name + size_name' });
      }

      // Ensure bridge price list exists (same approach as import endpoint)
      let bridgePriceListId = null;
      const bridge = await mssql.query("SELECT TOP 1 id FROM price_lists WHERE name = @p1 ORDER BY id ASC", ['WHCC Import Bridge']);
      bridgePriceListId = bridge[0]?.id || null;
      if (!bridgePriceListId) {
        await mssql.query('INSERT INTO price_lists (studio_id, name, description) VALUES (NULL, @p1, @p2)', ['WHCC Import Bridge', 'System bridge price list for imports/manual additions']);
        const createdBridge = await mssql.query("SELECT TOP 1 id FROM price_lists WHERE name = @p1 ORDER BY id DESC", ['WHCC Import Bridge']);
        bridgePriceListId = createdBridge[0]?.id || null;
      }

      // Find or create product
      let productRows = await mssql.query('SELECT TOP 1 id, options FROM products WHERE name = @p1 AND category = @p2', [productName, category]);
      let productId = productRows[0]?.id;
      if (!productId) {
        const optionsJson = JSON.stringify({ isDigital: forceDigitalOnly, isActive: true });
        try {
          await mssql.query(
            'INSERT INTO products (name, category, price, description, cost, options) VALUES (@p1, @p2, @p3, @p4, @p5, @p6)',
            [productName, category, Number(base_cost ?? 0), description, Number(base_cost ?? 0), optionsJson]
          );
        } catch (_) {
          await mssql.query('INSERT INTO products (name, category, is_digital, description) VALUES (@p1, @p2, @p3, @p4)', [productName, category, forceDigitalOnly ? 1 : 0, description]);
        }
        productRows = await mssql.query('SELECT TOP 1 id, options FROM products WHERE name = @p1 AND category = @p2 ORDER BY id DESC', [productName, category]);
        productId = productRows[0]?.id;
      } else if (forceDigitalOnly) {
        // Ensure existing product used by manual add is marked digital for checkout/lab routing
        let currentOptions = {};
        try {
          currentOptions = productRows[0]?.options ? JSON.parse(productRows[0].options) : {};
        } catch (_) {
          currentOptions = {};
        }
        await mssql.query('UPDATE products SET options = @p1 WHERE id = @p2', [JSON.stringify({ ...currentOptions, isDigital: true, isActive: currentOptions?.isActive !== false }), productId]);
      }

      if (!productId || !bridgePriceListId) {
        return res.status(400).json({ error: 'Unable to resolve product/size for manual add' });
      }

      // Find or create product size
      let sizeRows = await mssql.query(
        'SELECT TOP 1 id FROM product_sizes WHERE price_list_id = @p1 AND product_id = @p2 AND size_name = @p3 ORDER BY id DESC',
        [bridgePriceListId, productId, sizeName]
      );
      if (!sizeRows.length) {
        await mssql.query(
          'INSERT INTO product_sizes (price_list_id, product_id, size_name, price, cost) VALUES (@p1, @p2, @p3, @p4, @p5)',
          [bridgePriceListId, productId, sizeName, Number(base_cost ?? 0), Number(base_cost ?? 0)]
        );
        sizeRows = await mssql.query(
          'SELECT TOP 1 id FROM product_sizes WHERE price_list_id = @p1 AND product_id = @p2 AND size_name = @p3 ORDER BY id DESC',
          [bridgePriceListId, productId, sizeName]
        );
      }
      resolvedProductSizeId = Number(sizeRows[0]?.id || 0);
    }

    if (!resolvedProductSizeId) {
      return res.status(400).json({ error: 'Invalid product size' });
    }

    // Upsert into super price list
    const existing = await mssql.query(
      'SELECT TOP 1 id FROM super_price_list_items WHERE super_price_list_id = @p1 AND product_size_id = @p2',
      [id, resolvedProductSizeId]
    );
    if (existing.length) {
      await mssql.query(
        'UPDATE super_price_list_items SET base_cost = @p1, markup_percent = @p2, is_active = 1 WHERE id = @p3',
        [base_cost ?? null, markup_percent ?? null, existing[0].id]
      );
    } else {
      await mssql.query(
        'INSERT INTO super_price_list_items (super_price_list_id, product_size_id, base_cost, markup_percent, is_active) VALUES (@p1, @p2, @p3, @p4, 1)',
        [id, resolvedProductSizeId, base_cost ?? null, markup_percent ?? null]
      );
    }
    res.status(201).json({ success: true, product_size_id: resolvedProductSizeId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add item to super price list' });
  }
});

// PUT update product/size cost/markup/active in super price list
router.put('/:id/items/:itemId', async (req, res) => {
  const { itemId } = req.params;
  const { base_cost, markup_percent, is_active } = req.body;
  try {
    // Build dynamic SET to avoid overwriting fields not in payload
    const parts = [];
    const params = [];
    if (base_cost !== undefined) { params.push(base_cost); parts.push(`base_cost = @p${params.length}`); }
    if (markup_percent !== undefined) { params.push(markup_percent); parts.push(`markup_percent = @p${params.length}`); }
    if (is_active !== undefined) { params.push(is_active ? 1 : 0); parts.push(`is_active = @p${params.length}`); }
    if (!parts.length) return res.json({ success: true });
    params.push(itemId);
    await mssql.query(`UPDATE super_price_list_items SET ${parts.join(', ')} WHERE id = @p${params.length}`, params);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// PATCH bulk set is_active for a set of items
router.patch('/:id/items/bulk-active', async (req, res) => {
  const { item_ids, is_active } = req.body;
  if (!Array.isArray(item_ids) || !item_ids.length) return res.status(400).json({ error: 'item_ids required' });
  try {
    for (const itemId of item_ids) {
      await mssql.query('UPDATE super_price_list_items SET is_active = @p1 WHERE id = @p2', [is_active ? 1 : 0, itemId]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH apply markup_percent to all active items in a super price list
router.patch('/:id/bulk-markup', async (req, res) => {
  const { id } = req.params;
  const { markup_percent } = req.body;
  if (markup_percent === undefined || markup_percent === null) return res.status(400).json({ error: 'markup_percent required' });
  try {
    await mssql.query('UPDATE super_price_list_items SET markup_percent = @p1 WHERE super_price_list_id = @p2 AND is_active = 1', [Number(markup_percent), id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET category images for a price list
router.get('/:id/category-images', async (req, res) => {
  const { id } = req.params;
  await ensureCategoryImagesTable();
  try {
    const rows = await mssql.query('SELECT category_name, image_url FROM super_price_list_category_images WHERE super_price_list_id = @p1', [id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST upload/replace a category image
router.post('/:id/category-image', categoryImageUpload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { category_name } = req.body;
  if (!req.file || !category_name) return res.status(400).json({ error: 'image and category_name required' });
  await ensureCategoryImagesTable();
  try {
    const blobName = `price-list-categories/${id}/${Date.now()}-${req.file.originalname}`;
    const imageUrl = await uploadImageBufferToAzure(req.file.buffer, blobName, req.file.mimetype);
    const existing = await mssql.query('SELECT TOP 1 id FROM super_price_list_category_images WHERE super_price_list_id = @p1 AND category_name = @p2', [id, category_name]);
    if (existing.length) {
      await mssql.query('UPDATE super_price_list_category_images SET image_url = @p1, updated_at = GETDATE() WHERE super_price_list_id = @p2 AND category_name = @p3', [imageUrl, id, category_name]);
    } else {
      await mssql.query('INSERT INTO super_price_list_category_images (super_price_list_id, category_name, image_url) VALUES (@p1, @p2, @p3)', [id, category_name, imageUrl]);
    }
    res.json({ success: true, image_url: imageUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
