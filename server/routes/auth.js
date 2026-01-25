import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { queryRow, query } from '../postgres.js';
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, name } = req.body;

    // Normalize name fields for storage and response
    const safeFirst = (firstName || '').trim();
    const safeLast = (lastName || '').trim();
    const fullName = (name || `${safeFirst} ${safeLast}`.trim()).trim();

    if (!fullName) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    // Check if user exists
    const existingUser = await queryRow('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const result = await queryRow(`
      INSERT INTO users (email, password, name, role, is_active)
      VALUES ($1, $2, $3, 'customer', true)
      RETURNING id
    `, [email, hashedPassword, fullName]);

    // Build response user matching frontend expectations
    const responseUser = {
      id: result.id,
      email,
      firstName: safeFirst || fullName,
      lastName: safeLast || '',
      role: 'customer',
      isActive: true,
    };
    
    // Generate token
    const token = jwt.sign({ userId: responseUser.id, email: responseUser.email }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ user: responseUser, token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await queryRow('SELECT * FROM users WHERE email = $1', [email]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login timestamp
    await query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    // Split stored name into first/last for the frontend
    const nameParts = (user.name || '').trim().split(' ');
    const parsedFirst = nameParts.shift() || '';
    const parsedLast = nameParts.join(' ').trim();

    // Generate token
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ 
      user: { 
        id: user.id, 
        email: user.email, 
        firstName: parsedFirst,
        lastName: parsedLast,
        role: user.role || 'customer',
        isActive: user.is_active !== undefined ? !!user.is_active : true,
      },
      token 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
