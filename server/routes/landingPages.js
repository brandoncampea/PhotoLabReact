import express from 'express';
import mssql from '../mssql.cjs';
import { authRequired } from '../middleware/auth.js';
const { queryRow, query, tableExists, columnExists } = mssql;

const router = express.Router();

const ensureLandingPageTable = async () => {
  const exists = await tableExists('studio_landing_pages');
  if (exists) {
    // Ensure expected columns exist
    await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='studio_landing_pages' AND COLUMN_NAME='studio_id') ALTER TABLE studio_landing_pages ADD studio_id INT NOT NULL`);
    await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='studio_landing_pages' AND COLUMN_NAME='html_content') ALTER TABLE studio_landing_pages ADD html_content NVARCHAR(MAX) NULL`);
    await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='studio_landing_pages' AND COLUMN_NAME='created_at') ALTER TABLE studio_landing_pages ADD created_at DATETIME2 DEFAULT GETDATE()`);
    await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='studio_landing_pages' AND COLUMN_NAME='updated_at') ALTER TABLE studio_landing_pages ADD updated_at DATETIME2 DEFAULT GETDATE()`);
    
    // Ensure unique index on studio_id
    await query(`
      IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'uq_studio_landing_pages_studio_id'
          AND object_id = OBJECT_ID('studio_landing_pages')
      )
      BEGIN
        CREATE UNIQUE INDEX uq_studio_landing_pages_studio_id
        ON studio_landing_pages(studio_id)
      END
    `);
    
    return true;
  }

  await query(`
    CREATE TABLE studio_landing_pages (
      id INT IDENTITY(1,1) PRIMARY KEY,
      studio_id INT NOT NULL UNIQUE,
      html_content NVARCHAR(MAX) NULL,
      created_at DATETIME2 DEFAULT GETDATE(),
      updated_at DATETIME2 DEFAULT GETDATE(),
      FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE
    )
  `);

  await query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = 'uq_studio_landing_pages_studio_id'
        AND object_id = OBJECT_ID('studio_landing_pages')
    )
    BEGIN
      CREATE UNIQUE INDEX uq_studio_landing_pages_studio_id
      ON studio_landing_pages(studio_id)
    END
  `);

  return true;
};

// Default landing page HTML
const DEFAULT_LANDING_PAGE_HTML = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; max-width: 1200px; margin: 0 auto; padding: 40px 20px; text-align: center;">
  <h1 style="font-size: 3em; margin-bottom: 10px; color: #333;">Welcome to Our Studio</h1>
  <p style="font-size: 1.2em; color: #666; margin-bottom: 30px;">View our beautiful photo gallery</p>
  <a href="/albums" style="display: inline-block; background-color: #007bff; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-size: 1.1em; transition: background-color 0.3s;">View Albums</a>
</div>
`;

// Get landing page for a studio (used by studio admin)
router.get('/', authRequired, async (req, res) => {
  try {
    await ensureLandingPageTable();
    
    const user = req.user;
    let studioId;
    
    if (user?.role === 'super_admin') {
      studioId = req.query.studioId || user?.acting_studio_id;
      if (!studioId) studioId = 1;
    } else {
      studioId = user?.studio_id;
      if (!studioId) {
        return res.status(403).json({ error: 'Studio ID required' });
      }
    }
    
    studioId = Number(studioId);
    
    let landingPage = await queryRow(
      `SELECT id, studio_id as studioId, html_content as htmlContent, created_at as createdAt, updated_at as updatedAt
       FROM studio_landing_pages
       WHERE studio_id = $1`,
      [studioId]
    );
    
    // Initialize if doesn't exist
    if (!landingPage) {
      await query(
        `INSERT INTO studio_landing_pages (studio_id, html_content, created_at, updated_at)
         VALUES ($1, $2, GETDATE(), GETDATE())`,
        [studioId, DEFAULT_LANDING_PAGE_HTML]
      );
      
      landingPage = await queryRow(
        `SELECT id, studio_id as studioId, html_content as htmlContent, created_at as createdAt, updated_at as updatedAt
         FROM studio_landing_pages
         WHERE studio_id = $1`,
        [studioId]
      );
    }
    
    res.json(landingPage || {
      studioId,
      htmlContent: DEFAULT_LANDING_PAGE_HTML,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  } catch (error) {
    console.error('Get landing page error:', error);
    res.status(500).json({ error: 'Failed to load landing page' });
  }
});

// Update landing page for a studio
router.put('/', authRequired, async (req, res) => {
  try {
    await ensureLandingPageTable();
    
    const user = req.user;
    let studioId;
    
    if (user?.role === 'super_admin') {
      studioId = req.body.studioId || req.query.studioId || user?.acting_studio_id || 1;
    } else if (user?.role === 'admin') {
      studioId = user?.studio_id || 1;
    } else {
      studioId = user?.studio_id;
    }
    
    studioId = Number(studioId);
    if (!studioId) {
      return res.status(403).json({ error: 'Studio ID required' });
    }
    
    const { htmlContent } = req.body;
    
    // Sanitize HTML - basic validation (allow common HTML tags)
    if (htmlContent && typeof htmlContent !== 'string') {
      return res.status(400).json({ error: 'HTML content must be a string' });
    }
    
    // Check if landing page exists
    const exists = await queryRow(
      `SELECT id FROM studio_landing_pages WHERE studio_id = $1`,
      [studioId]
    );
    
    if (exists) {
      // Update existing
      await query(
        `UPDATE studio_landing_pages
         SET html_content = $1, updated_at = GETDATE()
         WHERE studio_id = $2`,
        [htmlContent || DEFAULT_LANDING_PAGE_HTML, studioId]
      );
    } else {
      // Create new
      await query(
        `INSERT INTO studio_landing_pages (studio_id, html_content, created_at, updated_at)
         VALUES ($1, $2, GETDATE(), GETDATE())`,
        [studioId, htmlContent || DEFAULT_LANDING_PAGE_HTML]
      );
    }
    
    const updated = await queryRow(
      `SELECT id, studio_id as studioId, html_content as htmlContent, created_at as createdAt, updated_at as updatedAt
       FROM studio_landing_pages
       WHERE studio_id = $1`,
      [studioId]
    );
    
    res.json(updated);
  } catch (error) {
    console.error('Update landing page error:', error);
    res.status(500).json({ error: 'Failed to update landing page' });
  }
});

// Reset landing page to default
router.post('/reset', authRequired, async (req, res) => {
  try {
    await ensureLandingPageTable();
    
    const user = req.user;
    let studioId;
    
    if (user?.role === 'super_admin') {
      studioId = req.body.studioId || req.query.studioId || user?.acting_studio_id || 1;
    } else if (user?.role === 'admin') {
      studioId = user?.studio_id || 1;
    } else {
      studioId = user?.studio_id;
    }
    
    studioId = Number(studioId);
    if (!studioId) {
      return res.status(403).json({ error: 'Studio ID required' });
    }
    
    const exists = await queryRow(
      `SELECT id FROM studio_landing_pages WHERE studio_id = $1`,
      [studioId]
    );
    
    if (exists) {
      await query(
        `UPDATE studio_landing_pages
         SET html_content = $1, updated_at = GETDATE()
         WHERE studio_id = $2`,
        [DEFAULT_LANDING_PAGE_HTML, studioId]
      );
    } else {
      await query(
        `INSERT INTO studio_landing_pages (studio_id, html_content, created_at, updated_at)
         VALUES ($1, $2, GETDATE(), GETDATE())`,
        [studioId, DEFAULT_LANDING_PAGE_HTML]
      );
    }
    
    const reset = await queryRow(
      `SELECT id, studio_id as studioId, html_content as htmlContent, created_at as createdAt, updated_at as updatedAt
       FROM studio_landing_pages
       WHERE studio_id = $1`,
      [studioId]
    );
    
    res.json(reset);
  } catch (error) {
    console.error('Reset landing page error:', error);
    res.status(500).json({ error: 'Failed to reset landing page' });
  }
});

export default router;
