import { queryRow, transaction } from './mssql.js';

const seed = async () => {
  const countRow = await queryRow('SELECT COUNT(*)::int as c FROM products');
  const count = Number(countRow?.c || 0);
  if (count > 0) {
    console.log(`Products already exist (${count}); skipping seed.`);
    return;
  }

  const products = [
    {
      name: 'Photo Print',
      category: 'Prints',
      price: 0,
      description: 'High-quality photographic prints in popular sizes.',
      cost: null,
      options: {
        isActive: true,
        popularity: 100,
        sizes: [
          { name: '4x6', width: 4, height: 6, price: 2.99 },
          { name: '5x7', width: 5, height: 7, price: 4.99 },
          { name: '8x10', width: 8, height: 10, price: 9.99 },
          { name: '11x14', width: 11, height: 14, price: 14.99 },
        ],
      },
    },
    {
      name: 'Canvas Wrap',
      category: 'Canvas',
      price: 0,
      description: 'Premium canvas wrap wall art.',
      cost: null,
      options: {
        isActive: true,
        popularity: 60,
        sizes: [
          { name: '8x10', width: 8, height: 10, price: 39.99 },
          { name: '16x20', width: 16, height: 20, price: 79.99 },
        ],
      },
    },
    {
      name: 'Framed Print',
      category: 'Frames',
      price: 0,
      description: 'Beautiful wooden frames with matting.',
      cost: null,
      options: {
        isActive: true,
        popularity: 75,
        sizes: [
          { name: '5x7 Oak', width: 5, height: 7, price: 29.99 },
          { name: '8x10 Oak', width: 8, height: 10, price: 49.99 },
          { name: '11x14 Walnut', width: 11, height: 14, price: 59.99 },
        ],
      },
    },
    {
      name: 'Metal Print',
      category: 'Metal',
      price: 0,
      description: 'Modern metal prints with vibrant colors.',
      cost: null,
      options: {
        isActive: true,
        popularity: 80,
        sizes: [
          { name: '8x10', width: 8, height: 10, price: 34.99 },
          { name: '12x16', width: 12, height: 16, price: 59.99 },
          { name: '16x24', width: 16, height: 24, price: 89.99 },
        ],
      },
    },
    {
      name: 'Acrylic Print',
      category: 'Acrylic',
      price: 0,
      description: 'Crystal-clear acrylic photos with depth effect.',
      cost: null,
      options: {
        isActive: true,
        popularity: 70,
        sizes: [
          { name: '8x10', width: 8, height: 10, price: 44.99 },
          { name: '12x16', width: 12, height: 16, price: 74.99 },
        ],
      },
    },
    {
      name: 'Photo Album',
      category: 'Albums',
      price: 0,
      description: 'Premium leather-bound photo albums.',
      cost: null,
      options: {
        isActive: true,
        popularity: 50,
        sizes: [
          { name: '8x8 Small', width: 8, height: 8, price: 24.99 },
          { name: '10x10 Medium', width: 10, height: 10, price: 39.99 },
          { name: '12x12 Large', width: 12, height: 12, price: 54.99 },
        ],
      },
    },
    {
      name: 'Wall Calendar',
      category: 'Calendars',
      price: 0,
      description: 'Custom wall calendars with your photos.',
      cost: null,
      options: {
        isActive: true,
        popularity: 45,
        sizes: [
          { name: '12x18', width: 12, height: 18, price: 19.99 },
          { name: '11x17 Spiral', width: 11, height: 17, price: 24.99 },
        ],
      },
    },
    {
      name: 'Throw Pillow',
      category: 'Home Decor',
      price: 0,
      description: 'Soft throw pillows featuring your photos.',
      cost: null,
      options: {
        isActive: true,
        popularity: 55,
        sizes: [
          { name: '16x16', width: 16, height: 16, price: 29.99 },
          { name: '18x18', width: 18, height: 18, price: 34.99 },
          { name: '20x20', width: 20, height: 20, price: 39.99 },
        ],
      },
    },
    {
      name: 'Mug',
      category: 'Drinkware',
      price: 0,
      description: 'Photo mugs perfect for coffee lovers.',
      cost: null,
      options: {
        isActive: true,
        popularity: 40,
        sizes: [
          { name: '11oz', width: 0, height: 0, price: 12.99 },
          { name: '15oz', width: 0, height: 0, price: 14.99 },
        ],
      },
    },
    {
      name: 'Phone Case',
      category: 'Accessories',
      price: 0,
      description: 'Custom phone cases with your photos.',
      cost: null,
      options: {
        isActive: true,
        popularity: 35,
        sizes: [
          { name: 'iPhone 15', width: 0, height: 0, price: 19.99 },
          { name: 'iPhone 15 Pro', width: 0, height: 0, price: 19.99 },
          { name: 'Samsung S24', width: 0, height: 0, price: 19.99 },
        ],
      },
    },
    {
      name: 'Wooden Box',
      category: 'Storage',
      price: 0,
      description: 'Elegant wooden boxes with photo covers.',
      cost: null,
      options: {
        isActive: true,
        popularity: 48,
        sizes: [
          { name: 'Small (5x7)', width: 5, height: 7, price: 22.99 },
          { name: 'Medium (8x10)', width: 8, height: 10, price: 32.99 },
          { name: 'Large (12x15)', width: 12, height: 15, price: 44.99 },
        ],
      },
    },
    {
      name: 'Leather Journal',
      category: 'Stationery',
      price: 0,
      description: 'Premium leather journals with custom photos.',
      cost: null,
      options: {
        isActive: true,
        popularity: 42,
        sizes: [
          { name: 'A5 (5.8x8.3)', width: 5.8, height: 8.3, price: 26.99 },
          { name: 'A4 (8.3x11.7)', width: 8.3, height: 11.7, price: 36.99 },
        ],
      },
    },
    {
      name: 'Tote Bag',
      category: 'Bags',
      price: 0,
      description: 'Stylish canvas tote bags with your photos.',
      cost: null,
      options: {
        isActive: true,
        popularity: 38,
        sizes: [
          { name: 'Standard', width: 0, height: 0, price: 18.99 },
          { name: 'Large', width: 0, height: 0, price: 22.99 },
        ],
      },
    },
  ];

  await transaction(async (client) => {
    for (const p of products) {
      await client.query(
        'INSERT INTO products (name, category, price, description, cost, options) VALUES ($1, $2, $3, $4, $5, $6)',
        [p.name, p.category, p.price, p.description, p.cost, JSON.stringify(p.options)]
      );
    }
  });
  console.log('Seeded default products:', products.map(p => p.name).join(', '));
  process.exit(0);
};

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
