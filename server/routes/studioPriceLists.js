// Studio Admin Price List Routes
import express from 'express';
import mssql from '../mssql.js';
const router = express.Router();

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
  } catch (_) {}
};



// GET all studio price lists for a studio
router.get('/', async (req, res) => {
  const { studio_id } = req.query;
  if (!studio_id) return res.status(400).json({ error: 'studio_id required' });
  try {
    const lists = await mssql.query(`
      SELECT spl.*, sp.name AS super_price_list_name
      FROM studio_price_lists spl
      LEFT JOIN super_price_lists sp ON spl.super_price_list_id = sp.id
      WHERE spl.studio_id = @p1
      ORDER BY spl.name
    `, [studio_id]);
    res.json(lists);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch studio price lists' });
  }
});

// POST create new studio price list (copy from super)
router.post('/', async (req, res) => {
  const { studio_id, name, description, super_price_list_id } = req.body;
  if (!studio_id || !name || !super_price_list_id) return res.status(400).json({ error: 'studio_id, name, super_price_list_id required' });
  try {
    const superList = await mssql.query('SELECT TOP 1 id, is_active FROM super_price_lists WHERE id = @p1', [super_price_list_id]);
    if (!superList.length) {
      return res.status(400).json({ error: 'Selected super price list does not exist' });
    }

    await mssql.query('INSERT INTO studio_price_lists (studio_id, name, description, is_default, super_price_list_id) VALUES (@p1, @p2, @p3, 0, @p4)', [studio_id, name, description || '', super_price_list_id]);
    const studioPriceListIdResult = await mssql.query('SELECT id FROM studio_price_lists WHERE name = @p1 AND studio_id = @p2', [name, studio_id]);
    const studioPriceListId = studioPriceListIdResult[0]?.id;
    // Copy items from super price list
    const items = await mssql.query('SELECT product_size_id, base_cost FROM super_price_list_items WHERE super_price_list_id = @p1 AND is_active = 1', [super_price_list_id]);
    for (const item of items) {
      await mssql.query('INSERT INTO studio_price_list_items (studio_price_list_id, product_size_id, price, is_offered) VALUES (@p1, @p2, @p3, 1)', [studioPriceListId, item.product_size_id, item.base_cost]);
    }
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create studio price list' });
  }
});

    // const db = new Database(path.join(__dirname, '../campeaphotolab-test.db'));
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, is_default } = req.body;
  try {
    await mssql.query('UPDATE studio_price_lists SET name = COALESCE(@p1, name), description = COALESCE(@p2, description), is_default = COALESCE(@p3, is_default) WHERE id = @p4', [name, description, is_default, id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update studio price list' });
  }
});

// GET all items for a studio price list
router.get('/:id/items', async (req, res) => {
  const { id } = req.params;
  try {
    await ensureCategoryImagesTable();
    const header = await mssql.query('SELECT TOP 1 super_price_list_id FROM studio_price_lists WHERE id = @p1', [id]);
    const superPriceListId = header[0]?.super_price_list_id;
    if (!superPriceListId) {
      return res.status(404).json({ error: 'Studio price list not found' });
    }

    const items = await mssql.query(`
      SELECT spi.id,
             spi.studio_price_list_id,
             spi.product_size_id,
              ps.product_id,
             spi.price,
             spi.markup_percent,
             spi.is_offered,
             sspi.base_cost,
             ps.size_name,
             p.name as product_name,
             p.category as product_category,
             spci.image_url as category_image_url,
             sspi.is_active as source_is_active
      FROM studio_price_list_items spi
      JOIN super_price_list_items sspi
        ON sspi.product_size_id = spi.product_size_id
       AND sspi.super_price_list_id = @p2
       AND sspi.is_active = 1
      JOIN product_sizes ps ON spi.product_size_id = ps.id
      JOIN products p ON ps.product_id = p.id
      LEFT JOIN super_price_list_category_images spci
        ON spci.super_price_list_id = @p2
       AND spci.category_name = p.category
      WHERE spi.studio_price_list_id = @p1
      ORDER BY p.category, p.name, ps.size_name
    `, [id, superPriceListId]);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch studio price list items' });
  }
});

// POST add product/size to studio price list
router.post('/:id/items', async (req, res) => {
  const { id } = req.params;
  const { product_size_id, price, is_offered } = req.body;
  if (!product_size_id) return res.status(400).json({ error: 'product_size_id required' });
  try {
    const header = await mssql.query('SELECT TOP 1 super_price_list_id FROM studio_price_lists WHERE id = @p1', [id]);
    const superPriceListId = header[0]?.super_price_list_id;
    if (!superPriceListId) return res.status(404).json({ error: 'Studio price list not found' });

    const allowed = await mssql.query(
      'SELECT TOP 1 id, base_cost FROM super_price_list_items WHERE super_price_list_id = @p1 AND product_size_id = @p2 AND is_active = 1',
      [superPriceListId, product_size_id]
    );
    if (!allowed.length) {
      return res.status(400).json({ error: 'Only active products/sizes from the selected super price list can be offered' });
    }

    const existing = await mssql.query('SELECT TOP 1 id FROM studio_price_list_items WHERE studio_price_list_id = @p1 AND product_size_id = @p2', [id, product_size_id]);
    if (existing.length) {
      await mssql.query('UPDATE studio_price_list_items SET price = COALESCE(@p1, price), is_offered = COALESCE(@p2, is_offered) WHERE id = @p3', [price ?? null, is_offered === undefined ? null : (is_offered ? 1 : 0), existing[0].id]);
    } else {
      await mssql.query('INSERT INTO studio_price_list_items (studio_price_list_id, product_size_id, price, is_offered) VALUES (@p1, @p2, @p3, @p4)', [id, product_size_id, price ?? allowed[0].base_cost ?? null, is_offered === undefined ? 1 : (is_offered ? 1 : 0)]);
    }
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add item to studio price list' });
  }
});

// PUT update product/size price/markup in studio price list
router.put('/:id/items/:itemId', async (req, res) => {
  const { id } = req.params;
  const { itemId } = req.params;
  const { price, markup_percent, is_offered } = req.body;
  try {
    const header = await mssql.query('SELECT TOP 1 super_price_list_id FROM studio_price_lists WHERE id = @p1', [id]);
    const superPriceListId = header[0]?.super_price_list_id;
    if (!superPriceListId) return res.status(404).json({ error: 'Studio price list not found' });

    // Prevent offering inactive source rows
    if (is_offered === true) {
      const row = await mssql.query(`
        SELECT TOP 1 sspi.id
        FROM studio_price_list_items spi
        JOIN super_price_list_items sspi
          ON sspi.product_size_id = spi.product_size_id
         AND sspi.super_price_list_id = @p1
         AND sspi.is_active = 1
        WHERE spi.id = @p2
      `, [superPriceListId, itemId]);
      if (!row.length) {
        return res.status(400).json({ error: 'Cannot offer an inactive source product/size' });
      }
    }

    await mssql.query('UPDATE studio_price_list_items SET price = COALESCE(@p1, price), markup_percent = COALESCE(@p2, markup_percent), is_offered = COALESCE(@p3, is_offered) WHERE id = @p4', [price, markup_percent, is_offered === undefined ? null : (is_offered ? 1 : 0), itemId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// PATCH apply percentage markup to all currently offered items
router.patch('/:id/items/apply-markup', async (req, res) => {
  const { id } = req.params;
  const { markup_percent } = req.body;
  if (markup_percent === undefined || markup_percent === null) {
    return res.status(400).json({ error: 'markup_percent required' });
  }
  try {
    const header = await mssql.query('SELECT TOP 1 super_price_list_id FROM studio_price_lists WHERE id = @p1', [id]);
    const superPriceListId = header[0]?.super_price_list_id;
    if (!superPriceListId) return res.status(404).json({ error: 'Studio price list not found' });

    const rows = await mssql.query(`
      SELECT spi.id, sspi.base_cost
      FROM studio_price_list_items spi
      JOIN super_price_list_items sspi
        ON sspi.product_size_id = spi.product_size_id
       AND sspi.super_price_list_id = @p1
       AND sspi.is_active = 1
      WHERE spi.studio_price_list_id = @p2
        AND spi.is_offered = 1
    `, [superPriceListId, id]);

    const pct = Number(markup_percent) || 0;
    for (const row of rows) {
      const base = Number(row.base_cost || 0);
      // Markup percent is treated as a direct multiplier percentage.
      // Example: 500% => 5.00x base cost (1.15 -> 5.75).
      const computed = Number((base * (pct / 100)).toFixed(2));
      await mssql.query(
        'UPDATE studio_price_list_items SET markup_percent = @p1, price = @p2 WHERE id = @p3',
        [pct, computed, row.id]
      );
    }

    res.json({ success: true, updated: rows.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to apply markup' });
  }
});

export default router;
