
import mssql from '../mssql.js';
// Super Admin Price List Routes
import express from 'express';
import multer from 'multer';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { uploadImageBufferToAzure } from '../services/azureStorage.js';
import { superAdminRequired } from '../middleware/auth.js';
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

const mergeMissingWhccOptions = (optionsJson, { whccProductUID, whccProductNodeID, rawAttrUIDs }) => {
  let existing = {};
  try {
    existing = optionsJson ? JSON.parse(optionsJson) : {};
  } catch (_) {
    existing = {};
  }

  const next = { ...existing };
  let changed = false;

  if (whccProductUID && !(Number(existing?.whccProductUID) > 0)) {
    next.whccProductUID = whccProductUID;
    changed = true;
  }
  if (whccProductNodeID && !(Number(existing?.whccProductNodeID) > 0)) {
    next.whccProductNodeID = whccProductNodeID;
    changed = true;
  }
  if (rawAttrUIDs && rawAttrUIDs.length && !(Array.isArray(existing?.whccItemAttributeUIDs) && existing.whccItemAttributeUIDs.length)) {
    next.whccItemAttributeUIDs = rawAttrUIDs;
    changed = true;
  }

  return { changed, json: JSON.stringify(next) };
};

const parseCsvLine = (line) => {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
};

const loadWhccCsvCostMap = async () => {
  const csvPath = path.resolve(process.cwd(), 'whcc_all_products_full.csv');
  const raw = await readFile(csvPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return new Map();

  const header = parseCsvLine(lines[0]).map((h) => String(h || '').trim().toLowerCase());
  const codeIdx = header.indexOf('product code');
  const priceIdx = header.indexOf('price');
  if (codeIdx < 0 || priceIdx < 0) {
    throw new Error('CSV missing required headers: Product Code, Price');
  }

  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const code = Number(cols[codeIdx]);
    const price = Number(cols[priceIdx]);
    if (Number.isInteger(code) && Number.isFinite(price)) {
      map.set(code, price);
    }
  }
  return map;
};

// POST import multiple products/sizes to super price list (no digital restriction)
router.post('/:id/import-items', async (req, res) => {
  const { id } = req.params;
  const items = req.body.items;
  console.log('[superPriceLists] import-items start', { listId: id, itemCount: Array.isArray(items) ? items.length : 0 });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items array required' });
  try {
    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const errorSamples = [];

    // Fetch linked studio price list IDs once — used to propagate new/updated items
    const linkedStudioRows = await mssql.query('SELECT id FROM studio_price_lists WHERE super_price_list_id = @p1', [id]);
    const linkedStudioIds = linkedStudioRows.map(r => Number(r.id)).filter(v => Number.isInteger(v) && v > 0);

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
        const productName = (item.product_name || item.name || item.display_name || `WHCC Product ${resolvedProductSizeId || ''}`).toString().trim();
        const sizeName = (item.size_name || item.size || productName).toString().trim();
        const category = (item.category || 'whcc').toString().trim();
        const description = (item.description || 'Imported from WHCC').toString();

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

        // If product_size_id is not a real local product_sizes.id, first try to match an existing list row by product/category/size.
        let sizeExists = [];
        if (resolvedProductSizeId > 0) {
          sizeExists = await mssql.query('SELECT TOP 1 id FROM product_sizes WHERE id = @p1', [resolvedProductSizeId]);
        }

        if (!sizeExists.length && productName && sizeName) {
          const matchedExistingRow = await mssql.query(`
            SELECT TOP 1 spi.product_size_id, p.id AS product_id, p.options AS product_options
            FROM super_price_list_items spi
            JOIN product_sizes ps ON spi.product_size_id = ps.id
            JOIN products p ON ps.product_id = p.id
            WHERE spi.super_price_list_id = @p1
              AND LOWER(LTRIM(RTRIM(p.name))) = LOWER(LTRIM(RTRIM(@p2)))
              AND LOWER(LTRIM(RTRIM(ps.size_name))) = LOWER(LTRIM(RTRIM(@p3)))
              AND LOWER(LTRIM(RTRIM(p.category))) = LOWER(LTRIM(RTRIM(@p4)))
            ORDER BY spi.id
          `, [id, productName, sizeName, category]);

          if (matchedExistingRow.length) {
            resolvedProductSizeId = Number(matchedExistingRow[0].product_size_id || 0);
            if (matchedExistingRow[0]?.product_id && whccOptionsJson) {
              const mergedOptions = mergeMissingWhccOptions(matchedExistingRow[0]?.product_options, { whccProductUID, whccProductNodeID, rawAttrUIDs });
              if (mergedOptions.changed) {
                await mssql.query('UPDATE products SET options = @p1 WHERE id = @p2', [mergedOptions.json, matchedExistingRow[0].product_id]);
              }
            }
          }
        }

        if (!sizeExists.length && !resolvedProductSizeId) {
          // Find or create product
          let productRows = await mssql.query('SELECT TOP 1 id, options FROM products WHERE name = @p1 AND category = @p2', [productName, category]);
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
            productRows = await mssql.query('SELECT TOP 1 id, options FROM products WHERE name = @p1 AND category = @p2 ORDER BY id DESC', [productName, category]);
            productId = productRows[0]?.id;
          }

          if (productId && whccOptionsJson) {
            try {
              const mergedOptions = mergeMissingWhccOptions(productRows[0]?.options, { whccProductUID, whccProductNodeID, rawAttrUIDs });
              if (mergedOptions.changed) {
                await mssql.query('UPDATE products SET options = @p1 WHERE id = @p2', [mergedOptions.json, productId]);
              }
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

        // Upsert super price list item but only fill missing information on existing rows.
        const existing = await mssql.query(`
          SELECT TOP 1 spi.id, spi.base_cost, spi.markup_percent, spi.is_active, p.id AS product_id, p.options AS product_options
          FROM super_price_list_items spi
          JOIN product_sizes ps ON spi.product_size_id = ps.id
          JOIN products p ON ps.product_id = p.id
          WHERE spi.super_price_list_id = @p1 AND spi.product_size_id = @p2
        `, [id, resolvedProductSizeId]);

        if (existing.length) {
          const updateParts = [];
          const updateParams = [];
          if ((existing[0].base_cost === null || existing[0].base_cost === undefined) && base_cost !== null && base_cost !== undefined) {
            updateParams.push(base_cost);
            updateParts.push(`base_cost = @p${updateParams.length}`);
          }
          if ((existing[0].markup_percent === null || existing[0].markup_percent === undefined) && markup_percent !== null && markup_percent !== undefined) {
            updateParams.push(markup_percent);
            updateParts.push(`markup_percent = @p${updateParams.length}`);
          }

          let optionsChanged = false;
          if (existing[0]?.product_id && whccOptionsJson) {
            const mergedOptions = mergeMissingWhccOptions(existing[0]?.product_options, { whccProductUID, whccProductNodeID, rawAttrUIDs });
            if (mergedOptions.changed) {
              await mssql.query('UPDATE products SET options = @p1 WHERE id = @p2', [mergedOptions.json, existing[0].product_id]);
              optionsChanged = true;
            }
          }

          if (updateParts.length) {
            updateParams.push(existing[0].id);
            await mssql.query(`UPDATE super_price_list_items SET ${updateParts.join(', ')} WHERE id = @p${updateParams.length}`, updateParams);
            // Propagate base_cost fill-in to linked studio items that still have no price set
            if (base_cost !== null && base_cost !== undefined && linkedStudioIds.length) {
              for (const studioListId of linkedStudioIds) {
                await mssql.query(
                  'UPDATE studio_price_list_items SET price = @p1 WHERE studio_price_list_id = @p2 AND product_size_id = @p3 AND price IS NULL',
                  [base_cost, studioListId, resolvedProductSizeId]
                );
              }
            }
          }

          if (updateParts.length || optionsChanged) updatedCount++;
          else skippedCount++;
        } else {
          await mssql.query(
            'INSERT INTO super_price_list_items (super_price_list_id, product_size_id, base_cost, markup_percent, is_active) VALUES (@p1, @p2, @p3, @p4, 1)',
            [id, resolvedProductSizeId, base_cost ?? null, markup_percent ?? null]
          );
          importedCount++;
          // Propagate new item to each linked studio price list (skip if already present)
          if (linkedStudioIds.length) {
            for (const studioListId of linkedStudioIds) {
              const alreadyPresent = await mssql.query(
                'SELECT TOP 1 id FROM studio_price_list_items WHERE studio_price_list_id = @p1 AND product_size_id = @p2',
                [studioListId, resolvedProductSizeId]
              );
              if (!alreadyPresent.length) {
                await mssql.query(
                  'INSERT INTO studio_price_list_items (studio_price_list_id, product_size_id, price, is_offered) VALUES (@p1, @p2, @p3, 1)',
                  [studioListId, resolvedProductSizeId, base_cost ?? null]
                );
              }
            }
          }
        }
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

    console.log('[superPriceLists] import-items done', { listId: id, importedCount, updatedCount, skippedCount });
    res.status(201).json({ success: true, importedCount, updatedCount, skippedCount, errorSamples });
  } catch (err) {
    res.status(500).json({ error: 'Failed to import items to super price list', details: err?.message || String(err) });
  }
});

// POST sync costs from whcc_all_products_full.csv based on stored WHCC IDs
router.post('/:id/sync-whcc-costs', superAdminRequired, async (req, res) => {
  const { id } = req.params;
  try {
    const onlyIfZero = req.body?.onlyIfZero !== false;
    const csvCostMap = await loadWhccCsvCostMap();
    if (!csvCostMap.size) {
      return res.status(400).json({ error: 'No WHCC cost rows found in whcc_all_products_full.csv' });
    }

    const linkedStudioRows = await mssql.query('SELECT id FROM studio_price_lists WHERE super_price_list_id = @p1', [id]);
    const linkedStudioIds = linkedStudioRows.map(r => Number(r.id)).filter(v => Number.isInteger(v) && v > 0);

    const rows = await mssql.query(`
      SELECT spi.id, spi.product_size_id, spi.base_cost, p.options AS product_options
      FROM super_price_list_items spi
      JOIN product_sizes ps ON spi.product_size_id = ps.id
      JOIN products p ON ps.product_id = p.id
      WHERE spi.super_price_list_id = @p1
    `, [id]);

    let updatedCount = 0;
    let unchangedCount = 0;
    let unmatchedCount = 0;
    let skippedNonZeroCount = 0;

    for (const row of rows) {
      let options = {};
      try {
        options = row.product_options ? JSON.parse(row.product_options) : {};
      } catch (_) {
        options = {};
      }

      const whccUid = Number(options?.whccProductUID ?? options?.productUID ?? 0) || 0;
      const whccNode = Number(options?.whccProductNodeID ?? options?.productNodeID ?? 0) || 0;
      const candidateIds = [whccUid, whccNode].filter((v) => Number.isInteger(v) && v > 0);

      let matchedPrice = null;
      for (const candidate of candidateIds) {
        if (csvCostMap.has(candidate)) {
          matchedPrice = Number(csvCostMap.get(candidate));
          break;
        }
      }

      if (!Number.isFinite(matchedPrice)) {
        unmatchedCount++;
        continue;
      }

      const currentCost = row.base_cost === null || row.base_cost === undefined ? null : Number(row.base_cost);

      if (onlyIfZero && currentCost !== null && Number.isFinite(currentCost) && Math.abs(currentCost) > 0.0001) {
        skippedNonZeroCount++;
        continue;
      }

      if (currentCost !== null && Math.abs(currentCost - matchedPrice) < 0.0001) {
        unchangedCount++;
        continue;
      }

      await mssql.query('UPDATE super_price_list_items SET base_cost = @p1 WHERE id = @p2', [matchedPrice, row.id]);
      await mssql.query('UPDATE product_sizes SET cost = @p1 WHERE id = @p2', [matchedPrice, row.product_size_id]);

      // Propagate to linked studio lists only when the price appears inherited/unset.
      for (const studioListId of linkedStudioIds) {
        if (onlyIfZero) {
          await mssql.query(
            `UPDATE studio_price_list_items
             SET price = @p1
             WHERE studio_price_list_id = @p2
               AND product_size_id = @p3
               AND (price IS NULL OR ABS(price) < 0.0001)`,
            [matchedPrice, studioListId, row.product_size_id]
          );
        } else {
          await mssql.query(
            `UPDATE studio_price_list_items
             SET price = @p1
             WHERE studio_price_list_id = @p2
               AND product_size_id = @p3
               AND (
                 price IS NULL
                 OR (@p4 IS NOT NULL AND ABS(price - @p4) < 0.0001)
               )`,
            [matchedPrice, studioListId, row.product_size_id, currentCost]
          );
        }
      }

      updatedCount++;
    }

    res.json({
      success: true,
      onlyIfZero,
      updatedCount,
      unchangedCount,
      unmatchedCount,
      skippedNonZeroCount,
      totalRows: rows.length,
      csvRows: csvCostMap.size,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to sync WHCC costs', details: err?.message || String(err) });
  }
});

// POST fill missing WHCC node IDs from live WHCC catalog for products in this super price list
router.post('/:id/fill-missing-whcc-node-ids', superAdminRequired, async (req, res) => {
  const { id } = req.params;
  try {
    const consumerKey = String(process.env.WHCC_CONSUMER_KEY || '').trim();
    const consumerSecret = String(process.env.WHCC_CONSUMER_SECRET || '').trim();
    const isSandbox = process.env.WHCC_SANDBOX === 'true';
    const baseUrl = isSandbox ? 'https://sandbox.apps.whcc.com' : 'https://apps.whcc.com';

    if (!consumerKey || !consumerSecret) {
      return res.status(400).json({ error: 'WHCC credentials are not configured' });
    }

    const axios = (await import('axios')).default;

    const tokenResponse = await axios.get(`${baseUrl}/api/AccessToken`, {
      params: {
        grant_type: 'consumer_credentials',
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
      },
      headers: { Accept: 'application/json' },
    });

    const token = tokenResponse.data?.Token || tokenResponse.data?.token || null;
    if (!token) {
      return res.status(502).json({ error: 'WHCC token response did not include a token' });
    }

    const catalogResponse = await axios.get(`${baseUrl}/api/catalog`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });

    const categories = Array.isArray(catalogResponse.data?.Categories) ? catalogResponse.data.Categories : [];
    const products = categories.flatMap((c) => (Array.isArray(c?.ProductList) ? c.ProductList : []));

    const nodeByUid = new Map();
    for (const product of products) {
      const uid = Number(product?.ProductUID ?? product?.productUID ?? product?.ProductId ?? product?.productId ?? product?.Id ?? product?.id ?? 0);
      if (!Number.isInteger(uid) || uid <= 0 || nodeByUid.has(uid)) continue;

      const node = Number(
        product?.ProductNodeID ??
        product?.productNodeID ??
        product?.DefaultProductNodeID ??
        product?.defaultProductNodeID ??
        (Array.isArray(product?.ProductNodes)
          ? (product.ProductNodes[0]?.DP2NodeID ?? product.ProductNodes[0]?.ProductNodeID)
          : null) ??
        (Array.isArray(product?.productNodes)
          ? (product.productNodes[0]?.dp2NodeID ?? product.productNodes[0]?.productNodeID)
          : null)
      );

      if (Number.isInteger(node) && node > 0) {
        nodeByUid.set(uid, node);
      }
    }

    const rows = await mssql.query(`
      SELECT DISTINCT p.id as product_id, p.options as product_options
      FROM super_price_list_items spi
      JOIN product_sizes ps ON spi.product_size_id = ps.id
      JOIN products p ON ps.product_id = p.id
      WHERE spi.super_price_list_id = @p1
    `, [id]);

    let updatedCount = 0;
    let alreadySetCount = 0;
    let missingUidCount = 0;
    let noCatalogNodeCount = 0;

    for (const row of rows) {
      let options = {};
      try {
        options = row.product_options ? JSON.parse(row.product_options) : {};
      } catch (_) {
        options = {};
      }

      const whccUid = Number(options?.whccProductUID ?? options?.productUID ?? 0) || 0;
      const whccNode = Number(options?.whccProductNodeID ?? options?.productNodeID ?? 0) || 0;

      if (whccNode > 0) {
        alreadySetCount++;
        continue;
      }
      if (whccUid <= 0) {
        missingUidCount++;
        continue;
      }

      const catalogNode = Number(nodeByUid.get(whccUid) || 0);
      if (!(catalogNode > 0)) {
        noCatalogNodeCount++;
        continue;
      }

      const next = {
        ...options,
        whccProductUID: whccUid,
        whccProductNodeID: catalogNode,
      };
      await mssql.query('UPDATE products SET options = @p1 WHERE id = @p2', [JSON.stringify(next), row.product_id]);
      updatedCount++;
    }

    res.json({
      success: true,
      totalProductsInList: rows.length,
      updatedCount,
      alreadySetCount,
      missingUidCount,
      noCatalogNodeCount,
      catalogNodeMapSize: nodeByUid.size,
      sandbox: isSandbox,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fill missing WHCC node IDs', details: err?.message || String(err) });
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
        COUNT(DISTINCT spi.id) AS productCount,
        COUNT(DISTINCT stpl.id) AS linkedStudioCount
      FROM super_price_lists spl
      LEFT JOIN super_price_list_items spi
        ON spi.super_price_list_id = spl.id
      LEFT JOIN studio_price_lists stpl
        ON stpl.super_price_list_id = spl.id
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

// DELETE super price list and dependent studio links
router.delete('/:id', superAdminRequired, async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await mssql.query('SELECT TOP 1 id, name FROM super_price_lists WHERE id = @p1', [id]);
    if (!existing.length) {
      return res.status(404).json({ error: 'Super price list not found' });
    }

    const linkedStudioLists = await mssql.query('SELECT id FROM studio_price_lists WHERE super_price_list_id = @p1', [id]);
    const studioListIds = linkedStudioLists.map(row => Number(row.id)).filter(value => Number.isInteger(value) && value > 0);

    if (studioListIds.length) {
      for (const studioListId of studioListIds) {
        await mssql.query('DELETE FROM studio_price_list_items WHERE studio_price_list_id = @p1', [studioListId]);
      }
      await mssql.query('DELETE FROM studio_price_lists WHERE super_price_list_id = @p1', [id]);
    }

    await mssql.query('DELETE FROM super_price_list_category_images WHERE super_price_list_id = @p1', [id]);
    await mssql.query('DELETE FROM super_price_list_items WHERE super_price_list_id = @p1', [id]);
    await mssql.query('DELETE FROM super_price_lists WHERE id = @p1', [id]);

    res.json({
      success: true,
      deletedSuperPriceListId: Number(id),
      deletedLinkedStudioLists: studioListIds.length,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete super price list' });
  }
});

// GET all items for a super price list
router.get('/:id/items', async (req, res) => {
  const { id } = req.params;
  try {
    const rows = await mssql.query(`
      SELECT spi.id, spi.super_price_list_id, spi.product_size_id, spi.base_cost,
             spi.markup_percent, spi.is_active,
             ps.size_name, p.id as product_id, p.name as product_name, p.category as product_category,
             p.options as product_options
      FROM super_price_list_items spi
      LEFT JOIN product_sizes ps ON spi.product_size_id = ps.id
      LEFT JOIN products p ON ps.product_id = p.id
      WHERE spi.super_price_list_id = @p1
      ORDER BY p.category, p.name, ps.size_name
    `, [id]);
    const items = rows.map(item => {
      let options = {};
      try {
        options = item.product_options ? JSON.parse(item.product_options) : {};
      } catch (_) {
        options = {};
      }

      return {
        ...item,
        whccProductUID: options?.whccProductUID ?? '',
        whccProductNodeID: options?.whccProductNodeID ?? '',
        whccItemAttributeUIDs: Array.isArray(options?.whccItemAttributeUIDs) ? options.whccItemAttributeUIDs : [],
      };
    });
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
  const { base_cost, markup_percent, is_active, whccProductUID, whccProductNodeID, whccItemAttributeUIDs } = req.body;
  try {
    // Build dynamic SET to avoid overwriting fields not in payload
    const parts = [];
    const params = [];
    if (base_cost !== undefined) { params.push(base_cost); parts.push(`base_cost = @p${params.length}`); }
    if (markup_percent !== undefined) { params.push(markup_percent); parts.push(`markup_percent = @p${params.length}`); }
    if (is_active !== undefined) { params.push(is_active ? 1 : 0); parts.push(`is_active = @p${params.length}`); }
    if (parts.length) {
      params.push(itemId);
      await mssql.query(`UPDATE super_price_list_items SET ${parts.join(', ')} WHERE id = @p${params.length}`, params);
    }

    const hasWhccMappingUpdate = whccProductUID !== undefined || whccProductNodeID !== undefined || whccItemAttributeUIDs !== undefined;
    if (hasWhccMappingUpdate) {
      const itemRows = await mssql.query(`
        SELECT TOP 1 p.id as product_id, p.options as product_options
        FROM super_price_list_items spi
        LEFT JOIN product_sizes ps ON spi.product_size_id = ps.id
        LEFT JOIN products p ON ps.product_id = p.id
        WHERE spi.id = @p1
      `, [itemId]);

      const productId = itemRows[0]?.product_id;
      if (!productId) {
        return res.status(400).json({ error: 'Unable to resolve product for item' });
      }

      let options = {};
      try {
        options = itemRows[0]?.product_options ? JSON.parse(itemRows[0].product_options) : {};
      } catch (_) {
        options = {};
      }

      const nextOptions = { ...options };

      if (whccProductUID !== undefined) {
        const normalizedUID = Number(whccProductUID);
        if (Number.isInteger(normalizedUID) && normalizedUID > 0) nextOptions.whccProductUID = normalizedUID;
        else delete nextOptions.whccProductUID;
      }

      if (whccProductNodeID !== undefined) {
        const normalizedNodeID = Number(whccProductNodeID);
        if (Number.isInteger(normalizedNodeID) && normalizedNodeID > 0) nextOptions.whccProductNodeID = normalizedNodeID;
        else delete nextOptions.whccProductNodeID;
      }

      if (whccItemAttributeUIDs !== undefined) {
        const normalizedAttributeUIDs = Array.isArray(whccItemAttributeUIDs)
          ? whccItemAttributeUIDs.map(Number).filter(value => Number.isInteger(value) && value > 0)
          : String(whccItemAttributeUIDs || '')
              .split(',')
              .map(value => Number(value.trim()))
              .filter(value => Number.isInteger(value) && value > 0);

        if (normalizedAttributeUIDs.length) nextOptions.whccItemAttributeUIDs = normalizedAttributeUIDs;
        else delete nextOptions.whccItemAttributeUIDs;
      }

      await mssql.query('UPDATE products SET options = @p1 WHERE id = @p2', [JSON.stringify(nextOptions), productId]);
    }

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
