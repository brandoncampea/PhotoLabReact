import express from 'express';
import mssql from '../mssql.cjs';
import { sendEmail } from '../services/emailService.js';
const { query, queryRow } = mssql;
const router = express.Router();

// GET /api/tickets/all - List all tickets (super admin)
router.get('/all', async (req, res) => {
  try {
    const tickets = await query(
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
    // Parse comments/history fields and format created_at
    const parsedTickets = (tickets.rows || []).map(ticket => ({
      ...ticket,
      comments: parseJsonArray(ticket.comments),
      history: parseJsonArray(ticket.history),
      created_by_name: ticket.created_by_name || '-',
      studio_name: ticket.studio_name || '-',
      created_at: ticket.created_at ? new Date(ticket.created_at).toLocaleString() : '-',
    }));
    res.json({ tickets: parsedTickets });
  } catch (err) {
    console.error('[tickets/all] Error:', err && err.stack ? err.stack : err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// GET /api/tickets/:id - Get a single ticket by ID
router.get('/:id', async (req, res) => {
  const ticketId = req.params.id;
  try {
    const ticket = await queryRow('SELECT t.*, u.name AS created_by_name, s.name AS studio_name FROM tickets t LEFT JOIN users u ON t.created_by = u.id LEFT JOIN studios s ON t.created_for_studio = s.id WHERE t.id = $1', [ticketId]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    ticket.comments = parseJsonArray(ticket.comments);
    ticket.history = parseJsonArray(ticket.history);
    ticket.created_by_name = ticket.created_by_name || '-';
    ticket.studio_name = ticket.studio_name || '-';
    ticket.created_at = ticket.created_at ? new Date(ticket.created_at).toLocaleString() : '-';
    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to safely parse JSON arrays
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

// ...existing code...

// POST /api/tickets/:id/comment - Add a comment to a ticket
router.post('/:id/comment', async (req, res) => {
  const ticketId = req.params.id;
  const { authorId, authorType, message } = req.body;
  if (!authorId || !authorType || !message) {
    return res.status(400).json({ error: 'Missing required fields: authorId, authorType, message' });
  }
  try {
    // Fetch ticket, studio, and customer info
    const ticket = await queryRow('SELECT * FROM tickets WHERE id = $1', [ticketId]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const comments = parseJsonArray(ticket.comments);

    // Fetch author name
    let authorName = '';
    if (authorType === 'customer') {
      const user = await queryRow('SELECT name, email FROM users WHERE id = $1', [authorId]);
      authorName = user?.name || 'Customer';
    } else if (authorType === 'studio') {
      const studio = await queryRow('SELECT name, email FROM studios WHERE id = $1', [authorId]);
      authorName = studio?.name || 'Studio';
    } else {
      authorName = authorType;
    }

    const newComment = {
      authorId,
      authorType,
      authorName,
      message,
      createdAt: new Date().toISOString(),
    };
    comments.push(newComment);
    // Update comments in DB
    await query(
      'UPDATE tickets SET comments = $1, updated_at = SYSDATETIME() WHERE id = $2',
      [JSON.stringify(comments), ticketId]
    );

    // Email notification to studio and customer using Mailtrap API (orderReceiptService logic)
    try {
      // Lazy import to avoid circular dependency
      const { MailtrapClient } = await import('mailtrap');
      const mailtrapToken = String(process.env.MAILTRAP_API_KEY || '').trim();
      const mailtrapSenderEmail = String(process.env.MAILTRAP_SENDER_EMAIL || '').trim();
      const mailtrapSenderName = String(process.env.MAILTRAP_SENDER_NAME || '').trim() || 'Photo Lab';
      const smtpReplyTo = String(process.env.SMTP_REPLY_TO || '').trim() || undefined;
      const mailtrapClient = mailtrapToken ? new MailtrapClient({ token: mailtrapToken }) : null;
      // Get studio email
      let studioEmail = null;
      if (ticket.created_for_studio) {
        const studio = await queryRow('SELECT email FROM studios WHERE id = $1', [ticket.created_for_studio]);
        studioEmail = studio?.email || null;
      }
      // Get customer email
      let customerEmail = null;
      if (ticket.created_by) {
        const user = await queryRow('SELECT email FROM users WHERE id = $1', [ticket.created_by]);
        customerEmail = user?.email || null;
      }
      // Deduplicate recipients to avoid Mailtrap API error
      const recipients = Array.from(new Set([studioEmail, customerEmail].filter(Boolean)));
      if (recipients.length > 0 && mailtrapClient && mailtrapSenderEmail) {
        await mailtrapClient.send({
          from: {
            email: mailtrapSenderEmail,
            name: mailtrapSenderName,
          },
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

    // Return updated ticket
    const updated = await queryRow('SELECT * FROM tickets WHERE id = $1', [ticketId]);
    updated.comments = parseJsonArray(updated.comments);
    updated.history = parseJsonArray(updated.history);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tickets/all - List all tickets (super admin)
router.get('/all', async (req, res) => {
  try {
    const tickets = await query(
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
    // Parse comments/history fields and format created_at
    const parsedTickets = (tickets.rows || []).map(ticket => ({
      ...ticket,
      comments: parseJsonArray(ticket.comments),
      history: parseJsonArray(ticket.history),
      created_by_name: ticket.created_by_name || '-',
      studio_name: ticket.studio_name || '-',
      created_at: ticket.created_at ? new Date(ticket.created_at).toLocaleString() : '-',
    }));
    res.json({ tickets: parsedTickets });
  } catch (err) {
    console.error('[tickets/all] Error:', err && err.stack ? err.stack : err);
    res.status(500).json({ error: err.message || String(err) });
  }
});
// ...existing code...
// ...existing code...
router.patch('/:id', async (req, res) => {
  const ticketId = req.params.id;
  const { status, assigned_to, escalated, by } = req.body;
  if (!status && !assigned_to && typeof escalated === 'undefined') {
    return res.status(400).json({ error: 'No updatable fields provided' });
  }
  try {
    // Build update fields and values
    const fields = [];
    const values = [];
    if (status) {
      fields.push('status = $' + (fields.length + 1));
      values.push(status);
    }
    if (typeof assigned_to !== 'undefined') {
      fields.push('assigned_to = $' + (fields.length + 1));
      values.push(assigned_to);
    }
    if (typeof escalated !== 'undefined') {
      fields.push('escalated = $' + (fields.length + 1));
      values.push(escalated);
    }
    fields.push('updated_at = SYSDATETIME()');
    // Update ticket
    await query(
      `UPDATE tickets SET ${fields.join(', ')} WHERE id = $${values.length + 1}`,
      [...values, ticketId]
    );
    // Optionally, add to history
    if (by && status) {
      const ticket = await queryRow('SELECT * FROM tickets WHERE id = $1', [ticketId]);
      const history = parseJsonArray(ticket.history);
      history.push({
        by,
        status,
        changedAt: new Date().toISOString(),
      });
      await query(
        'UPDATE tickets SET history = $1 WHERE id = $2',
        [JSON.stringify(history), ticketId]
      );
    }
    // Return updated ticket
    const updated = await queryRow('SELECT * FROM tickets WHERE id = $1', [ticketId]);
    updated.comments = parseJsonArray(updated.comments);
    updated.history = parseJsonArray(updated.history);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
