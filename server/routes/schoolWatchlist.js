import express from 'express';
import mssql from '../mssql.cjs';
const { queryRow, queryRows, query, tableExists } = mssql;
import { authRequired } from '../middleware/auth.js';

const router = express.Router();

// ─── Schema helpers ───────────────────────────────────────────────────────────
const ensureSchoolWatchlistTable = async () => {
  const exists = await tableExists('customer_school_watchlist');
  if (exists) {
    // Optionally, check and fix column type if needed (safe for startup)
    // This is a no-op if already correct
    await query(`
      IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('customer_school_watchlist') AND name = 'school_id' AND system_type_id <> 231)
      BEGIN
        -- Drop index if exists
        IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_csw_school_cat' AND object_id = OBJECT_ID('customer_school_watchlist'))
          DROP INDEX idx_csw_school_cat ON customer_school_watchlist;
        ALTER TABLE customer_school_watchlist ALTER COLUMN school_id NVARCHAR(255) NOT NULL;
        CREATE INDEX idx_csw_school_cat ON customer_school_watchlist (school_id, category);
      END
    `).catch(() => {});
    return;
  }
  await query(`
    CREATE TABLE customer_school_watchlist (
      id INT IDENTITY(1,1) PRIMARY KEY,
      user_id INT NOT NULL,
      school_id NVARCHAR(255) NOT NULL,
      category NVARCHAR(100) NOT NULL,
      created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE INDEX idx_csw_user ON customer_school_watchlist (user_id)`).catch(() => {});
  await query(`CREATE INDEX idx_csw_school_cat ON customer_school_watchlist (school_id, category)`).catch(() => {});
};

// ─── GET /api/school-watchlist — current user's followed schools ─────────────
router.get('/', async (req, res) => {
  try {
    // Public: Return all watched schools for all users (for debugging/demo)
    const rows = await queryRows(
      `SELECT id, school_id as schoolId, category, created_at as createdAt, user_id as userId
       FROM customer_school_watchlist
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/school-watchlist/available — list of tagged schools/categories ─
router.get('/available', async (req, res) => {
  try {
    // Pull available schools from albums.school_tags (plain text or comma-separated)
    const albums = await queryRows(`SELECT school_tags FROM albums WHERE school_tags IS NOT NULL`);
    let schools = [];
    for (const album of albums) {
      const tags = album.school_tags;
      if (!tags) continue;
      // Try to parse as JSON first
      let parsed = null;
      try {
        parsed = JSON.parse(tags);
      } catch {}
      if (Array.isArray(parsed)) {
        for (const tag of parsed) {
          if (tag && tag.id && tag.name) {
            schools.push({ schoolId: tag.id, schoolName: tag.name });
          }
        }
      } else {
        // Fallback: treat as comma-separated plain text
        tags.split(',').forEach((name) => {
          const trimmed = name.trim();
          if (trimmed) {
            schools.push({ schoolId: trimmed, schoolName: trimmed });
          }
        });
      }
    }
    // Deduplicate by schoolName
    const unique = {};
    for (const s of schools) {
      const key = `${s.schoolName}`;
      if (!unique[key]) unique[key] = s;
    }
    // Get all categories from the categories table
    const categories = await queryRows(`SELECT name FROM categories`);
    res.json({
      schools: Object.values(unique),
      categories: categories.map(c => c.name)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/school-watchlist — follow a school in a category ──────────────
router.post('/', authRequired, async (req, res) => {
  try {
    await ensureSchoolWatchlistTable();
    const userId = req.user.id;
    const { schoolId, category } = req.body;
    if (!schoolId || !category) {
      return res.status(400).json({ error: 'schoolId and category are required' });
    }
    // Accept schoolId as string (school name)
    const schoolIdStr = String(schoolId).trim();
    if (!schoolIdStr) {
      return res.status(400).json({ error: 'schoolId and category are required' });
    }
    // Prevent duplicates
    const existing = await queryRow(
      `SELECT id FROM customer_school_watchlist WHERE user_id = $1 AND school_id = $2 AND category = $3`,
      [userId, schoolIdStr, category]
    );
    if (existing) {
      return res.status(409).json({ error: 'Already following this school/category', id: existing.id });
    }
    await query(
      `INSERT INTO customer_school_watchlist (user_id, school_id, category) VALUES ($1, $2, $3)`,
      [userId, schoolIdStr, category]
    );
    const row = await queryRow(
      `SELECT TOP 1 id, school_id as schoolId, category, created_at as createdAt
       FROM customer_school_watchlist
       WHERE user_id = $1 AND school_id = $2 AND category = $3
       ORDER BY id DESC`,
      [userId, schoolIdStr, category]
    );
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/school-watchlist/:id — unfollow ─────────────────────────────
router.delete('/:id', authRequired, async (req, res) => {
  try {
    await ensureSchoolWatchlistTable();
    const userId = req.user.id;
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const row = await queryRow(
      `SELECT id, user_id as userId FROM customer_school_watchlist WHERE id = $1`,
      [id]
    );
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (row.userId !== userId) return res.status(403).json({ error: 'Forbidden' });
    await query(`DELETE FROM customer_school_watchlist WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
