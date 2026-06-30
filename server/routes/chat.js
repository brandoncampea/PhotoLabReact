import express from 'express';
import { adminRequired } from '../middleware/auth.js';

const router = express.Router();

let query, queryRow, queryRows;
const loadMssql = async () => {
  if (!query || !queryRow || !queryRows) {
    const mod = await import('../mssql.cjs');
    const m = mod?.default || mod;
    query = m.query;
    queryRow = m.queryRow;
    queryRows = m.queryRows;
  }
};

// In-memory presence
// studioConnections: Map<studioId, Set<{ res, userId, name }>>
const studioConnections = new Map();
// superAdminConnections: Set<{ res, userId, name }>
const superAdminConnections = new Set();

const sseWrite = (res, data) => {
  try { res.write(`data: ${JSON.stringify(data)}\n\n`); return true; } catch { return false; }
};

const broadcastToStudio = (studioId, data) => {
  const conns = studioConnections.get(Number(studioId));
  if (conns) for (const c of conns) sseWrite(c.res, data);
};

const broadcastToSuperAdmins = (data) => {
  for (const c of superAdminConnections) sseWrite(c.res, data);
};

const broadcast = (studioId, data) => {
  broadcastToStudio(studioId, data);
  broadcastToSuperAdmins(data);
};

const isStudioOnline = (studioId) => (studioConnections.get(Number(studioId))?.size ?? 0) > 0;

let tablesReady = false;
const ensureTables = async () => {
  if (tablesReady) return;
  await loadMssql();
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'chat_messages')
    BEGIN
      CREATE TABLE chat_messages (
        id           INT IDENTITY(1,1) PRIMARY KEY,
        studio_id    INT NOT NULL,
        sender_id    INT NOT NULL,
        sender_role  NVARCHAR(50) NOT NULL,
        sender_name  NVARCHAR(255) NOT NULL,
        content      NVARCHAR(MAX) NOT NULL,
        created_at   DATETIME2 DEFAULT CURRENT_TIMESTAMP,
        archived_at  DATETIME2 NULL
      );
      CREATE INDEX idx_chat_msg_studio ON chat_messages(studio_id, created_at);
    END

    IF COL_LENGTH('chat_messages', 'archived_at') IS NULL
      ALTER TABLE chat_messages ADD archived_at DATETIME2 NULL;

    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'chat_last_read')
    BEGIN
      CREATE TABLE chat_last_read (
        user_id     INT NOT NULL,
        studio_id   INT NOT NULL,
        last_read_at DATETIME2 NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, studio_id)
      )
    END
  `);
  tablesReady = true;
};

// GET /api/chat/events  — SSE stream for real-time messages and presence
router.get('/events', adminRequired, async (req, res) => {
  const { user } = req;
  if (user.role !== 'studio_admin' && user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  await loadMssql();
  const userRow = await queryRow('SELECT name FROM users WHERE id = $1', [user.id]);
  const userName = String(userRow?.name || user.email || '').trim() || 'Unknown';

  const studioId = user.role === 'studio_admin' ? Number(user.studio_id) : null;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const conn = { res, userId: user.id, name: userName };

  if (user.role === 'super_admin') {
    superAdminConnections.add(conn);
    const onlineStudios = [...studioConnections.entries()]
      .filter(([, s]) => s.size > 0)
      .map(([id]) => id);
    sseWrite(res, { type: 'connected', onlineStudios });
  } else if (studioId) {
    if (!studioConnections.has(studioId)) studioConnections.set(studioId, new Set());
    studioConnections.get(studioId).add(conn);
    sseWrite(res, { type: 'connected', superAdminOnline: superAdminConnections.size > 0 });
    broadcastToSuperAdmins({ type: 'presence', studioId, studioOnline: true });
  }

  // Heartbeat every 25s keeps the connection alive through Azure's idle timeout
  const hb = setInterval(() => {
    try { res.write(': hb\n\n'); } catch { clearInterval(hb); }
  }, 25000);

  req.on('close', () => {
    clearInterval(hb);
    if (user.role === 'super_admin') {
      superAdminConnections.delete(conn);
    } else if (studioId) {
      const conns = studioConnections.get(studioId);
      if (conns) {
        conns.delete(conn);
        if (conns.size === 0) {
          studioConnections.delete(studioId);
          broadcastToSuperAdmins({ type: 'presence', studioId, studioOnline: false });
        }
      }
    }
  });
});

// GET /api/chat/studios  — super admin: list all studios with unread count + online status
router.get('/studios', adminRequired, async (req, res) => {
  if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Unauthorized' });
  await ensureTables();
  const userId = req.user.id;

  const rows = await queryRows(`
    SELECT s.id, s.name,
      COALESCE((
        SELECT COUNT(*) FROM chat_messages cm
        WHERE cm.studio_id = s.id
          AND cm.sender_id != $1
          AND cm.archived_at IS NULL
          AND cm.created_at > COALESCE(
            (SELECT last_read_at FROM chat_last_read WHERE user_id = $1 AND studio_id = s.id),
            '1900-01-01T00:00:00'
          )
      ), 0) AS unreadCount,
      (SELECT MAX(created_at) FROM chat_messages WHERE studio_id = s.id AND archived_at IS NULL) AS lastMessageAt
    FROM studios s
    ORDER BY lastMessageAt DESC, s.name ASC
  `, [userId]);

  res.json({
    studios: (rows || []).map(r => ({
      id: Number(r.id),
      name: String(r.name || ''),
      unreadCount: Number(r.unreadCount || 0),
      online: isStudioOnline(r.id),
      lastMessageAt: r.lastMessageAt || null,
    })),
  });
});

// GET /api/chat/:studioId/messages  — last 100 messages for a thread
router.get('/:studioId/messages', adminRequired, async (req, res) => {
  const { user } = req;
  if (user.role !== 'studio_admin' && user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const studioId = Number(req.params.studioId);
  if (!studioId) return res.status(400).json({ error: 'Invalid studio ID' });
  if (user.role === 'studio_admin' && Number(user.studio_id) !== studioId) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  await ensureTables();

  const [rows, archivedRow] = await Promise.all([
    queryRows(`
      SELECT TOP 100 id, studio_id AS studioId, sender_id AS senderId,
        sender_role AS senderRole, sender_name AS senderName, content,
        created_at AS createdAt
      FROM chat_messages
      WHERE studio_id = $1 AND archived_at IS NULL
      ORDER BY created_at DESC
    `, [studioId]),
    queryRows(`
      SELECT TOP 1 id FROM chat_messages
      WHERE studio_id = $1 AND archived_at IS NOT NULL
    `, [studioId]),
  ]);

  res.json({
    messages: (rows || []).reverse(),
    hasArchived: !!(archivedRow && archivedRow.length),
  });
});

// POST /api/chat/:studioId/messages  — send a message
router.post('/:studioId/messages', adminRequired, async (req, res) => {
  const { user } = req;
  if (user.role !== 'studio_admin' && user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const studioId = Number(req.params.studioId);
  if (!studioId) return res.status(400).json({ error: 'Invalid studio ID' });
  if (user.role === 'studio_admin' && Number(user.studio_id) !== studioId) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const content = String(req.body?.content || '').trim();
  if (!content) return res.status(400).json({ error: 'Message content is required' });
  if (content.length > 2000) return res.status(400).json({ error: 'Message too long (max 2000 chars)' });

  await ensureTables();

  const userRow = await queryRow('SELECT name FROM users WHERE id = $1', [user.id]);
  const senderName = String(userRow?.name || user.email || '').trim() || 'Unknown';

  const inserted = await queryRow(
    `INSERT INTO chat_messages (studio_id, sender_id, sender_role, sender_name, content)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [studioId, user.id, user.role, senderName, content]
  );

  const message = {
    type: 'message',
    id: Number(inserted?.id || 0),
    studioId,
    senderId: user.id,
    senderRole: user.role,
    senderName,
    content,
    createdAt: new Date().toISOString(),
  };

  broadcast(studioId, message);
  res.json({ message });
});

// POST /api/chat/:studioId/read  — mark thread as read (update last_read_at)
router.post('/:studioId/read', adminRequired, async (req, res) => {
  const { user } = req;
  const studioId = Number(req.params.studioId);
  if (!studioId) return res.status(400).json({ error: 'Invalid studio ID' });

  await ensureTables();
  await query(`
    IF EXISTS (SELECT 1 FROM chat_last_read WHERE user_id = $1 AND studio_id = $2)
      UPDATE chat_last_read SET last_read_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND studio_id = $2
    ELSE
      INSERT INTO chat_last_read (user_id, studio_id, last_read_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
  `, [user.id, studioId]);

  res.json({ ok: true });
});

export default router;
