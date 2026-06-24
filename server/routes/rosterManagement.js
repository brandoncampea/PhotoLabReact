import express from 'express';
import mssql from '../mssql.cjs';
import { adminRequired } from '../middleware/auth.js';

const { queryRow, queryRows, query } = mssql;
const router = express.Router();

// Resolve the studio ID for the current user (studio admin or super admin acting as studio)
const getStudioId = (req) => {
  const id = Number(req.user?.studio_id);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// ─── SCHOOLS ─────────────────────────────────────────────────────────────────

// List all schools for the studio with usage counts
router.get('/schools', adminRequired, async (req, res) => {
  const studioId = getStudioId(req);
  if (!studioId) return res.status(403).json({ error: 'No studio context' });
  try {
    const rows = await queryRows(`
      SELECT
        ssr.id,
        ssr.school_name AS schoolName,
        (
          SELECT COUNT(*)
          FROM albums a
          WHERE a.studio_id = $1
            AND a.school_tags IS NOT NULL
            AND ',' + REPLACE(a.school_tags, ' ', '') + ',' LIKE '%,' + REPLACE(ssr.school_name, ' ', '') + ',%'
        ) AS albumCount,
        (
          SELECT COUNT(*)
          FROM customer_school_watchlist csw
          WHERE csw.school_id = ssr.school_name
        ) AS watchlistCount
      FROM studio_school_roster ssr
      WHERE ssr.studio_id = $1
      ORDER BY ssr.school_name
    `, [studioId]);
    res.json(rows.map(r => ({
      id: Number(r.id),
      schoolName: r.schoolName,
      albumCount: Number(r.albumCount || 0),
      watchlistCount: Number(r.watchlistCount || 0),
    })));
  } catch (err) {
    console.error('[roster] GET /schools error:', err);
    res.status(500).json({ error: 'Failed to fetch schools' });
  }
});

// Rename a school — cascades to albums, watchlist
router.put('/schools/:id', adminRequired, async (req, res) => {
  const studioId = getStudioId(req);
  if (!studioId) return res.status(403).json({ error: 'No studio context' });
  const id = Number(req.params.id);
  const { newName } = req.body;
  if (!newName?.trim()) return res.status(400).json({ error: 'newName is required' });
  const trimmed = newName.trim();

  try {
    const existing = await queryRow(
      `SELECT school_name FROM studio_school_roster WHERE id = $1 AND studio_id = $2`,
      [id, studioId]
    );
    if (!existing) return res.status(404).json({ error: 'School not found' });
    const oldName = existing.school_name;
    if (oldName.toLowerCase() === trimmed.toLowerCase())
      return res.json({ ok: true, affected: { albums: 0, watchlist: 0 } });

    // Check for duplicate
    const dup = await queryRow(
      `SELECT id FROM studio_school_roster WHERE studio_id = $1 AND LOWER(school_name) = LOWER($2) AND id != $3`,
      [studioId, trimmed, id]
    );
    if (dup) return res.status(409).json({ error: 'A school with that name already exists' });

    // 1. Update roster
    await query(
      `UPDATE studio_school_roster SET school_name = $1, updated_at = GETDATE() WHERE id = $2 AND studio_id = $3`,
      [trimmed, id, studioId]
    );

    // 2. Cascade to albums.school_tags
    const albums = await queryRows(
      `SELECT id, school_tags FROM albums WHERE studio_id = $1 AND school_tags IS NOT NULL`,
      [studioId]
    );
    let albumsUpdated = 0;
    for (const album of albums) {
      const tags = parseTagList(album.school_tags);
      const idx = tags.findIndex(t => t.toLowerCase() === oldName.toLowerCase());
      if (idx === -1) continue;
      tags[idx] = trimmed;
      await query(
        `UPDATE albums SET school_tags = $1 WHERE id = $2`,
        [tags.join(', '), album.id]
      );
      albumsUpdated++;
    }

    // 3. Cascade to customer_school_watchlist
    const wlResult = await query(
      `UPDATE customer_school_watchlist SET school_id = $1 WHERE LOWER(school_id) = LOWER($2)`,
      [trimmed, oldName]
    );
    const watchlistUpdated = wlResult?.rowsAffected?.[0] ?? 0;

    res.json({ ok: true, affected: { albums: albumsUpdated, watchlist: watchlistUpdated } });
  } catch (err) {
    console.error('[roster] PUT /schools/:id error:', err);
    res.status(500).json({ error: 'Failed to rename school' });
  }
});

// Delete a school — cascades to albums, watchlist
router.delete('/schools/:id', adminRequired, async (req, res) => {
  const studioId = getStudioId(req);
  if (!studioId) return res.status(403).json({ error: 'No studio context' });
  const id = Number(req.params.id);

  try {
    const existing = await queryRow(
      `SELECT school_name FROM studio_school_roster WHERE id = $1 AND studio_id = $2`,
      [id, studioId]
    );
    if (!existing) return res.status(404).json({ error: 'School not found' });
    const oldName = existing.school_name;

    // 1. Delete from roster
    await query(
      `DELETE FROM studio_school_roster WHERE id = $1 AND studio_id = $2`,
      [id, studioId]
    );

    // 2. Remove from albums.school_tags
    const albums = await queryRows(
      `SELECT id, school_tags FROM albums WHERE studio_id = $1 AND school_tags IS NOT NULL`,
      [studioId]
    );
    let albumsUpdated = 0;
    for (const album of albums) {
      const tags = parseTagList(album.school_tags);
      const filtered = tags.filter(t => t.toLowerCase() !== oldName.toLowerCase());
      if (filtered.length === tags.length) continue;
      await query(
        `UPDATE albums SET school_tags = $1 WHERE id = $2`,
        [filtered.length ? filtered.join(', ') : null, album.id]
      );
      albumsUpdated++;
    }

    // 3. Delete from customer watchlist
    await query(
      `DELETE FROM customer_school_watchlist WHERE LOWER(school_id) = LOWER($1)`,
      [oldName]
    );

    res.json({ ok: true, affected: { albums: albumsUpdated } });
  } catch (err) {
    console.error('[roster] DELETE /schools/:id error:', err);
    res.status(500).json({ error: 'Failed to delete school' });
  }
});

// ─── PLAYERS ─────────────────────────────────────────────────────────────────

// List all players for the studio with usage counts
router.get('/players', adminRequired, async (req, res) => {
  const studioId = getStudioId(req);
  if (!studioId) return res.status(403).json({ error: 'No studio context' });
  try {
    const rows = await queryRows(`
      SELECT
        spr.id,
        spr.player_name AS playerName,
        spr.player_number AS playerNumber,
        spr.roster_name AS rosterName,
        (
          SELECT COUNT(*)
          FROM photos p
          INNER JOIN albums a ON a.id = p.album_id
          WHERE a.studio_id = $1
            AND p.player_names IS NOT NULL
            AND ',' + REPLACE(p.player_names, ' ', '') + ',' LIKE '%,' + REPLACE(spr.player_name, ' ', '') + ',%'
        ) AS photoCount,
        (
          SELECT COUNT(*)
          FROM customer_player_watchlist cpw
          WHERE cpw.studio_id = $1
            AND LOWER(cpw.player_name) = LOWER(spr.player_name)
        ) AS watchlistCount
      FROM studio_player_roster spr
      WHERE spr.studio_id = $1
      ORDER BY spr.player_name
    `, [studioId]);
    res.json(rows.map(r => ({
      id: Number(r.id),
      playerName: r.playerName,
      playerNumber: r.playerNumber || null,
      rosterName: r.rosterName || null,
      photoCount: Number(r.photoCount || 0),
      watchlistCount: Number(r.watchlistCount || 0),
    })));
  } catch (err) {
    console.error('[roster] GET /players error:', err);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// Rename a player — cascades to photos, watchlist, face signatures
router.put('/players/:id', adminRequired, async (req, res) => {
  const studioId = getStudioId(req);
  if (!studioId) return res.status(403).json({ error: 'No studio context' });
  const id = Number(req.params.id);
  const { newName, newNumber } = req.body;
  if (!newName?.trim()) return res.status(400).json({ error: 'newName is required' });
  const trimmedName = newName.trim();
  const trimmedNumber = newNumber?.trim() || null;

  try {
    const existing = await queryRow(
      `SELECT player_name, player_number FROM studio_player_roster WHERE id = $1 AND studio_id = $2`,
      [id, studioId]
    );
    if (!existing) return res.status(404).json({ error: 'Player not found' });
    const oldName = existing.player_name;
    const oldNumber = existing.player_number;

    // Check for duplicate (ignore self)
    const dup = await queryRow(
      `SELECT id FROM studio_player_roster WHERE studio_id = $1 AND LOWER(player_name) = LOWER($2) AND id != $3`,
      [studioId, trimmedName, id]
    );
    if (dup) return res.status(409).json({ error: 'A player with that name already exists' });

    const nameChanged = oldName.toLowerCase() !== trimmedName.toLowerCase();
    const numberChanged = (oldNumber || '') !== (trimmedNumber || '');
    if (!nameChanged && !numberChanged) return res.json({ ok: true, affected: { photos: 0, watchlist: 0 } });

    // 1. Update roster
    await query(
      `UPDATE studio_player_roster SET player_name = $1, player_number = $2, updated_at = GETDATE() WHERE id = $3 AND studio_id = $4`,
      [trimmedName, trimmedNumber, id, studioId]
    );

    // 2. Cascade to photos.player_names / player_numbers
    let photosUpdated = 0;
    if (nameChanged || numberChanged) {
      const photos = await queryRows(`
        SELECT p.id, p.player_names, p.player_numbers
        FROM photos p
        INNER JOIN albums a ON a.id = p.album_id
        WHERE a.studio_id = $1 AND p.player_names IS NOT NULL
      `, [studioId]);

      for (const photo of photos) {
        const names = parseTagList(photo.player_names);
        const numbers = parseTagList(photo.player_numbers || '');
        const idx = names.findIndex(n => n.toLowerCase() === oldName.toLowerCase());
        if (idx === -1) continue;
        if (nameChanged) names[idx] = trimmedName;
        if (numberChanged && idx < numbers.length) numbers[idx] = trimmedNumber || '';
        await query(
          `UPDATE photos SET player_names = $1, player_numbers = $2 WHERE id = $3`,
          [names.join(', '), numbers.join(', '), photo.id]
        );
        photosUpdated++;
      }
    }

    // 3. Cascade to customer_player_watchlist
    let watchlistUpdated = 0;
    if (nameChanged) {
      const wlResult = await query(
        `UPDATE customer_player_watchlist SET player_name = $1 WHERE studio_id = $2 AND LOWER(player_name) = LOWER($3)`,
        [trimmedName, studioId, oldName]
      );
      watchlistUpdated = wlResult?.rowsAffected?.[0] ?? 0;
    }

    // 4. Cascade to face signatures
    if (nameChanged) {
      await query(
        `UPDATE studio_player_face_signatures SET player_name = $1 WHERE studio_id = $2 AND LOWER(player_name) = LOWER($3)`,
        [trimmedName, studioId, oldName]
      );
    }

    res.json({ ok: true, affected: { photos: photosUpdated, watchlist: watchlistUpdated } });
  } catch (err) {
    console.error('[roster] PUT /players/:id error:', err);
    res.status(500).json({ error: 'Failed to rename player' });
  }
});

// Delete a player — cascades to photos, watchlist, face signatures
router.delete('/players/:id', adminRequired, async (req, res) => {
  const studioId = getStudioId(req);
  if (!studioId) return res.status(403).json({ error: 'No studio context' });
  const id = Number(req.params.id);

  try {
    const existing = await queryRow(
      `SELECT player_name FROM studio_player_roster WHERE id = $1 AND studio_id = $2`,
      [id, studioId]
    );
    if (!existing) return res.status(404).json({ error: 'Player not found' });
    const oldName = existing.player_name;

    // 1. Delete from roster
    await query(
      `DELETE FROM studio_player_roster WHERE id = $1 AND studio_id = $2`,
      [id, studioId]
    );

    // 2. Remove from photos
    const photos = await queryRows(`
      SELECT p.id, p.player_names, p.player_numbers
      FROM photos p
      INNER JOIN albums a ON a.id = p.album_id
      WHERE a.studio_id = $1 AND p.player_names IS NOT NULL
    `, [studioId]);

    let photosUpdated = 0;
    for (const photo of photos) {
      const names = parseTagList(photo.player_names);
      const numbers = parseTagList(photo.player_numbers || '');
      const idx = names.findIndex(n => n.toLowerCase() === oldName.toLowerCase());
      if (idx === -1) continue;
      names.splice(idx, 1);
      if (idx < numbers.length) numbers.splice(idx, 1);
      await query(
        `UPDATE photos SET player_names = $1, player_numbers = $2 WHERE id = $3`,
        [names.length ? names.join(', ') : null, numbers.length ? numbers.join(', ') : null, photo.id]
      );
      photosUpdated++;
    }

    // 3. Delete from watchlist
    await query(
      `DELETE FROM customer_player_watchlist WHERE studio_id = $1 AND LOWER(player_name) = LOWER($2)`,
      [studioId, oldName]
    );

    // 4. Delete face signatures
    await query(
      `DELETE FROM studio_player_face_signatures WHERE studio_id = $1 AND LOWER(player_name) = LOWER($2)`,
      [studioId, oldName]
    );

    res.json({ ok: true, affected: { photos: photosUpdated } });
  } catch (err) {
    console.error('[roster] DELETE /players/:id error:', err);
    res.status(500).json({ error: 'Failed to delete player' });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTagList(str) {
  if (!str) return [];
  return str.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
}

export default router;
