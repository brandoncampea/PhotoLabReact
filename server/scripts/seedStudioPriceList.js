// Seed a studio price list by copying from super price list
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new Database(path.join(__dirname, '../campeaphotolab-test.db'));
db.pragma('foreign_keys = ON');

// Assume studio_id = 1 exists
const studioId = 1;
const superPriceListId = db.prepare('SELECT id FROM super_price_lists WHERE is_active = 1 LIMIT 1').get()?.id;
if (!superPriceListId) throw new Error('No active super price list');

const studioPriceListName = 'Studio Default';
db.prepare('INSERT INTO studio_price_lists (studio_id, name, description, is_default, super_price_list_id) VALUES (?, ?, ?, 1, ?)')
  .run(studioId, studioPriceListName, 'Default studio price list', superPriceListId);
const studioPriceListId = db.prepare('SELECT id FROM studio_price_lists WHERE name = ? AND studio_id = ?').get(studioPriceListName, studioId)?.id;

// Copy all items from super price list
const items = db.prepare('SELECT product_size_id, base_cost FROM super_price_list_items WHERE super_price_list_id = ? AND is_active = 1').all(superPriceListId);
items.forEach(item => {
  db.prepare('INSERT OR IGNORE INTO studio_price_list_items (studio_price_list_id, product_size_id, price, is_offered) VALUES (?, ?, ?, 1)')
    .run(studioPriceListId, item.product_size_id, item.base_cost + 3.00); // Example markup
});

console.log('Studio price list and items seeded.');
db.close();
