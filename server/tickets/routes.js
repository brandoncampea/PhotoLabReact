import express from 'express';
import mssql from '../mssql.cjs';
import { requireStudioOrSuperAdmin } from '../middleware/auth.js';
import { sendEmail } from '../services/emailService.js';
const { query, queryRow, queryRows } = mssql;
const router = express.Router();

// POST /api/tickets/guest — unauthenticated submission, honeypot spam protection
router.post('/guest', async (req, res) => {
  const { subject, description, guestName, guestEmail, honeypot, meta } = req.body;

  // Honeypot: bots fill hidden fields, humans don't
  if (honeypot) return res.status(200).json({ ok: true }); // silent discard

  if (!subject?.trim() || !description?.trim()) {
    return res.status(400).json({ error: 'Subject and description are required.' });
  }

  const metaJson = JSON.stringify({
    ...(meta && typeof meta === 'object' ? meta : {}),
    guest: { name: guestName || null, email: guestEmail || null },
  });

  try {
    const inserted = await queryRow(
      `INSERT INTO tickets (subject, description, created_by, created_for_studio, status, escalated, comments, history, meta)
       VALUES ($1, $2, NULL, NULL, 'open', 0, '[]', '[]', $3) RETURNING id`,
      [subject.trim(), description.trim(), metaJson]
    );
    const ticket = await queryRow(`SELECT * FROM tickets WHERE id = $1`, [inserted?.id]);
    res.status(201).json(formatTicket(ticket));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tickets/counts — badge counts for nav (no auth required; returns zeros when unauthenticated)
router.get('/counts', async (req, res) => {
  const { user } = req;
  try {
    if (user?.role === 'super_admin') {
      const row = await queryRow(
        `SELECT
          SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS openCount,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pendingCount,
          SUM(CASE WHEN escalated = 1 THEN 1 ELSE 0 END) AS escalatedCount
        FROM tickets WHERE status != 'closed'`,
        []
      );
      return res.json({
        open: Number(row?.openCount || 0),
        pending: Number(row?.pendingCount || 0),
        escalated: Number(row?.escalatedCount || 0),
        total: Number(row?.openCount || 0) + Number(row?.pendingCount || 0),
      });
    } else if (user?.role === 'studio_admin' && user.studio_id) {
      const row = await queryRow(
        `SELECT
          SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS openCount,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pendingCount
        FROM tickets WHERE status != 'closed' AND created_for_studio = $1`,
        [user.studio_id]
      );
      return res.json({
        open: Number(row?.openCount || 0),
        pending: Number(row?.pendingCount || 0),
        escalated: 0,
        total: Number(row?.openCount || 0) + Number(row?.pendingCount || 0),
      });
    }
    return res.json({ open: 0, pending: 0, escalated: 0, total: 0 });
  } catch {
    return res.json({ open: 0, pending: 0, escalated: 0, total: 0 });
  }
});

router.use(requireStudioOrSuperAdmin);

function parseJsonArray(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const arr = JSON.parse(val);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseJsonSafe(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return null; }
}

function formatTicket(ticket) {
  return {
    ...ticket,
    comments: parseJsonArray(ticket.comments),
    history: parseJsonArray(ticket.history),
    meta: parseJsonSafe(ticket.meta),
    escalated: ticket.escalated === true || ticket.escalated === 1,
  };
}

// GET /api/tickets/mine — studio admin: tickets for their studio
router.get('/mine', async (req, res) => {
  const studioId = req.user?.studio_id;
  if (!studioId) return res.status(403).json({ error: 'No studio associated with this account' });
  try {
    const rows = await queryRows(
      `SELECT t.*, s.name AS studio_name, u.name AS created_by_name, u.email AS created_by_email
       FROM tickets t
       LEFT JOIN studios s ON s.id = t.created_for_studio
       LEFT JOIN users u ON u.id = t.created_by
       WHERE t.created_for_studio = $1
       ORDER BY t.created_at DESC`,
      [studioId]
    );
    res.json({ tickets: (rows || []).map(formatTicket) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tickets/all — super admin: all tickets
router.get('/all', async (req, res) => {
  try {
    const rows = await queryRows(
      `SELECT t.*,
        u.name AS created_by_name,
        s.name AS studio_name,
        u.email AS created_by_email,
        s.email AS studio_email
      FROM tickets t
      LEFT JOIN users u ON t.created_by = u.id
      LEFT JOIN studios s ON t.created_for_studio = s.id
      ORDER BY t.created_at DESC`,
      []
    );
    res.json({ tickets: (rows || []).map(formatTicket) });
  } catch (err) {
    console.error('[tickets/all] Error:', err?.stack || err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// POST /api/tickets — create a new ticket
router.post('/', async (req, res) => {
  const { subject, description, meta } = req.body;
  if (!subject?.trim() || !description?.trim()) {
    return res.status(400).json({ error: 'Subject and description are required' });
  }
  const createdBy = req.user?.id || null;
  const studioId = req.user?.studio_id || null;
  const metaJson = meta && typeof meta === 'object' ? JSON.stringify(meta) : '{}';
  try {
    const inserted = await queryRow(
      `INSERT INTO tickets (subject, description, created_by, created_for_studio, status, escalated, comments, history, meta)
       VALUES ($1, $2, $3, $4, 'open', 0, '[]', '[]', $5) RETURNING id`,
      [subject.trim(), description.trim(), createdBy, studioId, metaJson]
    );
    const ticket = await queryRow(
      `SELECT t.*, s.name AS studio_name, u.name AS created_by_name
       FROM tickets t
       LEFT JOIN studios s ON s.id = t.created_for_studio
       LEFT JOIN users u ON u.id = t.created_by
       WHERE t.id = $1`,
      [inserted?.id]
    );
    res.status(201).json(formatTicket(ticket));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tickets/:id — get a single ticket
router.get('/:id', async (req, res) => {
  const ticketId = req.params.id;
  try {
    const ticket = await queryRow(
      `SELECT t.*, u.name AS created_by_name, s.name AS studio_name
       FROM tickets t
       LEFT JOIN users u ON t.created_by = u.id
       LEFT JOIN studios s ON t.created_for_studio = s.id
       WHERE t.id = $1`,
      [ticketId]
    );
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json(formatTicket(ticket));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tickets/:id/comment — add a comment
router.post('/:id/comment', async (req, res) => {
  const ticketId = req.params.id;
  const { authorId, authorType, message } = req.body;
  if (!authorId || !authorType || !message) {
    return res.status(400).json({ error: 'Missing required fields: authorId, authorType, message' });
  }
  try {
    const ticket = await queryRow('SELECT * FROM tickets WHERE id = $1', [ticketId]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const comments = parseJsonArray(ticket.comments);

    let authorName = '';
    if (authorType === 'customer' || authorType === 'studio') {
      const user = await queryRow('SELECT name, email FROM users WHERE id = $1', [authorId]);
      authorName = user?.name || 'Studio';
    } else {
      const user = await queryRow('SELECT name, email FROM users WHERE id = $1', [authorId]);
      authorName = user?.name || 'Support';
    }

    const newComment = { authorId, authorType, authorName, message, createdAt: new Date().toISOString() };
    comments.push(newComment);
    await query(
      'UPDATE tickets SET comments = $1, updated_at = SYSDATETIME() WHERE id = $2',
      [JSON.stringify(comments), ticketId]
    );

    try {
      const { MailtrapClient } = await import('mailtrap');
      const mailtrapToken = String(process.env.MAILTRAP_API_KEY || '').trim();
      const mailtrapSenderEmail = String(process.env.MAILTRAP_SENDER_EMAIL || '').trim();
      const mailtrapSenderName = String(process.env.MAILTRAP_SENDER_NAME || '').trim() || 'Photo Lab';
      const smtpReplyTo = String(process.env.SMTP_REPLY_TO || '').trim() || undefined;
      const mailtrapClient = mailtrapToken ? new MailtrapClient({ token: mailtrapToken }) : null;

      let studioEmail = null;
      if (ticket.created_for_studio) {
        const studio = await queryRow('SELECT email FROM studios WHERE id = $1', [ticket.created_for_studio]);
        studioEmail = studio?.email || null;
      }
      let customerEmail = null;
      if (ticket.created_by) {
        const user = await queryRow('SELECT email FROM users WHERE id = $1', [ticket.created_by]);
        customerEmail = user?.email || null;
      }
      const recipients = Array.from(new Set([studioEmail, customerEmail].filter(Boolean)));
      if (recipients.length > 0 && mailtrapClient && mailtrapSenderEmail) {
        await mailtrapClient.send({
          from: { email: mailtrapSenderEmail, name: mailtrapSenderName },
          to: recipients.map(email => ({ email })),
          subject: `New Comment on Ticket: ${ticket.subject}`,
          html: `<p>A new comment was added by <b>${authorName}</b>:</p><blockquote>${message}</blockquote><p><b>Ticket:</b> ${ticket.subject}</p>`,
          text: `A new comment was added by ${authorName}:\n${message}\n\nTicket: ${ticket.subject}`,
          reply_to: smtpReplyTo,
          category: 'Ticket Comment',
        });
      }
    } catch (err) {
      console.error('Failed to send comment notification email:', err);
    }

    const updated = await queryRow('SELECT * FROM tickets WHERE id = $1', [ticketId]);
    res.json(formatTicket(updated));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/tickets/:id — update status, assigned_to, escalated
router.patch('/:id', async (req, res) => {
  const ticketId = req.params.id;
  const { status, assigned_to, escalated, by } = req.body;
  if (status === undefined && assigned_to === undefined && escalated === undefined) {
    return res.status(400).json({ error: 'No updatable fields provided' });
  }
  try {
    // Read current state before update so we can detect escalation transitions
    const before = await queryRow(
      `SELECT t.*, s.name AS studio_name, s.email AS studio_email
       FROM tickets t LEFT JOIN studios s ON s.id = t.created_for_studio
       WHERE t.id = $1`,
      [ticketId]
    );

    const fields = [];
    const values = [];
    if (status !== undefined) {
      fields.push('status = $' + (values.length + 1));
      values.push(status);
    }
    if (assigned_to !== undefined) {
      fields.push('assigned_to = $' + (values.length + 1));
      values.push(assigned_to);
    }
    if (escalated !== undefined) {
      fields.push('escalated = $' + (values.length + 1));
      values.push(escalated ? 1 : 0);
    }
    fields.push('updated_at = SYSDATETIME()');
    await query(
      `UPDATE tickets SET ${fields.join(', ')} WHERE id = $${values.length + 1}`,
      [...values, ticketId]
    );

    if (by && (status !== undefined || escalated !== undefined)) {
      const ticket = await queryRow('SELECT * FROM tickets WHERE id = $1', [ticketId]);
      const history = parseJsonArray(ticket.history);
      history.push({ by, status, escalated, changedAt: new Date().toISOString() });
      await query('UPDATE tickets SET history = $1 WHERE id = $2', [JSON.stringify(history), ticketId]);
    }

    // Send escalation email to all super admins when a ticket is newly escalated
    const wasEscalated = before?.escalated === true || before?.escalated === 1;
    if (escalated === true && !wasEscalated && before) {
      try {
        const superAdmins = await queryRows(
          `SELECT email, name FROM users WHERE role = 'super_admin' AND email IS NOT NULL AND email != ''`,
          []
        );
        const recipients = (superAdmins || []).map(r => r.email).filter(Boolean);
        if (recipients.length) {
          const studioName = before.studio_name || 'Unknown Studio';
          const subject = `🚨 Ticket Escalated: ${before.subject}`;
          const html = `
            <h2 style="color:#b91c1c">Ticket Escalated</h2>
            <p><b>Subject:</b> ${before.subject}</p>
            <p><b>Studio:</b> ${studioName}</p>
            <p><b>Status:</b> ${before.status || 'open'}</p>
            <p><b>Description:</b></p>
            <blockquote style="border-left:3px solid #b91c1c;padding-left:12px;color:#555">
              ${String(before.description || '').replace(/\n/g, '<br>')}
            </blockquote>
            <p style="margin-top:16px">
              <a href="${process.env.APP_URL || 'https://labs.campeaphotography.com'}/admin/tickets"
                 style="background:#4f46e5;color:#fff;padding:8px 18px;border-radius:6px;text-decoration:none;font-weight:bold">
                View Ticket
              </a>
            </p>
          `;
          const text = `Ticket Escalated\n\nSubject: ${before.subject}\nStudio: ${studioName}\nStatus: ${before.status || 'open'}\n\n${before.description || ''}`;
          await sendEmail({ to: recipients, subject, html, text });
        }
      } catch (emailErr) {
        console.error('[tickets] Failed to send escalation email:', emailErr?.message || emailErr);
      }
    }

    const updated = await queryRow('SELECT * FROM tickets WHERE id = $1', [ticketId]);
    res.json(formatTicket(updated));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
