
import express from 'express';
import mssql from '../mssql.cjs';
const { queryRow, queryRows, query, tableExists } = mssql;
import { authRequired } from '../middleware/auth.js';

const router = express.Router();

// ─── Schema helpers ───────────────────────────────────────────────────────────

const ensureWatchlistTable = async () => {
  const exists = await tableExists('customer_player_watchlist');
  if (exists) return;

  await query(`
    CREATE TABLE customer_player_watchlist (
      id            INT IDENTITY(1,1) PRIMARY KEY,
      user_id       INT           NOT NULL,
      studio_id     INT           NOT NULL,
      player_name   NVARCHAR(255) NOT NULL,
      player_number NVARCHAR(50)  NULL,
      created_at    DATETIME2     DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Index for fast lookup by user and by (studio_id, player_name)
  await query(`CREATE INDEX idx_cpw_user       ON customer_player_watchlist (user_id)`).catch(() => {});
  await query(`CREATE INDEX idx_cpw_studio_player ON customer_player_watchlist (studio_id, player_name)`).catch(() => {});
};

// ─── GET /api/player-watchlist — current user's subscriptions ─────────────────
// Authenticated: Return only the current user's watched players
router.get('/', async (req, res) => {
  try {
    // Public: Return all watched players for all users (for debugging/demo)
    const rows = await queryRows(
      `SELECT id, studio_id as studioId, player_name as playerName,
              player_number as playerNumber, created_at as createdAt, user_id as userId
       FROM customer_player_watchlist
       ORDER BY player_name`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/player-watchlist/roster — roster for user's studio ──────────────
// Returns the studio roster so the customer can pick players to watch.
// Optionally accepts ?studioSlug= for public-facing lookups.
router.get('/roster', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    let studioId = req.user.studio_id;

    // Allow a studioSlug override (e.g. customer browsing a public studio)
    if (!studioId && req.query.studioSlug) {
      const studio = await queryRow(
        `SELECT id FROM studios WHERE public_slug = $1`,
        [req.query.studioSlug]
      );
      studioId = studio?.id || null;
    }

    if (!studioId) {
      return res.json([]);
    }

    const roster = await queryRows(
      `SELECT id, player_name as playerName, player_number as playerNumber,
              roster_name as rosterName
       FROM studio_player_roster
       WHERE studio_id = $1
       ORDER BY player_name`,
      [studioId]
    );

    // Also attach whether the user is already watching each player
    const watchlist = await queryRows(
      `SELECT player_name as playerName FROM customer_player_watchlist
       WHERE user_id = $1 AND studio_id = $2`,
      [userId, studioId]
    );
    const watching = new Set(watchlist.map((r) => r.playerName.toLowerCase()));

    res.json(
      roster.map((p) => ({
        ...p,
        isWatching: watching.has((p.playerName || '').toLowerCase()),
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/player-watchlist — subscribe to a player ──────────────────────
router.post('/', authRequired, async (req, res) => {
  try {
    await ensureWatchlistTable();
    const userId = req.user.id;
    const { playerName, studioId: bodyStudioId } = req.body;

    if (!playerName || typeof playerName !== 'string' || !playerName.trim()) {
      return res.status(400).json({ error: 'playerName is required' });
    }

    // Resolve studio: prefer explicit body param, fall back to user's studio
    let studioId = Number(bodyStudioId) || Number(req.user.studio_id) || null;
    if (!studioId) {
      return res.status(400).json({ error: 'Cannot determine studio. Please provide studioId.' });
    }

    const normalizedName = playerName.trim();

    // Prevent duplicates
    const existing = await queryRow(
      `SELECT id FROM customer_player_watchlist
       WHERE user_id = $1 AND studio_id = $2
         AND LOWER(player_name) = LOWER($3)`,
      [userId, studioId, normalizedName]
    );
    if (existing) {
      return res.status(409).json({ error: 'Already watching this player', id: existing.id });
    }

    await query(
      `INSERT INTO customer_player_watchlist (user_id, studio_id, player_name, player_number)
       VALUES ($1, $2, $3, NULL)`,
      [userId, studioId, normalizedName]
    );

    const row = await queryRow(
      `SELECT TOP 1 id, studio_id as studioId, player_name as playerName,
              player_number as playerNumber, created_at as createdAt
       FROM customer_player_watchlist
       WHERE user_id = $1 AND studio_id = $2 AND LOWER(player_name) = LOWER($3)
       ORDER BY id DESC`,
      [userId, studioId, normalizedName]
    );
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/player-watchlist/:id — unsubscribe ──────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await ensureWatchlistTable();
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const row = await queryRow(
      `SELECT id FROM customer_player_watchlist WHERE id = $1`,
      [id]
    );
    if (!row) return res.status(404).json({ error: 'Not found' });

    await query(`DELETE FROM customer_player_watchlist WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── GET /api/player-watchlist/:id/photos — photos for a watched player ──────
router.get('/:id/photos', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(48, Math.max(1, parseInt(req.query.pageSize) || 24));
    const offset = (page - 1) * pageSize;

    const entry = await queryRow(
      `SELECT id, studio_id, player_name FROM customer_player_watchlist WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (!entry) return res.status(404).json({ error: 'Not found' });

    const studioId = entry.studio_id;
    const playerName = entry.player_name;

    const [countRow, rows] = await Promise.all([
      queryRow(`
        SELECT COUNT(*) AS total
        FROM photos p
        INNER JOIN albums a ON a.id = p.album_id
        WHERE a.studio_id = $1
          AND p.player_names IS NOT NULL
          AND ',' + REPLACE(p.player_names, ' ', '') + ',' LIKE '%,' + REPLACE($2, ' ', '') + ',%'
      `, [studioId, playerName]),
      queryRows(`
        SELECT p.id, p.file_name AS fileName, a.id AS albumId, a.name AS albumName, p.created_at AS createdAt
        FROM photos p
        INNER JOIN albums a ON a.id = p.album_id
        WHERE a.studio_id = $1
          AND p.player_names IS NOT NULL
          AND ',' + REPLACE(p.player_names, ' ', '') + ',' LIKE '%,' + REPLACE($2, ' ', '') + ',%'
        ORDER BY p.created_at DESC, p.id DESC
        OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY
      `, [studioId, playerName]),
    ]);

    res.json({
      playerName,
      items: (rows || []).map(r => ({
        id: Number(r.id),
        fileName: r.fileName,
        albumId: Number(r.albumId),
        albumName: r.albumName,
      })),
      total: Number(countRow?.total || 0),
      page,
      pageSize,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/player-watchlist/available — all available players (public) ───
// Returns a deduplicated list of all players from all studio rosters
router.get('/available', async (req, res) => {
  try {
    // Optionally filter by studioSlug or studioId
    let studioId = null;
    if (req.query.studioId) {
      studioId = Number(req.query.studioId);
    } else if (req.query.studioSlug) {
      const studio = await queryRow(
        `SELECT id FROM studios WHERE public_slug = $1`,
        [req.query.studioSlug]
      );
      studioId = studio?.id || null;
    }

    let rows;
    if (studioId) {
      rows = await queryRows(
        `SELECT DISTINCT player_name as playerName, player_number as playerNumber
         FROM studio_player_roster
         WHERE studio_id = $1
         ORDER BY player_name`,
        [studioId]
      );
    } else {
      rows = await queryRows(
        `SELECT DISTINCT player_name as playerName, player_number as playerNumber
         FROM studio_player_roster
         ORDER BY player_name`
      );
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
