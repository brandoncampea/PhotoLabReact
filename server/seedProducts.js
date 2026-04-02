import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { queryRow, transaction } = require('./mssql.cjs');

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

const ensureDefaultPriceList = async () => {
  let row = await queryRow('SELECT TOP 1 id FROM price_lists WHERE is_default = 1 ORDER BY id');
  if (row?.id) return Number(row.id);
  row = await queryRow('SELECT TOP 1 id FROM price_lists ORDER BY id');
  if (row?.id) return Number(row.id);
  const inserted = await queryRow(
    `INSERT INTO price_lists (name, description, is_default, created_at)
     VALUES ($1, $2, 1, CURRENT_TIMESTAMP)
     RETURNING id`,
    ['Default Price List', 'Seeded by seedProducts.js']
  );
  return Number(inserted.id);
};

const seed = async () => {
  const priceListId = await ensureDefaultPriceList();
  let insertedProducts = 0;
  let updatedProducts = 0;
  let insertedSizes = 0;
  let updatedSizes = 0;

  const products = [
    {
      name: 'Photo Print',
      category: 'Prints',
      description: 'High-quality photographic prints in popular sizes.',
      popularity: 100,
      sizes: [
        { name: '4x6', width: 4, height: 6, price: 2.99, cost: 0.8 },
        { name: '5x7', width: 5, height: 7, price: 4.99, cost: 1.2 },
        { name: '8x10', width: 8, height: 10, price: 9.99, cost: 2.4 },
        { name: '11x14', width: 11, height: 14, price: 14.99, cost: 3.6 },
      ],
    },
    {
      name: 'Canvas Wrap',
      category: 'Canvas',
      description: 'Premium canvas wrap wall art.',
      popularity: 60,
      sizes: [
        { name: '8x10', width: 8, height: 10, price: 39.99, cost: 11.5 },
        { name: '16x20', width: 16, height: 20, price: 79.99, cost: 22.9 },
      ],
    },
    {
      name: 'Framed Print',
      category: 'Frames',
      description: 'Beautiful wooden frames with matting.',
      popularity: 75,
      sizes: [
        { name: '5x7 Oak', width: 5, height: 7, price: 29.99, cost: 9.2 },
        { name: '8x10 Oak', width: 8, height: 10, price: 49.99, cost: 15.3 },
        { name: '11x14 Walnut', width: 11, height: 14, price: 59.99, cost: 18.7 },
      ],
    },
    {
      name: 'Metal Print',
      category: 'Metal',
      description: 'Modern metal prints with vibrant colors.',
      popularity: 80,
      sizes: [
        { name: '8x10', width: 8, height: 10, price: 34.99, cost: 10.2 },
        { name: '12x16', width: 12, height: 16, price: 59.99, cost: 17.8 },
        { name: '16x24', width: 16, height: 24, price: 89.99, cost: 26.4 },
      ],
    },
    {
      name: 'Acrylic Print',
      category: 'Acrylic',
      description: 'Crystal-clear acrylic photos with depth effect.',
      popularity: 70,
      sizes: [
        { name: '8x10', width: 8, height: 10, price: 44.99, cost: 13.1 },
        { name: '12x16', width: 12, height: 16, price: 74.99, cost: 21.7 },
      ],
    },
    {
      name: 'Photo Album',
      category: 'Albums',
      description: 'Premium leather-bound photo albums.',
      popularity: 50,
      sizes: [
        { name: '8x8 Small', width: 8, height: 8, price: 24.99, cost: 7.2 },
        { name: '10x10 Medium', width: 10, height: 10, price: 39.99, cost: 12.8 },
        { name: '12x12 Large', width: 12, height: 12, price: 54.99, cost: 16.4 },
      ],
    },
    {
      name: 'Wall Calendar',
      category: 'Calendars',
      description: 'Custom wall calendars with your photos.',
      popularity: 45,
      sizes: [
        { name: '12x18', width: 12, height: 18, price: 19.99, cost: 5.9 },
        { name: '11x17 Spiral', width: 11, height: 17, price: 24.99, cost: 7.4 },
      ],
    },
    {
      name: 'Throw Pillow',
      category: 'Home Decor',
      description: 'Soft throw pillows featuring your photos.',
      popularity: 55,
      sizes: [
        { name: '16x16', width: 16, height: 16, price: 29.99, cost: 9.2 },
        { name: '18x18', width: 18, height: 18, price: 34.99, cost: 10.8 },
        { name: '20x20', width: 20, height: 20, price: 39.99, cost: 12.1 },
      ],
    },
    {
      name: 'Mug',
      category: 'Drinkware',
      description: 'Photo mugs perfect for coffee lovers.',
      popularity: 40,
      sizes: [
        { name: '11oz', width: 0, height: 0, price: 12.99, cost: 4.1 },
        { name: '15oz', width: 0, height: 0, price: 14.99, cost: 4.7 },
      ],
    },
    {
      name: 'Phone Case',
      category: 'Accessories',
      description: 'Custom phone cases with your photos.',
      popularity: 35,
      sizes: [
        { name: 'iPhone 15', width: 0, height: 0, price: 19.99, cost: 6.3 },
        { name: 'iPhone 15 Pro', width: 0, height: 0, price: 19.99, cost: 6.4 },
        { name: 'Samsung S24', width: 0, height: 0, price: 19.99, cost: 6.2 },
      ],
    },
    {
      name: 'Wooden Box',
      category: 'Storage',
      description: 'Elegant wooden boxes with photo covers.',
      popularity: 48,
      sizes: [
        { name: 'Small (5x7)', width: 5, height: 7, price: 22.99, cost: 6.9 },
        { name: 'Medium (8x10)', width: 8, height: 10, price: 32.99, cost: 10.3 },
        { name: 'Large (12x15)', width: 12, height: 15, price: 44.99, cost: 13.8 },
      ],
    },
    {
      name: 'Leather Journal',
      category: 'Stationery',
      description: 'Premium leather journals with custom photos.',
      popularity: 42,
      sizes: [
        { name: 'A5', width: 5.8, height: 8.3, price: 26.99, cost: 8.1 },
        { name: 'A4', width: 8.3, height: 11.7, price: 36.99, cost: 11.6 },
      ],
    },
    {
      name: 'Tote Bag',
      category: 'Bags',
      description: 'Stylish canvas tote bags with your photos.',
      popularity: 38,
      sizes: [
        { name: 'Standard', width: 0, height: 0, price: 18.99, cost: 5.7 },
        { name: 'Large', width: 0, height: 0, price: 22.99, cost: 6.9 },
      ],
    },
  ];

  await transaction(async (client) => {
    for (const p of products) {
      const fallbackPrice = Number(p.sizes?.[0]?.price || 0);
      const fallbackCost = Number(p.sizes?.[0]?.cost || 0);

      const options = {
        isActive: true,
        popularity: Number(p.popularity) || 0,
        sizes: p.sizes.map((s) => ({
          name: s.name,
          width: Number(s.width) || 0,
          height: Number(s.height) || 0,
          price: Number(s.price) || 0,
        })),
      };

      const existing = await client.query('SELECT TOP 1 id FROM products WHERE name = $1', [p.name]);
      let productId;

      if (!existing.rows?.[0]?.id) {
        const inserted = await client.query(
          `INSERT INTO products (name, category, price, description, cost, options)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [p.name, p.category, fallbackPrice, p.description, fallbackCost, JSON.stringify(options)]
        );
        productId = Number(inserted.rows[0].id);
        insertedProducts += 1;
      } else {
        productId = Number(existing.rows[0].id);
        await client.query(
          `UPDATE products SET category = $2, price = $3, description = $4, cost = $5, options = $6 WHERE id = $1`,
          [productId, p.category, fallbackPrice, p.description, fallbackCost, JSON.stringify(options)]
        );
        updatedProducts += 1;
      }

      const linked = await client.query(
        'SELECT TOP 1 id FROM price_list_products WHERE price_list_id = $1 AND product_id = $2',
        [priceListId, productId]
      );
      if (!linked.rows?.[0]?.id) {
        await client.query(
          'INSERT INTO price_list_products (price_list_id, product_id) VALUES ($1, $2)',
          [priceListId, productId]
        );
      }

      for (const s of p.sizes) {
        const sizeName = encodeSizeName(s.name, s.width, s.height);
        const existingSize = await client.query(
          `SELECT TOP 1 id FROM product_sizes WHERE price_list_id = $1 AND product_id = $2 AND size_name = $3`,
          [priceListId, productId, sizeName]
        );

        if (!existingSize.rows?.[0]?.id) {
          await client.query(
            `INSERT INTO product_sizes (price_list_id, product_id, size_name, price, cost) VALUES ($1, $2, $3, $4, $5)`,
            [priceListId, productId, sizeName, Number(s.price) || 0, Number(s.cost) || 0]
          );
          insertedSizes += 1;
        } else {
          await client.query(
            `UPDATE product_sizes SET price = $2, cost = $3 WHERE id = $1`,
            [existingSize.rows[0].id, Number(s.price) || 0, Number(s.cost) || 0]
          );
          updatedSizes += 1;
        }
      }
    }
  });

  console.log('✅ Product seed complete');
  console.log(`Price list id: ${priceListId}`);
  console.log(`Products inserted: ${insertedProducts}, updated: ${updatedProducts}`);
  console.log(`Sizes inserted: ${insertedSizes}, updated: ${updatedSizes}`);
  process.exit(0);
};

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
