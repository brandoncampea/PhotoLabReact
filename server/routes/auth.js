import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mssql from '../mssql.cjs';
const { queryRow, query } = mssql;
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
    const result = await queryRow(
      `INSERT INTO users (email, password, name, role, is_active)
       VALUES ($1, $2, $3, 'customer', 1)
       RETURNING id`,
      [email, hashedPassword, fullName]
    );

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
    // Debug: log session at start of login
    console.log('[LOGIN] sessionID at start:', req.sessionID, 'session:', req.session);
    // Log connect.sid cookie value if present
    if (req.headers.cookie) {
      const sidMatch = req.headers.cookie.match(/connect\.sid=([^;]+)/);
      if (sidMatch) {
        console.log('[LOGIN] Parsed connect.sid from cookie:', decodeURIComponent(sidMatch[1]));
      }
    }
  try {
    const { email, password } = req.body;

    // Find user
    const user = await queryRow('SELECT * FROM users WHERE email = $1', [email]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    // Check password
    let validPassword;
    try {
      validPassword = await bcrypt.compare(password, user.password);
    } catch {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login timestamp (non-fatal — column may not exist on all deployments)
    query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]).catch(() => {});

    // Split stored name into first/last for the frontend
    const nameParts = (user.name || '').trim().split(' ');
    const parsedFirst = nameParts.shift() || '';
    const parsedLast = nameParts.join(' ').trim();

    // Set session userId for session-based auth
    req.session.userId = user.id;
    console.log('[LOGIN] sessionID after setting userId:', req.sessionID, 'session:', req.session);
    // Log connect.sid cookie value again after setting userId
    if (req.headers.cookie) {
      const sidMatch = req.headers.cookie.match(/connect\.sid=([^;]+)/);
      if (sidMatch) {
        console.log('[LOGIN] Parsed connect.sid from cookie (after userId):', decodeURIComponent(sidMatch[1]));
      }
    }

    // Generate token (for legacy/JWT clients)
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    // Ensure session is saved before sending response
    req.session.save(err => {
      if (err) {
        console.error('[LOGIN] Error saving session:', err);
        return res.status(500).json({ error: 'Session save error' });
      }
      console.log('[LOGIN] Session saved successfully:', req.sessionID, req.session);
      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: parsedFirst,
          lastName: parsedLast,
          role: user.role || 'customer',
          isActive: user.is_active !== undefined ? !!user.is_active : true,
          studioId: user.studio_id || undefined,
        },
        token,
      });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
