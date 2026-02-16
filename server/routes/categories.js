import express from 'express';
import { queryRows, query } from '../mssql.js';
import { adminRequired } from '../middleware/auth.js';
const router = express.Router();

// Get all categories
router.get('/', async (req, res) => {
  try {
    // Get all categories from categories table
    const categories = await queryRows(`
      SELECT name
      FROM categories
      ORDER BY name ASC
    `);
    
    const categoryNames = categories.map(c => c.name);
    res.json(categoryNames);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create category
router.post('/', adminRequired, async (req, res) => {
  try {
    const { category } = req.body;
    
    if (!category || !category.trim()) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    // Insert the category into the categories table
    try {
      await query(
        `IF NOT EXISTS (SELECT 1 FROM categories WHERE name = $1)
         BEGIN
           INSERT INTO categories (name) VALUES ($1)
         END`,
        [category.trim()]
      );
    } catch (e) {
      throw e;
    }

    res.status(201).json({ category: category.trim() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete category - removes it from table and all albums
router.delete('/:category', adminRequired, async (req, res) => {
  try {
    const { category } = req.params;
    const decodedCategory = decodeURIComponent(category);
    
    // Remove from categories table
    await query('DELETE FROM categories WHERE name = $1', [decodedCategory]);
    
    // Update all albums with this category to null
    await query(`
      UPDATE albums
      SET category = NULL
      WHERE category = $1
    `, [decodedCategory]);
    
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
