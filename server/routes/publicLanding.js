import express from 'express';
import mssql from '../mssql.cjs';
const { queryRow } = mssql;

const router = express.Router();

// Get landing page by studio slug (public route)
router.get('/:studioSlug/landing', async (req, res) => {
  try {
    const { studioSlug } = req.params;
    
    // Get studio by public_slug, then get its landing page
    const studio = await queryRow(
      `SELECT id, public_slug as publicSlug FROM studios WHERE public_slug = $1`,
      [studioSlug]
    );
    
    if (!studio) {
      return res.status(404).json({ error: 'Studio not found' });
    }
    
    const landingPage = await queryRow(
      `SELECT id, studio_id as studioId, html_content as htmlContent, created_at as createdAt, updated_at as updatedAt
       FROM studio_landing_pages
       WHERE studio_id = $1`,
      [studio.id]
    );
    
    if (!landingPage) {
      // Return default if no landing page exists
      return res.json({
        studioId: studio.id,
        htmlContent: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; max-width: 1200px; margin: 0 auto; padding: 40px 20px; text-align: center;"><h1 style="font-size: 3em; margin-bottom: 10px; color: #333;">Welcome to Our Studio</h1><p style="font-size: 1.2em; color: #666; margin-bottom: 30px;">View our beautiful photo gallery</p><a href="/albums?studioSlug=${studioSlug}" style="display: inline-block; background-color: #007bff; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-size: 1.1em; transition: background-color 0.3s;">View Albums</a></div>`,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    
    res.json(landingPage);
  } catch (error) {
    console.error('Get landing page error:', error);
    res.status(500).json({ error: 'Failed to load landing page' });
  }
});

export default router;
