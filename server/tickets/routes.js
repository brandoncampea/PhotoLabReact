// Express routes for ticketing system

import express from 'express';
import Ticket from './model.js';
const router = express.Router();

// Create ticket
router.post('/', async (req, res) => {
  try {
    const ticket = new Ticket({ ...req.body, status: 'open', escalated: false });
    await ticket.save();
    res.status(201).json(ticket);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all tickets for studio or super admin
router.get('/', async (req, res) => {
  try {
    const { studioId, escalated } = req.query;
    let query = {};
    if (studioId) query.createdForStudio = studioId;
    if (escalated) query.escalated = escalated === 'true';
    const tickets = await Ticket.find(query).sort({ createdAt: -1 });
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single ticket
router.get('/:id', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Not found' });
    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add comment
router.post('/:id/comment', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Not found' });
    ticket.comments.push(req.body);
    ticket.history.push({ action: 'comment', by: req.body.authorId, timestamp: new Date(), details: req.body.message });
    ticket.updatedAt = new Date();
    await ticket.save();
    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update status or escalate
router.patch('/:id', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Not found' });
    if (req.body.status) ticket.status = req.body.status;
    if (req.body.escalated !== undefined) ticket.escalated = req.body.escalated;
    if (req.body.assignedTo) ticket.assignedTo = req.body.assignedTo;
    ticket.history.push({ action: 'update', by: req.body.by, timestamp: new Date(), details: JSON.stringify(req.body) });
    ticket.updatedAt = new Date();
    await ticket.save();
    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
