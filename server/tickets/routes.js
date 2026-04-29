
import express from 'express';
import mssql from '../mssql.cjs';
const { query, queryRow } = mssql;
const router = express.Router();

// GET /api/tickets/all - List all tickets (super admin)
router.get('/all', async (req, res) => {
  try {
    const tickets = await query(
      'SELECT * FROM tickets ORDER BY created_at DESC',
      []
    );
    res.json(tickets.rows || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tickets/:id - Get ticket by ID
router.get('/:id', async (req, res) => {
  try {
    const ticket = await queryRow('SELECT * FROM tickets WHERE id = $1', [req.params.id]);
    if (!ticket) return res.status(404).json({ error: 'Not found' });
    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// TODO: Implement create, comment, update endpoints using MSSQL
// POST /api/tickets - Create a new ticket
router.post('/', async (req, res) => {
  try {
    const { subject, description, created_by, created_for_studio, assigned_to, status, escalated, meta } = req.body;
    if (!subject || !description || !created_by) {
      return res.status(400).json({ error: 'Missing required fields: subject, description, created_by' });
    }
    const result = await queryRow(
      `INSERT INTO tickets (subject, description, created_by, created_for_studio, assigned_to, status, escalated, comments, history, meta, created_at, updated_at)
       OUTPUT INSERTED.*
       VALUES (@subject, @description, @created_by, @created_for_studio, @assigned_to, @status, @escalated, @comments, @history, @meta, SYSDATETIME(), SYSDATETIME())`,
      {
        subject,
        description,
        created_by,
        created_for_studio: created_for_studio || null,
        assigned_to: assigned_to || null,
        status: status || 'open',
        escalated: escalated ? 1 : 0,
        comments: JSON.stringify([]),
        history: JSON.stringify([]),
        meta: meta ? JSON.stringify(meta) : null,
      }
    );
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.post('/:id/comment', (req, res) => {
  res.status(501).json({ error: 'Not implemented: add comment (MSSQL)' });
});
router.patch('/:id', (req, res) => {
  res.status(501).json({ error: 'Not implemented: update ticket (MSSQL)' });
});

export default router;
