import express from 'express';
import { db } from '../database.js';
import { adminRequired } from '../middleware/auth.js';
const router = express.Router();

// Get all categories
router.get('/', (req, res) => {
  try {
    // Get all categories from categories table
    const categories = db.prepare(`
      SELECT name
      FROM categories
      ORDER BY name ASC
    `).all();
    
    const categoryNames = categories.map(c => c.name);
    res.json(categoryNames);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create category
router.post('/', adminRequired, (req, res) => {
  try {
    const { category } = req.body;
    
    if (!category || !category.trim()) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    // Insert the category into the categories table
    try {
      db.prepare('INSERT INTO categories (name) VALUES (?)').run(category.trim());
    } catch (e) {
      // If duplicate, just return success
      if (!e.message.includes('UNIQUE constraint failed')) {
        throw e;
      }
    }

    res.status(201).json({ category: category.trim() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete category - removes it from table and all albums
router.delete('/:category', adminRequired, (req, res) => {
  try {
    const { category } = req.params;
    const decodedCategory = decodeURIComponent(category);
    
    // Remove from categories table
    db.prepare('DELETE FROM categories WHERE name = ?').run(decodedCategory);
    
    // Update all albums with this category to null
    db.prepare(`
      UPDATE albums
      SET category = NULL
      WHERE category = ?
    `).run(decodedCategory);
    
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
