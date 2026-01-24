import express from 'express';
import { db } from '../database.js';
const router = express.Router();

// Get all categories
router.get('/', (req, res) => {
  try {
    const categories = db.prepare(`
      SELECT DISTINCT category
      FROM albums
      WHERE category IS NOT NULL AND category != ''
      ORDER BY category ASC
    `).all();
    
    const categoryNames = categories.map(c => c.category);
    res.json(categoryNames);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create category (add to at least one album or just create it)
router.post('/', (req, res) => {
  try {
    const { category } = req.body;
    
    if (!category || !category.trim()) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    // Just return the category name - it will be stored when assigned to an album
    res.status(201).json({ category: category.trim() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete category - removes it from all albums
router.delete('/:category', (req, res) => {
  try {
    const { category } = req.params;
    
    // Update all albums with this category to null
    db.prepare(`
      UPDATE albums
      SET category = NULL
      WHERE category = ?
    `).run(decodeURIComponent(category));
    
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
