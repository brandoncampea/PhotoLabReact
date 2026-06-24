import express from 'express';
import { execSync } from 'child_process';
import mssql from '../mssql.cjs';
import { adminRequired } from '../middleware/auth.js';
import { sendEmail } from '../services/emailService.js';

const { queryRow, queryRows, query } = mssql;
const router = express.Router();

const ensureTable = async () => {
  const exists = await queryRow(
    `SELECT CASE WHEN OBJECT_ID('release_notes','U') IS NOT NULL THEN 1 ELSE 0 END AS v`
  );
  if (!Number(exists?.v)) {
    await query(`
      CREATE TABLE release_notes (
        id INT IDENTITY(1,1) PRIMARY KEY,
        title NVARCHAR(255) NOT NULL,
        version NVARCHAR(50) NULL,
        summary NVARCHAR(500) NULL,
        content NVARCHAR(MAX) NOT NULL,
        published BIT NOT NULL DEFAULT 0,
        published_at DATETIME2 NULL,
        created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
};

// Studio admin: list published notes
router.get('/', adminRequired, async (req, res) => {
  try {
    await ensureTable();
    const rows = await queryRows(`
      SELECT id, title, version, summary, content, published_at, created_at
      FROM release_notes
      WHERE published = 1
      ORDER BY created_at DESC
    `);
    res.json(rows.map(r => ({
      id: Number(r.id),
      title: r.title,
      version: r.version || null,
      summary: r.summary || null,
      content: r.content,
      publishedAt: r.published_at,
      createdAt: r.created_at,
    })));
  } catch (err) {
    console.error('[release-notes] GET / error:', err);
    res.status(500).json({ error: 'Failed to fetch release notes' });
  }
});

// Super admin: list all notes (published + drafts)
router.get('/all', adminRequired, async (req, res) => {
  if (req.user?.role !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    await ensureTable();
    const rows = await queryRows(`
      SELECT id, title, version, summary, content, published, published_at, created_at, updated_at
      FROM release_notes
      ORDER BY created_at DESC
    `);
    res.json(rows.map(r => ({
      id: Number(r.id),
      title: r.title,
      version: r.version || null,
      summary: r.summary || null,
      content: r.content,
      published: Boolean(Number(r.published)),
      publishedAt: r.published_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })));
  } catch (err) {
    console.error('[release-notes] GET /all error:', err);
    res.status(500).json({ error: 'Failed to fetch release notes' });
  }
});

// Super admin: create note
router.post('/', adminRequired, async (req, res) => {
  if (req.user?.role !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    await ensureTable();
    const { title, version, summary, content, published } = req.body;
    if (!title?.trim() || !content?.trim()) return res.status(400).json({ error: 'title and content are required' });
    const publishedBit = published ? 1 : 0;
    const publishedAtExpr = published ? 'GETDATE()' : 'NULL';
    const row = await queryRow(`
      INSERT INTO release_notes (title, version, summary, content, published, published_at)
      OUTPUT INSERTED.id, INSERTED.created_at
      VALUES ($1, $2, $3, $4, $5, ${publishedAtExpr})
    `, [title.trim(), version?.trim() || null, summary?.trim() || null, content.trim(), publishedBit]);
    res.json({ id: Number(row.id), createdAt: row.created_at });
  } catch (err) {
    console.error('[release-notes] POST / error:', err);
    res.status(500).json({ error: 'Failed to create release note' });
  }
});

// Super admin: update note
router.put('/:id', adminRequired, async (req, res) => {
  if (req.user?.role !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const id = Number(req.params.id);
    const { title, version, summary, content, published } = req.body;
    if (!title?.trim() || !content?.trim()) return res.status(400).json({ error: 'title and content are required' });
    const publishedBit = published ? 1 : 0;
    await query(`
      UPDATE release_notes
      SET title = $1, version = $2, summary = $3, content = $4, published = $5,
          published_at = CASE WHEN $5 = 1 AND published_at IS NULL THEN GETDATE() ELSE published_at END,
          updated_at = GETDATE()
      WHERE id = $6
    `, [title.trim(), version?.trim() || null, summary?.trim() || null, content.trim(), publishedBit, id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[release-notes] PUT /:id error:', err);
    res.status(500).json({ error: 'Failed to update release note' });
  }
});

// Super admin: delete note
router.delete('/:id', adminRequired, async (req, res) => {
  if (req.user?.role !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    await query(`DELETE FROM release_notes WHERE id = $1`, [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[release-notes] DELETE /:id error:', err);
    res.status(500).json({ error: 'Failed to delete release note' });
  }
});

// Super admin: check for new commits and surface them as drafts (no AI — raw commit messages)
router.post('/generate', adminRequired, async (req, res) => {
  if (req.user?.role !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    await ensureTable();

    const latestRow = await queryRow(`SELECT TOP 1 published_at, created_at FROM release_notes ORDER BY created_at DESC`);
    const sinceDate = latestRow
      ? new Date(latestRow.published_at || latestRow.created_at)
      : new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    const since = sinceDate.toISOString().slice(0, 10);
    let gitLog = '';
    try {
      gitLog = execSync(
        `git log --format="%ad %s" --date=short --since="${since}"`,
        { cwd: process.cwd(), encoding: 'utf8', timeout: 10000 }
      ).trim();
    } catch {
      return res.status(500).json({ error: 'Failed to read git log (git may not be available on this server)' });
    }

    if (!gitLog) return res.json({ drafts: [], message: 'No new commits since last release note.' });

    const byDate = {};
    for (const line of gitLog.split('\n').filter(Boolean)) {
      const [date, ...rest] = line.split(' ');
      if (!date || !rest.length) continue;
      (byDate[date] = byDate[date] || []).push(rest.join(' '));
    }

    const formatVersion = (iso) =>
      new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const existingRows = await queryRows(`SELECT version FROM release_notes WHERE version IS NOT NULL`);
    const existingVersions = new Set(existingRows.map(r => String(r.version || '')));

    const drafts = Object.keys(byDate)
      .filter(date => !existingVersions.has(formatVersion(date)))
      .sort()
      .reverse()
      .map(date => {
        const commits = byDate[date];
        const version = formatVersion(date);
        const title = commits[0].replace(/^(fix|feat|chore|refactor|style|docs|test):\s*/i, '');
        const summary = `${commits.length} update${commits.length !== 1 ? 's' : ''} on ${version}.`;
        const content = commits.map(c => `- ${c}`).join('\n');
        return { version, title, summary, content };
      });

    res.json({ drafts });
  } catch (err) {
    console.error('[release-notes] POST /generate error:', err);
    res.status(500).json({ error: 'Failed to check for new releases', detail: err.message });
  }
});

// Super admin: send release notes email to all studio admins
router.post('/send-email', adminRequired, async (req, res) => {
  if (req.user?.role !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    await ensureTable();
    const { noteIds, subject } = req.body;
    if (!Array.isArray(noteIds) || !noteIds.length) return res.status(400).json({ error: 'noteIds required' });
    if (!subject?.trim()) return res.status(400).json({ error: 'subject required' });

    const placeholders = noteIds.map((_, i) => `$${i + 1}`).join(',');
    const notes = await queryRows(
      `SELECT id, title, version, summary, content, published_at, created_at
       FROM release_notes WHERE id IN (${placeholders}) ORDER BY created_at DESC`,
      noteIds
    );
    if (!notes.length) return res.status(404).json({ error: 'No matching release notes found' });

    // Gather all studio admin emails
    const emailRows = await queryRows(`
      SELECT DISTINCT u.email
      FROM users u
      WHERE u.role IN ('studio_admin', 'admin')
        AND u.email IS NOT NULL
        AND LTRIM(RTRIM(u.email)) != ''
        AND u.email NOT LIKE '%@example.com'
    `);
    const bccList = emailRows.map(r => r.email).filter(Boolean);
    if (!bccList.length) return res.status(400).json({ error: 'No studio admin emails found' });

    const html = buildEmailHtml(notes, subject.trim());
    const text = buildEmailText(notes);

    const sent = await sendEmail({
      to: req.user.email || bccList[0],
      bcc: bccList,
      subject: subject.trim(),
      text,
      html,
    });

    res.json({ ok: sent, sentTo: bccList.length });
  } catch (err) {
    console.error('[release-notes] POST /send-email error:', err);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function contentToHtml(text) {
  return escapeHtml(text)
    .split(/\n\n+/)
    .map(block => `<p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.75;">${block.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function buildEmailHtml(notes, subject) {
  const noteSections = notes.map(note => {
    const dateStr = new Date(note.published_at || note.created_at).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    return `
      <tr><td style="padding:0 0 36px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding-bottom:6px;">
            <table cellpadding="0" cellspacing="0"><tr>
              ${note.version ? `<td style="padding-right:10px;"><span style="background:#7c3aed;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;letter-spacing:0.05em;display:inline-block;">${escapeHtml(note.version)}</span></td>` : ''}
              <td style="font-size:12px;color:#9ca3af;vertical-align:middle;">${dateStr}</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding-bottom:10px;">
            <h2 style="margin:0;font-size:20px;font-weight:800;color:#111827;line-height:1.3;">${escapeHtml(note.title)}</h2>
          </td></tr>
          ${note.summary ? `<tr><td style="padding-bottom:12px;"><p style="margin:0;font-size:14px;color:#6b7280;font-style:italic;line-height:1.6;">${escapeHtml(note.summary)}</p></td></tr>` : ''}
          <tr><td>${contentToHtml(note.content)}</td></tr>
        </table>
        <div style="height:1px;background:#e5e7eb;margin-top:24px;"></div>
      </td></tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#7c3aed 0%,#4f46e5 100%);padding:40px;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:16px;vertical-align:middle;">
              <div style="width:44px;height:44px;background:rgba(255,255,255,0.15);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;text-align:center;line-height:44px;">📸</div>
            </td>
            <td style="vertical-align:middle;">
              <div style="font-size:13px;color:rgba(255,255,255,0.7);font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px;">Photo Lab</div>
              <div style="font-size:24px;font-weight:800;color:#ffffff;line-height:1.2;">${escapeHtml(subject)}</div>
            </td>
          </tr></table>
          <p style="margin:16px 0 0;font-size:15px;color:rgba(255,255,255,0.75);line-height:1.5;">Here's a detailed look at what's new in your photo lab platform.</p>
        </td></tr>
        <!-- Content -->
        <tr><td style="padding:40px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${noteSections}
            <tr><td style="padding-top:8px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:12px;">
                <tr><td style="padding:20px 24px;text-align:center;">
                  <p style="margin:0 0 4px;font-size:14px;color:#374151;font-weight:600;">Questions about these features?</p>
                  <p style="margin:0;font-size:13px;color:#6b7280;">Reply to this email or log into your admin dashboard to explore.</p>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:24px 40px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">You're receiving this because you're a studio admin on Photo Lab. These release notes are sent when new features are available for your studio.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildEmailText(notes) {
  return notes.map(note => {
    const dateStr = new Date(note.published_at || note.created_at).toLocaleDateString('en-US');
    return [
      `${note.title}${note.version ? ` [${note.version}]` : ''} — ${dateStr}`,
      note.summary ? `${note.summary}` : '',
      note.content,
      '────────────────────────',
    ].filter(Boolean).join('\n\n');
  }).join('\n\n');
}

export default router;
