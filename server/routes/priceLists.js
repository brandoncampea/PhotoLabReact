import express from 'express';
import multer from 'multer';
import { queryRow, queryRows, query, tableExists, columnExists } from '../mssql.mjs';
import { adminRequired, superAdminRequired } from '../middleware/auth.js';
import { uploadImageBufferToAzure, deleteBlobByUrl } from '../services/azureStorage.js';
const router = express.Router();

const samplePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

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

const getStudioIdFromRequest = (req) => {
  const studioId = Number(req.user?.studio_id);
  return Number.isInteger(studioId) && studioId > 0 ? studioId : null;
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
    const studioId = getStudioIdFromRequest(req);
    const isStudioPricingView = req.user?.role === 'studio_admin' || (req.user?.role === 'super_admin' && Number(req.user?.acting_studio_id) > 0);
    const effectiveCostSelect = isStudioPricingView ? 'ps.price' : 'ps.cost';

    const priceList = await queryRow(`
      SELECT id, name, description, is_default as isDefault, created_at as createdDate
      FROM price_lists
      WHERE id = $1
    `, [req.params.id]);

    if (!priceList) {
      return res.status(404).json({ error: 'Price list not found' });
    }

    const [hasSamplePhotoUrl, hasStudioSizeOverrideTable, hasStudioSizeOverrideIsOffered] = await Promise.all([
      columnExists('products', 'sample_photo_url'),
      tableExists('studio_price_list_size_overrides'),
      columnExists('studio_price_list_size_overrides', 'is_offered'),
    ]);

    // Get products for this price list
    const products = await queryRows(`
      SELECT DISTINCT p.id, p.name, p.category, p.price, p.description, p.cost, p.options,
             ${hasSamplePhotoUrl ? 'p.sample_photo_url' : 'CAST(NULL AS NVARCHAR(MAX))'} as samplePhotoUrl
      FROM products p
      JOIN price_list_products plp ON p.id = plp.product_id
      WHERE plp.price_list_id = $1
    `, [req.params.id]);

    // Get product sizes for this price list, including studio-specific price overrides
    const productSizes = hasStudioSizeOverrideTable
      ? await queryRows(`
          SELECT
            ps.id,
            ps.product_id as productId,
            ps.size_name as sizeName,
            COALESCE(spsso.price, ps.price) as price,
            ps.price as basePrice,
            ${effectiveCostSelect} as cost,
            ${hasStudioSizeOverrideIsOffered ? 'COALESCE(spsso.is_offered, 1)' : 'CAST(1 AS BIT)'} as isOffered
          FROM product_sizes ps
          LEFT JOIN studio_price_list_size_overrides spsso
            ON spsso.product_size_id = ps.id
           AND spsso.price_list_id = ps.price_list_id
           AND spsso.studio_id = $2
          WHERE ps.price_list_id = $1
        `, [req.params.id, studioId])
      : await queryRows(`
          SELECT
            ps.id,
            ps.product_id as productId,
            ps.size_name as sizeName,
            ps.price as price,
            ps.price as basePrice,
            ${effectiveCostSelect} as cost,
            CAST(1 AS BIT) as isOffered
          FROM product_sizes ps
          WHERE ps.price_list_id = $1
        `, [req.params.id]);

    // Attach sizes to each product, mapping sizeName -> name
    const productsWithSizes = products.map((product) => {
      const productOptions = parseProductOptions(product.options);
      return {
        ...product,
        samplePhotoUrl: product.samplePhotoUrl || null,
        isDigital: !!productOptions.isDigital,
        isActive: productOptions.isActive !== undefined ? !!productOptions.isActive : true,
        popularity: Number(productOptions.popularity) || 0,
        sizes: productSizes
          .filter((size) => size.productId === product.id)
          .map((size) => {
            const decoded = decodeSizeName(size.sizeName);
            const { sizeName: _ignore, ...rest } = size;
            return {
              ...rest,
              name: decoded.name,
              width: decoded.width,
              height: decoded.height,
              isOffered: rest.isOffered === undefined || rest.isOffered === null ? true : !!rest.isOffered,
            };
          })
      };
    });

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
    priceList.packages = packages.map(pkg => ({
      ...pkg,
      items: packageItems.filter(item => item.packageId === pkg.id)
    }));

    res.json(priceList);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/studio-offerings', adminRequired, async (req, res) => {
  try {
    const studioId = getStudioIdFromRequest(req);
    if (!studioId) {
      return res.status(400).json({ error: 'Studio context is required' });
    }

    const priceListId = Number(req.params.id);
    if (!priceListId) {
      return res.status(400).json({ error: 'Invalid price list id' });
    }

    const products = await queryRows(
      `SELECT product_id as productId
       FROM price_list_products
       WHERE price_list_id = $1`,
      [priceListId]
    );

    const hidden = await queryRows(
      `SELECT product_id as productId
       FROM studio_price_list_offerings
       WHERE studio_id = $1
         AND price_list_id = $2
         AND is_offered = 0`,
      [studioId, priceListId]
    );

    const hiddenSet = new Set(hidden.map((row) => Number(row.productId)));
    const offeredProductIds = products
      .map((row) => Number(row.productId))
      .filter((productId) => !hiddenSet.has(productId));

    res.json({ offeredProductIds });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/studio-offerings', adminRequired, async (req, res) => {
  try {
    const studioId = getStudioIdFromRequest(req);
    if (!studioId) {
      return res.status(400).json({ error: 'Studio context is required' });
    }

    const priceListId = Number(req.params.id);
    if (!priceListId) {
      return res.status(400).json({ error: 'Invalid price list id' });
    }

    const offeredProductIdsInput = Array.isArray(req.body?.offeredProductIds)
      ? req.body.offeredProductIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
      : [];

    const priceListProducts = await queryRows(
      `SELECT product_id as productId
       FROM price_list_products
       WHERE price_list_id = $1`,
      [priceListId]
    );

    const validProductIds = priceListProducts.map((row) => Number(row.productId));
    const validSet = new Set(validProductIds);

    const invalidProductIds = offeredProductIdsInput.filter((id) => !validSet.has(id));
    if (invalidProductIds.length > 0) {
      return res.status(400).json({ error: 'One or more selected products are not in this price list' });
    }

    const offeredSet = new Set(offeredProductIdsInput);
    const hiddenProductIds = validProductIds.filter((id) => !offeredSet.has(id));

    await query(
      `DELETE FROM studio_price_list_offerings
       WHERE studio_id = $1 AND price_list_id = $2`,
      [studioId, priceListId]
    );

    for (const productId of hiddenProductIds) {
      await query(
        `INSERT INTO studio_price_list_offerings (studio_id, price_list_id, product_id, is_offered)
         VALUES ($1, $2, $3, 0)`,
        [studioId, priceListId, productId]
      );
    }

    const offeredProductIds = validProductIds.filter((id) => !hiddenProductIds.includes(id));
    res.json({ offeredProductIds });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/studio-products/:productId/sizes/:sizeId/price', adminRequired, async (req, res) => {
  try {
    const studioId = getStudioIdFromRequest(req);
    if (!studioId) {
      return res.status(400).json({ error: 'Studio context is required' });
    }

    const priceListId = Number(req.params.id);
    const productId = Number(req.params.productId);
    const sizeId = Number(req.params.sizeId);

    if (!priceListId || !productId || !sizeId) {
      return res.status(400).json({ error: 'Invalid price list/product/size id' });
    }

    const size = await queryRow(
      `SELECT id, price FROM product_sizes
       WHERE id = $1 AND price_list_id = $2 AND product_id = $3`,
      [sizeId, priceListId, productId]
    );

    if (!size) {
      return res.status(404).json({ error: 'Product size not found in this price list' });
    }

    // Get existing override (if any) to preserve fields not being updated
    const existing = await queryRow(
      `SELECT price, is_offered FROM studio_price_list_size_overrides
       WHERE studio_id = $1 AND price_list_id = $2 AND product_size_id = $3`,
      [studioId, priceListId, sizeId]
    );

    let finalPrice = existing ? Number(existing.price) : Number(size.price);
    let finalIsOffered = existing ? (existing.is_offered !== 0 && existing.is_offered !== false) : true;

    if (req.body.price !== undefined) {
      const price = Number(req.body.price);
      if (!Number.isFinite(price) || price < 0) {
        return res.status(400).json({ error: 'Price must be a non-negative number' });
      }
      finalPrice = price;
    }

    if (req.body.isOffered !== undefined) {
      finalIsOffered = !!req.body.isOffered;
    }

    await query(
      `IF EXISTS (
         SELECT 1
         FROM studio_price_list_size_overrides
         WHERE studio_id = $1 AND price_list_id = $2 AND product_size_id = $3
       )
       BEGIN
         UPDATE studio_price_list_size_overrides
         SET price = $4,
             product_id = $5,
             is_offered = $6,
             updated_at = CURRENT_TIMESTAMP
         WHERE studio_id = $1 AND price_list_id = $2 AND product_size_id = $3
       END
       ELSE
       BEGIN
         INSERT INTO studio_price_list_size_overrides (studio_id, price_list_id, product_id, product_size_id, price, is_offered)
         VALUES ($1, $2, $5, $3, $4, $6)
       END`,
      [studioId, priceListId, sizeId, finalPrice, productId, finalIsOffered ? 1 : 0]
    );

    res.json({ success: true, price: finalPrice, isOffered: finalIsOffered });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/studio-products/batch-price', adminRequired, async (req, res) => {
  try {
    const studioId = getStudioIdFromRequest(req);
    if (!studioId) {
      return res.status(400).json({ error: 'Studio context is required' });
    }

    const priceListId = Number(req.params.id);
    const percentage = Number(req.body?.percentage);

    if (!priceListId) {
      return res.status(400).json({ error: 'Invalid price list id' });
    }

    if (!Number.isFinite(percentage) || percentage < 0) {
      return res.status(400).json({ error: 'Percentage must be a non-negative number' });
    }

    const multiplier = percentage / 100;

    const sizes = await queryRows(
      `SELECT ps.id, ps.product_id as productId, ps.price as basePrice
       FROM product_sizes ps
       INNER JOIN price_list_products plp ON plp.product_id = ps.product_id AND plp.price_list_id = ps.price_list_id
       WHERE ps.price_list_id = $1`,
      [priceListId]
    );

    for (const size of sizes) {
      const sizeId = Number(size.id);
      const productId = Number(size.productId);
      const basePrice = Number(size.basePrice) || 0;
      const finalPrice = Number((basePrice * multiplier).toFixed(2));

      const existing = await queryRow(
        `SELECT is_offered FROM studio_price_list_size_overrides
         WHERE studio_id = $1 AND price_list_id = $2 AND product_size_id = $3`,
        [studioId, priceListId, sizeId]
      );

      const finalIsOffered = existing ? (existing.is_offered !== 0 && existing.is_offered !== false) : true;

      await query(
        `IF EXISTS (
           SELECT 1
           FROM studio_price_list_size_overrides
           WHERE studio_id = $1 AND price_list_id = $2 AND product_size_id = $3
         )
         BEGIN
           UPDATE studio_price_list_size_overrides
           SET price = $4,
               product_id = $5,
               is_offered = $6,
               updated_at = CURRENT_TIMESTAMP
           WHERE studio_id = $1 AND price_list_id = $2 AND product_size_id = $3
         END
         ELSE
         BEGIN
           INSERT INTO studio_price_list_size_overrides (studio_id, price_list_id, product_id, product_size_id, price, is_offered)
           VALUES ($1, $2, $5, $3, $4, $6)
         END`,
        [studioId, priceListId, sizeId, finalPrice, productId, finalIsOffered ? 1 : 0]
      );
    }

    res.json({ success: true, updatedCount: sizes.length, percentage });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/products/:productId/sample-photo', superAdminRequired, (req, res, next) => {
  samplePhotoUpload.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload error' });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const productId = Number(req.params.productId);
    if (!productId) return res.status(400).json({ error: 'Invalid product id' });

    // Delete existing sample photo from Azure if present
    const existing = await queryRow('SELECT sample_photo_url FROM products WHERE id = $1', [productId]);
    if (existing?.sample_photo_url) {
      await deleteBlobByUrl(existing.sample_photo_url).catch(() => {});
    }

    const blobName = `product-samples/${productId}/${Date.now()}-${req.file.originalname}`;
    const photoUrl = await uploadImageBufferToAzure(req.file.buffer, blobName, req.file.mimetype);

    await query('UPDATE products SET sample_photo_url = $1 WHERE id = $2', [photoUrl, productId]);

    res.json({ samplePhotoUrl: photoUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id/products/:productId/sample-photo', superAdminRequired, async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    if (!productId) return res.status(400).json({ error: 'Invalid product id' });

    const existing = await queryRow('SELECT sample_photo_url FROM products WHERE id = $1', [productId]);
    if (existing?.sample_photo_url) {
      await deleteBlobByUrl(existing.sample_photo_url).catch(() => {});
    }

    await query('UPDATE products SET sample_photo_url = NULL WHERE id = $1', [productId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/products', superAdminRequired, async (req, res) => {
  try {
    const priceListId = Number(req.params.id);
    const { name, description, isDigital, category, basePrice, cost, isActive, popularity } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Product name is required' });
    }

    const options = {
      isDigital: !!isDigital,
      isActive: isActive === undefined ? true : !!isActive,
      popularity: Number(popularity) || 0,
    };
    const result = await queryRow(
      `INSERT INTO products (name, category, price, description, options)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        String(name).trim(),
        String(category || 'General').trim() || 'General',
        Number(basePrice) || 0,
        description || null,
        JSON.stringify(options),
      ]
    );

    if (cost !== undefined) {
      await query(`UPDATE products SET cost = $1 WHERE id = $2`, [Number(cost) || 0, result.id]);
    }

    await query(
      `INSERT INTO price_list_products (price_list_id, product_id)
       VALUES ($1, $2)`,
      [priceListId, result.id]
    );

    const product = await queryRow('SELECT id, name, description, category, price, cost, options FROM products WHERE id = $1', [result.id]);
    const productOptions = parseProductOptions(product.options);
    res.status(201).json({
      id: product.id,
      name: product.name,
      description: product.description,
      category: product.category,
      price: Number(product.price) || 0,
      cost: Number(product.cost) || 0,
      samplePhotoUrl: product.sample_photo_url || null,
      isDigital: !!productOptions.isDigital,
      isActive: productOptions.isActive !== undefined ? !!productOptions.isActive : true,
      popularity: Number(productOptions.popularity) || 0,
      sizes: [],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/products/:productId', superAdminRequired, async (req, res) => {
  try {
    const { name, description, isDigital, category, basePrice, cost, isActive, popularity } = req.body;
    const existing = await queryRow('SELECT id, options FROM products WHERE id = $1', [req.params.productId]);
    if (!existing) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const currentOptions = parseProductOptions(existing.options);
    await query(
      `UPDATE products
       SET name = $1,
           description = $2,
           category = $3,
           price = $4,
           cost = $5,
           options = $6
       WHERE id = $7`,
      [
        String(name || '').trim(),
        description || null,
        String(category || 'General').trim() || 'General',
        Number(basePrice) || 0,
        Number(cost) || 0,
        JSON.stringify({
          ...currentOptions,
          isDigital: !!isDigital,
          isActive: isActive === undefined ? (currentOptions.isActive !== undefined ? !!currentOptions.isActive : true) : !!isActive,
          popularity: popularity === undefined ? Number(currentOptions.popularity) || 0 : Number(popularity) || 0,
        }),
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
