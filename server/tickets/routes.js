
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
router.post('/', (req, res) => {
  res.status(501).json({ error: 'Not implemented: create ticket (MSSQL)' });
});
router.post('/:id/comment', (req, res) => {
  res.status(501).json({ error: 'Not implemented: add comment (MSSQL)' });
});
router.patch('/:id', (req, res) => {
  res.status(501).json({ error: 'Not implemented: update ticket (MSSQL)' });
});

export default router;
