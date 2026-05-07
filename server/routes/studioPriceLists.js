// Studio Admin Price List Routes
import express from 'express';
import mssql from '../mssql.js';
const router = express.Router();

const parseJsonArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
};

const normalizePositiveIntArray = (values) => {
  const arr = Array.isArray(values) ? values : [];
  return arr
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v > 0);
};

const normalizeNullableMoney = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? Number(num.toFixed(2)) : null;
};

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

const ensureStudioProductPresentationColumns = async () => {
  try {
    await mssql.query(`
      IF COL_LENGTH('studio_price_list_items', 'is_recommended') IS NULL
        ALTER TABLE studio_price_list_items ADD is_recommended BIT NOT NULL CONSTRAINT df_spli_is_recommended DEFAULT(0);
      IF COL_LENGTH('studio_price_list_items', 'display_order') IS NULL
        ALTER TABLE studio_price_list_items ADD display_order INT NULL;
      IF COL_LENGTH('studio_price_list_items', 'whcc_variants_json') IS NULL
        ALTER TABLE studio_price_list_items ADD whcc_variants_json NVARCHAR(MAX) NULL;
    `);
  } catch (_) {}
};

const buildVariantKey = (variant = {}) => {
  const id = Number(variant?.id || 0);
  if (Number.isInteger(id) && id > 0) return `id:${id}`;
  const uid = Number(variant?.whccProductUID || 0);
  const attrs = normalizePositiveIntArray(variant?.whccItemAttributeUIDs || []);
  const name = String(variant?.displayName || '').trim().toLowerCase();
  return `uid:${uid}|attrs:${attrs.join('-')}|name:${name}`;
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
    await ensureStudioProductPresentationColumns();
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
    await ensureStudioProductPresentationColumns();
    const header = await mssql.query('SELECT TOP 1 super_price_list_id FROM studio_price_lists WHERE id = @p1', [id]);
    const superPriceListId = header[0]?.super_price_list_id;
    if (!superPriceListId) {
      return res.status(404).json({ error: 'Studio price list not found' });
    }

    // Backfill any active source items that were added to the super price list
    // after this studio list was initially created.
    const activeSourceItems = await mssql.query(
      'SELECT product_size_id, base_cost FROM super_price_list_items WHERE super_price_list_id = @p1 AND is_active = 1',
      [superPriceListId]
    );
    const existingStudioItems = await mssql.query(
      'SELECT product_size_id FROM studio_price_list_items WHERE studio_price_list_id = @p1',
      [id]
    );
    const existingSizeIds = new Set(existingStudioItems.map((row) => Number(row.product_size_id)).filter(Number.isFinite));
    for (const sourceItem of activeSourceItems) {
      const productSizeId = Number(sourceItem?.product_size_id);
      if (!Number.isFinite(productSizeId) || existingSizeIds.has(productSizeId)) continue;
      await mssql.query(
        'INSERT INTO studio_price_list_items (studio_price_list_id, product_size_id, price, is_offered) VALUES (@p1, @p2, @p3, 1)',
        [id, productSizeId, sourceItem?.base_cost ?? null]
      );
      existingSizeIds.add(productSizeId);
    }

    const items = await mssql.query(`
      SELECT spi.id,
             spi.studio_price_list_id,
             spi.product_size_id,
             ps.product_id,
             spi.price,
             spi.markup_percent,
             spi.is_offered,
              spi.is_recommended,
              spi.display_order,
             spi.whcc_variants_json,
               sspi.id as super_item_id,
             sspi.base_cost,
              sspi.markup_percent AS super_markup_percent,
               sspi.whcc_product_uid,
               sspi.whcc_product_node_id,
               sspi.whcc_item_attribute_uids,
               sspi.whcc_attribute_categories,
             ps.size_name,
             p.name as product_name,
             p.category as product_category,
                  p.options as product_options,
             p.image_url as product_image_url,
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
      ORDER BY COALESCE(spi.display_order, 2147483647), p.category, p.name, ps.size_name
    `, [id, superPriceListId]);

    const superItemIds = (items || [])
      .map((row) => Number(row?.super_item_id || 0))
      .filter((value) => Number.isInteger(value) && value > 0);

    const variantsBySuperItemId = new Map();
    if (superItemIds.length) {
      const placeholders = superItemIds.map((_, index) => `@p${index + 1}`).join(',');
      const variantRows = await mssql.query(`
        SELECT v.id,
               v.super_price_list_item_id,
               v.display_name,
               v.whcc_product_uid,
               v.whcc_product_node_ids,
               v.whcc_item_attribute_uids,
               v.base_cost,
               v.price,
               v.is_default,
               v.is_active
        FROM super_price_list_item_whcc_variants v
        WHERE v.super_price_list_item_id IN (${placeholders})
        ORDER BY v.super_price_list_item_id ASC, v.is_default DESC, v.id ASC
      `, superItemIds);

      for (const row of (variantRows || [])) {
        const superItemId = Number(row?.super_price_list_item_id || 0);
        if (!superItemId) continue;
        if (!variantsBySuperItemId.has(superItemId)) variantsBySuperItemId.set(superItemId, []);
        variantsBySuperItemId.get(superItemId).push({
          id: Number(row?.id || 0) || null,
          displayName: String(row?.display_name || ''),
          whccProductUID: Number(row?.whcc_product_uid || 0) || null,
          whccProductNodeIDs: normalizePositiveIntArray(parseJsonArray(row?.whcc_product_node_ids)),
          whccItemAttributeUIDs: normalizePositiveIntArray(parseJsonArray(row?.whcc_item_attribute_uids)),
          baseCost: normalizeNullableMoney(row?.base_cost),
          price: normalizeNullableMoney(row?.price),
          isDefault: Boolean(row?.is_default),
          isActive: Boolean(row?.is_active),
        });
      }
    }

    const normalized = (items || []).map((item) => {
      let options = {};
      try {
        options = item?.product_options
          ? (typeof item.product_options === 'string' ? JSON.parse(item.product_options) : item.product_options)
          : {};
      } catch (_) {
        options = {};
      }
      const digitalPricingMode = String(options?.digitalPricingMode ?? options?.digital_pricing_mode ?? '').trim().toLowerCase() === 'percentage'
        ? 'percentage'
        : 'fixed';
      const requestedPct = Number(options?.superAdminPercentage ?? options?.super_admin_percentage);
      const superAdminPercentage = Number.isFinite(requestedPct)
        ? Math.min(100, Math.max(0, requestedPct))
        : null;
      const digitalDownloadScope = String(options?.digitalDownloadScope ?? options?.digital_download_scope ?? options?.downloadScope ?? '').trim().toLowerCase() === 'album'
        ? 'album'
        : 'photo';
      const isDigital = options?.isDigital === true || options?.is_digital === true || String(item?.product_category || '').toLowerCase() === 'digital';

      const superItemId = Number(item?.super_item_id || 0);
      const persistedVariants = variantsBySuperItemId.get(superItemId) || [];
      const studioOverrideVariants = parseJsonArray(item?.whcc_variants_json)
        .map((variant) => ({
          ...variant,
          studioPrice: variant?.studioPrice === null || variant?.studioPrice === undefined || variant?.studioPrice === ''
            ? null
            : Number(variant.studioPrice),
          studioMarkupPercent: variant?.studioMarkupPercent === null || variant?.studioMarkupPercent === undefined || variant?.studioMarkupPercent === ''
            ? null
            : Number(variant.studioMarkupPercent),
        }))
        .filter((variant) => Number.isFinite(Number(variant?.studioPrice)) || Number.isFinite(Number(variant?.studioMarkupPercent)));
      const overridesByKey = new Map(studioOverrideVariants.map((variant) => [buildVariantKey(variant), variant]));
      const itemLevelAttrUids = normalizePositiveIntArray(parseJsonArray(item?.whcc_item_attribute_uids));
      const itemLevelCategories = parseJsonArray(item?.whcc_attribute_categories);
      const legacyUid = Number(item?.whcc_product_uid || options?.whccProductUID || 0) || null;
      const legacyNodeId = Number(item?.whcc_product_node_id || options?.whccProductNodeID || 0) || null;
      const fallbackVariants = legacyUid
        ? [{
            id: null,
            displayName: '',
            whccProductUID: legacyUid,
            whccProductNodeIDs: legacyNodeId ? [legacyNodeId] : [],
            whccItemAttributeUIDs: itemLevelAttrUids,
            baseCost: normalizeNullableMoney(item?.base_cost),
            price: null,
            isDefault: true,
            isActive: true,
          }]
        : [];
      const whccVariants = persistedVariants.length ? persistedVariants : fallbackVariants;
      const preferredVariant = whccVariants.find((variant) => variant?.isDefault && variant?.isActive)
        || whccVariants.find((variant) => variant?.isActive)
        || whccVariants.find((variant) => variant?.isDefault)
        || whccVariants[0]
        || null;
      const studioWhccVariants = whccVariants.map((variant) => {
        const matchedOverride = overridesByKey.get(buildVariantKey(variant));
        return {
          ...variant,
          studioPrice: Number.isFinite(Number(matchedOverride?.studioPrice))
            ? Number(Number(matchedOverride.studioPrice).toFixed(2))
            : null,
          studioMarkupPercent: Number.isFinite(Number(matchedOverride?.studioMarkupPercent))
            ? Number(Number(matchedOverride.studioMarkupPercent).toFixed(2))
            : null,
        };
      });

      return {
        ...item,
        is_digital: !!isDigital,
        digital_pricing_mode: digitalPricingMode,
        super_admin_percentage: superAdminPercentage,
        digital_download_scope: digitalDownloadScope,
        whccProductUID: preferredVariant?.whccProductUID || legacyUid || '',
        whccProductNodeID: (Array.isArray(preferredVariant?.whccProductNodeIDs) && preferredVariant.whccProductNodeIDs.length
          ? preferredVariant.whccProductNodeIDs[0]
          : (legacyNodeId || '')),
        whccItemAttributeUIDs: Array.isArray(preferredVariant?.whccItemAttributeUIDs) && preferredVariant.whccItemAttributeUIDs.length
          ? preferredVariant.whccItemAttributeUIDs
          : itemLevelAttrUids,
        whccAttributeCategories: itemLevelCategories.length ? itemLevelCategories : (Array.isArray(options?.whccAttributeCategories) ? options.whccAttributeCategories : []),
        whccVariants,
        studioWhccVariants,
      };
    });

    res.json(normalized);
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
    await ensureStudioProductPresentationColumns();
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
  const { price, markup_percent, is_offered, is_recommended, display_order, whccVariants } = req.body;
  try {
    await ensureStudioProductPresentationColumns();
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

    const normalizedVariants = Array.isArray(whccVariants)
      ? whccVariants
          .map((variant) => {
            const uid = Number(variant?.whccProductUID || 0);
            if (!Number.isInteger(uid) || uid <= 0) return null;
            const studioPrice = variant?.studioPrice === null || variant?.studioPrice === undefined || variant?.studioPrice === ''
              ? null
              : Number(variant.studioPrice);
            const studioMarkupPercent = variant?.studioMarkupPercent === null || variant?.studioMarkupPercent === undefined || variant?.studioMarkupPercent === ''
              ? null
              : Number(variant.studioMarkupPercent);
            return {
              id: Number(variant?.id || 0) || null,
              displayName: String(variant?.displayName || ''),
              whccProductUID: uid,
              whccItemAttributeUIDs: normalizePositiveIntArray(variant?.whccItemAttributeUIDs || []),
              studioPrice: Number.isFinite(studioPrice) ? Number(studioPrice.toFixed(2)) : null,
              studioMarkupPercent: Number.isFinite(studioMarkupPercent) ? Number(studioMarkupPercent.toFixed(2)) : null,
            };
          })
          .filter(Boolean)
      : null;

    await mssql.query(
      `UPDATE studio_price_list_items
       SET price = COALESCE(@p1, price),
           markup_percent = COALESCE(@p2, markup_percent),
           is_offered = COALESCE(@p3, is_offered),
           is_recommended = COALESCE(@p4, is_recommended),
           display_order = COALESCE(@p5, display_order),
           whcc_variants_json = COALESCE(@p6, whcc_variants_json)
       WHERE id = @p7`,
      [
        price,
        markup_percent,
        is_offered === undefined ? null : (is_offered ? 1 : 0),
        is_recommended === undefined ? null : (is_recommended ? 1 : 0),
        display_order === undefined || display_order === null || display_order === '' ? null : Number(display_order),
        normalizedVariants === null ? null : JSON.stringify(normalizedVariants),
        itemId,
      ]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// PUT update product-level recommended/order preferences (applies to all sizes)
router.put('/:id/products/:productId/preferences', async (req, res) => {
  const { id, productId } = req.params;
  const { is_recommended, display_order } = req.body;

  if (is_recommended === undefined && display_order === undefined) {
    return res.status(400).json({ error: 'Provide is_recommended or display_order' });
  }

  try {
    await ensureStudioProductPresentationColumns();

    const rows = await mssql.query(
      `SELECT spi.id
       FROM studio_price_list_items spi
       INNER JOIN product_sizes ps ON ps.id = spi.product_size_id
       WHERE spi.studio_price_list_id = @p1 AND ps.product_id = @p2`,
      [id, productId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Product not found in this studio price list' });
    }

    const normalizedOrder =
      display_order === undefined
        ? undefined
        : (display_order === null || display_order === '' ? null : Number(display_order));

    if (normalizedOrder !== undefined && normalizedOrder !== null && !Number.isFinite(normalizedOrder)) {
      return res.status(400).json({ error: 'display_order must be a valid number' });
    }

    await mssql.query(
      `UPDATE spi
       SET spi.is_recommended = COALESCE(@p1, spi.is_recommended),
           spi.display_order = CASE WHEN @p5 = 1 THEN @p2 ELSE spi.display_order END
       FROM studio_price_list_items spi
       INNER JOIN product_sizes ps ON ps.id = spi.product_size_id
       WHERE spi.studio_price_list_id = @p3
         AND ps.product_id = @p4`,
      [
        is_recommended === undefined ? null : (is_recommended ? 1 : 0),
        normalizedOrder,
        id,
        productId,
        normalizedOrder === undefined ? 0 : 1,
      ]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update product preferences' });
  }
});

// PUT bulk update product display order (applies to all sizes per product)
router.put('/:id/products/display-order', async (req, res) => {
  const { id } = req.params;
  const items = Array.isArray(req.body?.items) ? req.body.items : [];

  if (!items.length) {
    return res.status(400).json({ error: 'items array is required' });
  }

  try {
    await ensureStudioProductPresentationColumns();

    for (const item of items) {
      const productId = Number(item?.product_id || item?.productId || 0);
      const displayOrderRaw = item?.display_order ?? item?.displayOrder;
      const displayOrder = Number(displayOrderRaw);
      if (!Number.isInteger(productId) || productId <= 0) continue;
      if (!Number.isFinite(displayOrder)) continue;

      await mssql.query(
        `UPDATE spi
         SET spi.display_order = @p1
         FROM studio_price_list_items spi
         INNER JOIN product_sizes ps ON ps.id = spi.product_size_id
         WHERE spi.studio_price_list_id = @p2
           AND ps.product_id = @p3`,
        [Math.trunc(displayOrder), id, productId]
      );
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update display order' });
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
      SELECT spi.id,
             sspi.id AS super_item_id,
             sspi.base_cost,
             sspi.markup_percent
      FROM studio_price_list_items spi
      JOIN super_price_list_items sspi
        ON sspi.product_size_id = spi.product_size_id
       AND sspi.super_price_list_id = @p1
       AND sspi.is_active = 1
      WHERE spi.studio_price_list_id = @p2
        AND spi.is_offered = 1
    `, [superPriceListId, id]);

    const pct = Number(markup_percent) || 0;
    const superItemIds = Array.from(new Set(
      (rows || [])
        .map((row) => Number(row?.super_item_id || 0))
        .filter((value) => Number.isInteger(value) && value > 0)
    ));

    const variantsBySuperItemId = new Map();
    if (superItemIds.length > 0) {
      const placeholders = superItemIds.map((_, index) => `@p${index + 1}`).join(', ');
      const variantRows = await mssql.query(`
        SELECT v.super_price_list_item_id,
               v.id,
               v.display_name,
               v.whcc_product_uid,
               v.whcc_item_attribute_uids,
               v.base_cost,
               v.price,
               v.is_default,
               v.is_active
        FROM super_price_list_item_whcc_variants v
        WHERE v.super_price_list_item_id IN (${placeholders})
        ORDER BY v.super_price_list_item_id ASC, v.is_default DESC, v.id ASC
      `, superItemIds);

      for (const variant of (variantRows || [])) {
        const superItemId = Number(variant?.super_price_list_item_id || 0);
        if (!superItemId) continue;
        if (!variantsBySuperItemId.has(superItemId)) variantsBySuperItemId.set(superItemId, []);
        variantsBySuperItemId.get(superItemId).push({
          id: Number(variant?.id || 0) || null,
          displayName: String(variant?.display_name || ''),
          whccProductUID: Number(variant?.whcc_product_uid || 0) || null,
          whccItemAttributeUIDs: normalizePositiveIntArray(parseJsonArray(variant?.whcc_item_attribute_uids)),
          baseCost: normalizeNullableMoney(variant?.base_cost),
          price: normalizeNullableMoney(variant?.price),
          isDefault: Boolean(variant?.is_default),
          isActive: Boolean(variant?.is_active),
        });
      }
    }

    for (const row of rows) {
      const superItemId = Number(row?.super_item_id || 0);
      const persistedVariants = (variantsBySuperItemId.get(superItemId) || []).filter((variant) => variant?.isActive !== false);

      if (persistedVariants.length > 0) {
        const studioOverrides = persistedVariants
          .map((variant) => {
            const superCostSource = Number.isFinite(Number(variant?.price))
              ? Number(variant.price)
              : Number(variant?.baseCost);
            const superCost = Number.isFinite(superCostSource)
              ? Number(superCostSource.toFixed(2))
              : Number.isFinite(Number(row?.base_cost))
              ? Number(Number(row.base_cost).toFixed(2))
              : null;
            const studioPrice = Number.isFinite(Number(superCost))
              ? Number((Number(superCost) * (pct / 100)).toFixed(2))
              : null;

            return {
              id: variant?.id || null,
              displayName: String(variant?.displayName || ''),
              whccProductUID: Number(variant?.whccProductUID || 0) || null,
              whccItemAttributeUIDs: normalizePositiveIntArray(variant?.whccItemAttributeUIDs || []),
              studioPrice,
              studioMarkupPercent: Number(pct.toFixed(2)),
            };
          })
          .filter((variant) => Number.isFinite(Number(variant?.studioPrice)) || Number.isFinite(Number(variant?.studioMarkupPercent)));

        const defaultVariant = persistedVariants.find((variant) => variant?.isDefault && variant?.isActive)
          || persistedVariants.find((variant) => variant?.isActive)
          || persistedVariants[0]
          || null;
        const defaultKey = defaultVariant ? buildVariantKey(defaultVariant) : null;
        const overrideByKey = new Map(studioOverrides.map((variant) => [buildVariantKey(variant), variant]));
        const defaultStudioPrice = defaultKey && overrideByKey.has(defaultKey)
          ? Number(overrideByKey.get(defaultKey).studioPrice)
          : null;

        await mssql.query(
          'UPDATE studio_price_list_items SET markup_percent = @p1, price = COALESCE(@p2, price), whcc_variants_json = @p3 WHERE id = @p4',
          [pct, Number.isFinite(defaultStudioPrice) ? defaultStudioPrice : null, JSON.stringify(studioOverrides), row.id]
        );
        continue;
      }

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
