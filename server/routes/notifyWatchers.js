import express from 'express';
import mssql from '../mssql.cjs';
import { MailtrapClient } from 'mailtrap';
import { authRequired } from '../middleware/auth.js';

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

    // Get all tagged players in the album
    const taggedPlayersRows = await queryRows(
      `SELECT DISTINCT TRIM(player_name) as playerName
         FROM photos
        WHERE album_id = $1 AND player_names IS NOT NULL AND TRIM(player_names) <> ''`,
      [albumId]
    );
    const taggedPlayers = taggedPlayersRows.map(r => r.playerName).filter(Boolean);
    if (!taggedPlayers.length) return res.json({ notified: 0, message: 'No tagged players in album.' });

    // Get all users watching any of these players
    const watchers = await queryRows(
      `SELECT DISTINCT u.email, u.first_name, u.last_name, cpw.player_name
         FROM customer_player_watchlist cpw
         JOIN users u ON u.id = cpw.user_id
        WHERE cpw.player_name IN (${taggedPlayers.map((_, i) => `$${i + 2}`).join(',')})`,
      [albumId, ...taggedPlayers]
    );
    if (!watchers.length) return res.json({ notified: 0, message: 'No watchers for tagged players.' });

    // Send emails
    let sent = 0;
    for (const watcher of watchers) {
      if (!mailtrapClient) continue;
      await mailtrapClient.send({
        from: { email: mailtrapSenderEmail, name: mailtrapSenderName },
        to: [{ email: watcher.email, name: `${watcher.first_name} ${watcher.last_name}` }],
        subject: `New photo for ${watcher.player_name}`,
        text: `A new photo has been added for ${watcher.player_name}. Log in to view the album.`,
        category: 'player-photo-notify',
      });
      sent++;
    }
    res.json({ notified: sent, message: `Notified ${sent} watchers.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
