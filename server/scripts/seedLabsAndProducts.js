// Seed labs, products, and product sizes for initial setup
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new Database(path.join(__dirname, '../campeaphotolab-test.db'));

db.pragma('foreign_keys = ON');

// Seed labs
const labs = [
  { name: 'WHCC', type: 'whcc' },
  { name: 'Mpix', type: 'mpix' },
  { name: 'CSV Import', type: 'csv' },
];
labs.forEach(lab => {
  db.prepare('INSERT OR IGNORE INTO labs (name, type) VALUES (?, ?)').run(lab.name, lab.type);
});

// Seed products and sizes for WHCC
const whccLabId = db.prepare('SELECT id FROM labs WHERE name = ?').get('WHCC')?.id;
if (whccLabId) {
  const products = [
    { name: '8x10 Print', category: 'Prints', is_digital: 0, description: '8x10 professional print' },
    { name: 'Digital Download', category: 'Digital', is_digital: 1, description: 'High-res digital file' },
  ];
  products.forEach(prod => {
    db.prepare('INSERT INTO products (lab_id, name, category, is_digital, description) VALUES (?, ?, ?, ?, ?)')
      .run(whccLabId, prod.name, prod.category, prod.is_digital, prod.description);
  });
  // Add sizes
  const printProductId = db.prepare('SELECT id FROM products WHERE name = ? AND lab_id = ?').get('8x10 Print', whccLabId)?.id;
  if (printProductId) {
    db.prepare('INSERT INTO product_sizes (product_id, name, width, height, is_digital) VALUES (?, ?, ?, ?, 0)')
      .run(printProductId, '8x10', 8, 10);
  }
  const digitalProductId = db.prepare('SELECT id FROM products WHERE name = ? AND lab_id = ?').get('Digital Download', whccLabId)?.id;
  if (digitalProductId) {
    db.prepare('INSERT INTO product_sizes (product_id, name, is_digital) VALUES (?, ?, 1)')
      .run(digitalProductId, 'Digital Original');
  }
}

console.log('Labs, products, and product sizes seeded.');
db.close();
