
import express from 'express';
import mssql from '../mssql.cjs';
import { MailtrapClient } from 'mailtrap';
import { authRequired } from '../middleware/auth.js';
import orderReceiptService from '../services/orderReceiptService.js';

const router = express.Router();
const { queryRows, queryRow } = mssql;

const mailtrapToken = String(process.env.MAILTRAP_API_KEY || '').trim();
const mailtrapSenderEmail = String(process.env.MAILTRAP_SENDER_EMAIL || '').trim();
const mailtrapSenderName = String(process.env.MAILTRAP_SENDER_NAME || '').trim() || 'Photo Lab';
const mailtrapClient = mailtrapToken ? new MailtrapClient({ token: mailtrapToken }) : null;

// POST /api/notify-watchers
router.post('/', authRequired, async (req, res) => {
  try {
    const { albumId } = req.body;
    if (!albumId) return res.status(400).json({ error: 'albumId required' });

    // Get album info for URL and name
    const album = await queryRow(`
      SELECT a.id, a.name, a.title, a.studio_id, s.public_slug as studioSlug
      FROM albums a
      LEFT JOIN studios s ON s.id = a.studio_id
      WHERE a.id = $1
    `, [albumId]);
    if (!album) return res.status(404).json({ error: 'Album not found' });
    const albumName = album.name || album.title || '';
    const studioSlug = album.studioSlug;
    const appBaseUrl = process.env.APP_BASE_URL || process.env.BASE_URL || '';
    const albumUrl = (appBaseUrl && studioSlug) ? `${appBaseUrl.replace(/\/$/, '')}/s/${studioSlug}/albums/${albumId}` : '';

    // Get all tagged players in the album
    const taggedPlayersRows = await queryRows(
      `SELECT DISTINCT TRIM(player_name) as playerName
         FROM photos
        WHERE album_id = $1 AND player_names IS NOT NULL AND TRIM(player_names) <> ''`,
      [albumId]
    );
    const taggedPlayers = taggedPlayersRows.map(r => r.playerName).filter(Boolean);

    // Get all tagged schools and categories in the album
    const taggedSchoolsRows = await queryRows(
      `SELECT DISTINCT p.school_id as schoolId, s.name as schoolName, p.category
         FROM photos p
         JOIN schools s ON s.id = p.school_id
        WHERE p.album_id = $1 AND p.school_id IS NOT NULL AND p.category IS NOT NULL`,
      [albumId]
    );
    const taggedSchools = taggedSchoolsRows.map(r => ({ schoolId: r.schoolId, schoolName: r.schoolName, category: r.category })).filter(r => r.schoolId && r.category);

    // Get all users watching any of these players
    let watchers = [];
    if (taggedPlayers.length) {
      const playerWatchers = await queryRows(
        `SELECT DISTINCT u.email, u.first_name, u.last_name, cpw.player_name
           FROM customer_player_watchlist cpw
           JOIN users u ON u.id = cpw.user_id
          WHERE cpw.player_name IN (${taggedPlayers.map((_, i) => `$${i + 2}`).join(',')})`,
        [albumId, ...taggedPlayers]
      );
      watchers = watchers.concat(playerWatchers.map(w => ({ ...w, type: 'player' })));
    }

    // Get all users watching any of these schools/categories
    if (taggedSchools.length) {
      for (const school of taggedSchools) {
        const schoolWatchers = await queryRows(
          `SELECT DISTINCT u.email, u.first_name, u.last_name, csw.school_id, csw.category
             FROM customer_school_watchlist csw
             JOIN users u ON u.id = csw.user_id
            WHERE csw.school_id = $2 AND csw.category = $3`,
          [albumId, school.schoolId, school.category]
        );
        watchers = watchers.concat(schoolWatchers.map(w => ({ ...w, type: 'school', schoolName: school.schoolName, category: school.category })));
      }
    }

    if (!watchers.length) return res.json({ notified: 0, message: 'No watchers for tagged players or schools.' });

    // Send emails using orderReceiptService for correct album URL
    let sent = 0;
    for (const watcher of watchers) {
      if (watcher.type === 'player') {
        await orderReceiptService.sendPlayerPhotoNotification({
          to: watcher.email,
          customerName: `${watcher.first_name} ${watcher.last_name}`.trim(),
          playerName: watcher.player_name,
          albumName,
          albumUrl,
        });
      } else {
        // For school watchers, just send a simple email for now (could be improved)
        await orderReceiptService.sendPlayerPhotoNotification({
          to: watcher.email,
          customerName: `${watcher.first_name} ${watcher.last_name}`.trim(),
          playerName: watcher.schoolName,
          albumName,
          albumUrl,
        });
      }
      sent++;
    }
    res.json({ notified: sent, message: `Notified ${sent} watchers.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
