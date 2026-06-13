import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import mssql from '../mssql.cjs';
const { queryRow, queryRows, query } = mssql;
import { authRequired } from '../middleware/auth.js';
import { sendEmail } from '../services/emailService.js';

// Authenticated routes — mounted at /api/studios/:studioId/admin-invites (mergeParams: true)
export const invitesRouter = express.Router({ mergeParams: true });

const APP_URL = process.env.CANONICAL_APP_URL || 'https://labs.campeaphotography.com';

function canManageStudio(user, studioId) {
  return user.role === 'super_admin' ||
    (user.role === 'studio_admin' && Number(user.studio_id) === Number(studioId));
}

// GET /api/studios/:studioId/admin-invites — list pending invites
invitesRouter.get('/', authRequired, async (req, res) => {
  const { studioId } = req.params;
  if (!canManageStudio(req.user, studioId)) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  try {
    const invites = await queryRows(`
      SELECT
        i.id, i.email, i.name, i.expires_at as expiresAt,
        i.accepted_at as acceptedAt, i.created_at as createdAt,
        u.name as invitedByName
      FROM studio_admin_invites i
      LEFT JOIN users u ON i.invited_by = u.id
      WHERE i.studio_id = $1
      ORDER BY i.created_at DESC
    `, [studioId]);
    res.json(invites);
  } catch (err) {
    console.error('[invites] list error:', err);
    res.status(500).json({ error: 'Failed to fetch invites' });
  }
});

// POST /api/studios/:studioId/admin-invites — send invite
invitesRouter.post('/', authRequired, async (req, res) => {
  const { studioId } = req.params;
  if (!canManageStudio(req.user, studioId)) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const { email, name } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const studio = await queryRow('SELECT id, name FROM studios WHERE id = $1', [studioId]);
    if (!studio) return res.status(404).json({ error: 'Studio not found' });

    // Check if already an admin for this studio
    const existing = await queryRow(
      `SELECT id FROM users WHERE email = $1 AND studio_id = $2 AND role IN ('studio_admin','super_admin')`,
      [email, studioId]
    );
    if (existing) {
      return res.status(400).json({ error: 'This email is already an admin for this studio' });
    }

    // Cancel any existing pending invite for same studio+email
    await query(
      `UPDATE studio_admin_invites SET accepted_at = GETDATE()
       WHERE studio_id = $1 AND email = $2 AND accepted_at IS NULL AND expires_at > GETDATE()`,
      [studioId, email]
    );

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await query(`
      INSERT INTO studio_admin_invites (studio_id, email, name, token, invited_by, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [studioId, email, name || null, token, req.user.id, expiresAt]);

    const inviteLink = `${APP_URL}/accept-invite/${token}`;
    const inviterName = req.user.name || req.user.email;

    await sendEmail({
      to: email,
      subject: `You've been invited to manage ${studio.name} on Photo Lab`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#181a1b;color:#e0e0e0;border-radius:12px">
          <h2 style="color:#a78bfa;margin:0 0 8px 0">You're invited!</h2>
          <p style="color:#bdbdbd;margin:0 0 20px 0">
            <strong style="color:#e0e0e0">${inviterName}</strong> has invited you to become an admin
            for <strong style="color:#e0e0e0">${studio.name}</strong> on Photo Lab.
          </p>
          <a href="${inviteLink}" style="display:inline-block;padding:12px 28px;background:#7c5cff;color:#fff;border-radius:10px;text-decoration:none;font-weight:700;font-size:1rem">
            Accept Invitation
          </a>
          <p style="color:#6b6b80;font-size:0.85rem;margin:20px 0 0 0">
            This invite expires in 7 days. If you didn't expect this, you can ignore it.
          </p>
        </div>
      `,
      text: `${inviterName} has invited you to become an admin for ${studio.name} on Photo Lab.\n\nAccept your invite: ${inviteLink}\n\nThis invite expires in 7 days.`,
    });

    res.status(201).json({ message: 'Invite sent', email });
  } catch (err) {
    console.error('[invites] create error:', err);
    res.status(500).json({ error: 'Failed to send invite' });
  }
});

// DELETE /api/studios/:studioId/admin-invites/:inviteId — cancel invite
invitesRouter.delete('/:inviteId', authRequired, async (req, res) => {
  const { studioId, inviteId } = req.params;
  if (!canManageStudio(req.user, studioId)) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  try {
    const invite = await queryRow(
      'SELECT id FROM studio_admin_invites WHERE id = $1 AND studio_id = $2',
      [inviteId, studioId]
    );
    if (!invite) return res.status(404).json({ error: 'Invite not found' });

    await query('DELETE FROM studio_admin_invites WHERE id = $1', [inviteId]);
    res.json({ message: 'Invite cancelled' });
  } catch (err) {
    console.error('[invites] delete error:', err);
    res.status(500).json({ error: 'Failed to cancel invite' });
  }
});

// Public routes — mounted at /api/admin-invites
export const acceptRouter = express.Router();

// GET /api/admin-invites/accept/:token — validate token, return invite info
acceptRouter.get('/accept/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const invite = await queryRow(`
      SELECT i.id, i.email, i.name, i.expires_at as expiresAt, i.accepted_at as acceptedAt,
             s.name as studioName
      FROM studio_admin_invites i
      JOIN studios s ON i.studio_id = s.id
      WHERE i.token = $1
    `, [token]);

    if (!invite) return res.status(404).json({ error: 'Invite not found' });
    if (invite.acceptedAt) return res.status(410).json({ error: 'Invite already accepted' });
    if (new Date(invite.expiresAt) < new Date()) return res.status(410).json({ error: 'Invite has expired' });

    res.json({ email: invite.email, name: invite.name, studioName: invite.studioName });
  } catch (err) {
    console.error('[invites] validate error:', err);
    res.status(500).json({ error: 'Failed to validate invite' });
  }
});

// POST /api/admin-invites/accept/:token — accept invite, create/update user
acceptRouter.post('/accept/:token', async (req, res) => {
  const { token } = req.params;
  const { name, password } = req.body;
  if (!name || !password) return res.status(400).json({ error: 'Name and password are required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    const invite = await queryRow(`
      SELECT i.id, i.email, i.studio_id as studioId, i.expires_at as expiresAt, i.accepted_at as acceptedAt,
             s.name as studioName
      FROM studio_admin_invites i
      JOIN studios s ON i.studio_id = s.id
      WHERE i.token = $1
    `, [token]);

    if (!invite) return res.status(404).json({ error: 'Invite not found' });
    if (invite.acceptedAt) return res.status(410).json({ error: 'Invite already accepted' });
    if (new Date(invite.expiresAt) < new Date()) return res.status(410).json({ error: 'Invite has expired' });

    const passwordHash = await bcrypt.hash(password, 10);

    // Check if a user with this email already exists
    const existingUser = await queryRow('SELECT id, studio_id FROM users WHERE email = $1', [invite.email]);

    let userId;
    if (existingUser) {
      // Update existing user: assign to this studio as admin
      await query(`
        UPDATE users SET name = $1, password = $2, studio_id = $3, role = 'studio_admin', is_active = 1
        WHERE id = $4
      `, [name, passwordHash, invite.studioId, existingUser.id]);
      userId = existingUser.id;
    } else {
      const newUser = await queryRow(`
        INSERT INTO users (email, password, name, role, studio_id, is_active, created_at)
        VALUES ($1, $2, $3, 'studio_admin', $4, 1, CURRENT_TIMESTAMP)
        RETURNING id
      `, [invite.email, passwordHash, name, invite.studioId]);
      userId = newUser.id;
    }

    // Mark invite as accepted
    await query(
      'UPDATE studio_admin_invites SET accepted_at = CURRENT_TIMESTAMP WHERE id = $1',
      [invite.id]
    );

    res.json({ message: 'Account created successfully', studioName: invite.studioName });
  } catch (err) {
    console.error('[invites] accept error:', err);
    res.status(500).json({ error: 'Failed to accept invite' });
  }
});
