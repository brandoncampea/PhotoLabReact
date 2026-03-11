import express from 'express';
import { queryRow, queryRows, query } from '../mssql.js';
import { adminRequired, superAdminRequired } from '../middleware/auth.js';
const router = express.Router();

const SIZE_DIMENSION_DELIMITER = '__';

const encodeSizeName = (name, width, height) => {
  const trimmedName = String(name || '').trim();
  const safeWidth = Number(width) || 0;
  const safeHeight = Number(height) || 0;
  if (safeWidth > 0 && safeHeight > 0) {
    return `${trimmedName}${SIZE_DIMENSION_DELIMITER}${safeWidth}x${safeHeight}`;
  }
  return trimmedName;
};

const decodeSizeName = (storedName) => {
  const raw = String(storedName || '');
  if (!raw.includes(SIZE_DIMENSION_DELIMITER)) {
    const matched = raw.match(/^(.*?)(?:\s*\(?([0-9.]+)x([0-9.]+)\)?)?$/i);
    if (!matched) {
      return { name: raw, width: 0, height: 0 };
    }
    const width = Number(matched[2]) || 0;
    const height = Number(matched[3]) || 0;
    return { name: matched[1].trim() || raw, width, height };
  }

  const [namePart, dimensionPart] = raw.split(SIZE_DIMENSION_DELIMITER);
  const [widthPart, heightPart] = String(dimensionPart || '').split('x');
  return {
    name: (namePart || raw).trim(),
    width: Number(widthPart) || 0,
    height: Number(heightPart) || 0,
  };
};

const parseProductOptions = (options) => {
  if (!options) return {};
  try {
    return typeof options === 'string' ? JSON.parse(options) : options;
  } catch {
    return {};
  }
};

// Get all price lists
router.get('/', adminRequired, async (req, res) => {
  try {
    const priceLists = await queryRows(`
      SELECT
        pl.id,
        pl.name,
        pl.description,
        pl.is_default as isDefault,
        pl.created_at as createdDate,
        COUNT(DISTINCT plp.product_id) as productCount
      FROM price_lists pl
      LEFT JOIN price_list_products plp ON pl.id = plp.price_list_id
      GROUP BY pl.id, pl.name, pl.description, pl.is_default, pl.created_at
      ORDER BY name ASC
    `);
    res.json(priceLists);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get price list by ID with all products and packages
router.get('/:id', adminRequired, async (req, res) => {
  try {
    const priceList = await queryRow(`
      SELECT id, name, description, is_default as isDefault, created_at as createdDate
      FROM price_lists
      WHERE id = $1
    `, [req.params.id]);
    
    if (!priceList) {
      return res.status(404).json({ error: 'Price list not found' });
    }

    // Get products for this price list
    const products = await queryRows(`
      SELECT DISTINCT p.id, p.name, p.category, p.price, p.description, p.cost, p.options
      FROM products p
      JOIN price_list_products plp ON p.id = plp.product_id
      WHERE plp.price_list_id = $1
    `, [req.params.id]);

    // Get product sizes for this price list
    const productSizes = await queryRows(`
      SELECT id, product_id as productId, size_name as sizeName, price, cost
      FROM product_sizes
      WHERE price_list_id = $1
    `, [req.params.id]);

    // Attach sizes to each product, mapping sizeName -> name
    const productsWithSizes = products.map(product => ({
      ...product,
      isDigital: !!parseProductOptions(product.options).isDigital,
      sizes: productSizes
        .filter(size => size.productId === product.id)
        .map(size => {
          const decoded = decodeSizeName(size.sizeName);
          return {
            ...size,
            name: decoded.name,
            width: decoded.width,
            height: decoded.height,
            ...(() => { const s = { ...size }; delete s.sizeName; return s; })()
          };
        })
    }));

    // Get packages for this price list
    const packages = await queryRows(`
      SELECT id, name, description, package_price as packagePrice, is_active as isActive, created_at as createdDate
      FROM packages
      WHERE price_list_id = $1
    `, [req.params.id]);

    // Get package items
    const packageItems = await queryRows(`
      SELECT id, package_id as packageId, product_id as productId, product_size_id as productSizeId, quantity
      FROM package_items
    `);

    priceList.products = productsWithSizes;
    // priceList.sizes = productSizes; // No longer needed by frontend
    priceList.packages = packages.map(pkg => ({
      ...pkg,
      items: packageItems.filter(item => item.packageId === pkg.id)
    }));

    res.json(priceList);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/products', superAdminRequired, async (req, res) => {
  try {
    const priceListId = Number(req.params.id);
    const { name, description, isDigital } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Product name is required' });
    }

    const options = { isDigital: !!isDigital };
    const result = await queryRow(
      `INSERT INTO products (name, category, price, description, options)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [String(name).trim(), 'General', 0, description || null, JSON.stringify(options)]
    );

    await query(
      `INSERT INTO price_list_products (price_list_id, product_id)
       VALUES ($1, $2)`,
      [priceListId, result.id]
    );

    const product = await queryRow('SELECT id, name, description, options FROM products WHERE id = $1', [result.id]);
    res.status(201).json({
      id: product.id,
      name: product.name,
      description: product.description,
      isDigital: !!parseProductOptions(product.options).isDigital,
      sizes: [],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/products/:productId', superAdminRequired, async (req, res) => {
  try {
    const { name, description, isDigital } = req.body;
    const existing = await queryRow('SELECT id, options FROM products WHERE id = $1', [req.params.productId]);
    if (!existing) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const currentOptions = parseProductOptions(existing.options);
    await query(
      `UPDATE products
       SET name = $1,
           description = $2,
           options = $3
       WHERE id = $4`,
      [
        String(name || '').trim(),
        description || null,
        JSON.stringify({ ...currentOptions, isDigital: !!isDigital }),
        req.params.productId,
      ]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id/products/:productId', superAdminRequired, async (req, res) => {
  try {
    await query('DELETE FROM price_list_products WHERE price_list_id = $1 AND product_id = $2', [req.params.id, req.params.productId]);
    await query('DELETE FROM product_sizes WHERE price_list_id = $1 AND product_id = $2', [req.params.id, req.params.productId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/products/:productId/sizes', superAdminRequired, async (req, res) => {
  try {
    const { name, width, height, price, cost } = req.body;
    const encodedName = encodeSizeName(name, width, height);
    const result = await queryRow(
      `INSERT INTO product_sizes (product_id, price_list_id, size_name, price, cost)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [req.params.productId, req.params.id, encodedName, Number(price) || 0, Number(cost) || 0]
    );

    res.status(201).json({
      id: result.id,
      productId: Number(req.params.productId),
      name: String(name || '').trim(),
      width: Number(width) || 0,
      height: Number(height) || 0,
      price: Number(price) || 0,
      cost: Number(cost) || 0,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/products/:productId/sizes/:sizeId', superAdminRequired, async (req, res) => {
  try {
    const { name, width, height, price, cost } = req.body;
    const encodedName = encodeSizeName(name, width, height);
    await query(
      `UPDATE product_sizes
       SET size_name = $1,
           price = $2,
           cost = $3
       WHERE id = $4 AND price_list_id = $5 AND product_id = $6`,
      [encodedName, Number(price) || 0, Number(cost) || 0, req.params.sizeId, req.params.id, req.params.productId]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id/products/:productId/sizes/:sizeId', superAdminRequired, async (req, res) => {
  try {
    await query(
      `DELETE FROM product_sizes
       WHERE id = $1 AND price_list_id = $2 AND product_id = $3`,
      [req.params.sizeId, req.params.id, req.params.productId]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create price list
router.post('/', superAdminRequired, async (req, res) => {
  try {
    const { name, description, isDefault } = req.body;
    
    // If isDefault is true, unset default on other price lists
    if (isDefault) {
      await query('UPDATE price_lists SET is_default = 0');
    }

    const result = await queryRow(`
      INSERT INTO price_lists (name, description, is_default)
      VALUES ($1, $2, $3)
      RETURNING id
    `, [name, description || null, !!isDefault]);

    const priceList = await queryRow(`
      SELECT id, name, description, is_default as isDefault, created_at as createdDate
      FROM price_lists
      WHERE id = $1
    `, [result.id]);

    res.status(201).json(priceList);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update price list
router.put('/:id', superAdminRequired, async (req, res) => {
  try {
    const { name, description, isDefault } = req.body;

    if (isDefault) {
      await query('UPDATE price_lists SET is_default = 0');
    }

    await query(`
      UPDATE price_lists
      SET name = $1, description = $2, is_default = $3
      WHERE id = $4
    `, [name, description || null, !!isDefault, req.params.id]);

    const priceList = await queryRow(`
      SELECT id, name, description, is_default as isDefault, created_at as createdDate
      FROM price_lists
      WHERE id = $1
    `, [req.params.id]);

    res.json(priceList);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Set default price list
router.post('/:id/setDefault', superAdminRequired, async (req, res) => {
  try {
    await query('UPDATE price_lists SET is_default = 0');
    await query('UPDATE price_lists SET is_default = 1 WHERE id = $1', [req.params.id]);

    const priceList = await queryRow(`
      SELECT id, name, description, is_default as isDefault, created_at as createdDate
      FROM price_lists
      WHERE id = $1
    `, [req.params.id]);

    res.json(priceList);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete price list
router.delete('/:id', superAdminRequired, async (req, res) => {
  try {
    await query('DELETE FROM price_lists WHERE id = $1', [req.params.id]);
    res.json({ message: 'Price list deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
