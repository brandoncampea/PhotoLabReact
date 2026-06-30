import mssql from '../mssql.cjs';

const { query, queryRows } = mssql;

const ensureArchivedAtColumn = async () => {
  await query(`
    IF COL_LENGTH('chat_messages', 'archived_at') IS NULL
      ALTER TABLE chat_messages ADD archived_at DATETIME2 NULL
  `);
};

const ensureTicketsTable = async () => {
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'tickets')
    BEGIN
      CREATE TABLE tickets (
        id               INT IDENTITY(1,1) PRIMARY KEY,
        subject          NVARCHAR(255),
        description      NVARCHAR(MAX),
        created_by       INT NULL,
        created_for_studio INT NULL,
        assigned_to      INT NULL,
        status           NVARCHAR(32) DEFAULT 'open',
        escalated        BIT DEFAULT 0,
        comments         NVARCHAR(MAX),
        history          NVARCHAR(MAX),
        meta             NVARCHAR(MAX),
        created_at       DATETIME2 DEFAULT GETDATE(),
        updated_at       DATETIME2 DEFAULT GETDATE()
      )
    END
  `);
};

export async function archiveChatToTickets() {
  try {
    await ensureArchivedAtColumn();
    await ensureTicketsTable();

    // Find every studio that has unarchived messages older than 24 hours
    const studioRows = await queryRows(`
      SELECT DISTINCT cm.studio_id, s.name AS studio_name
      FROM chat_messages cm
      JOIN studios s ON s.id = cm.studio_id
      WHERE cm.archived_at IS NULL
        AND cm.created_at < DATEADD(hour, -24, CURRENT_TIMESTAMP)
    `, []);

    if (!studioRows || !studioRows.length) {
      console.log('[chat-archive] No chat messages to archive');
      return;
    }

    for (const { studio_id, studio_name } of studioRows) {
      // Fetch the messages to archive (everything older than 24h, not yet archived)
      const messages = await queryRows(`
        SELECT id, sender_role, sender_name, content, created_at
        FROM chat_messages
        WHERE studio_id = $1
          AND archived_at IS NULL
          AND created_at < DATEADD(hour, -24, CURRENT_TIMESTAMP)
        ORDER BY created_at ASC
      `, [studio_id]);

      if (!messages || !messages.length) continue;

      // Group by calendar day so each day gets its own ticket
      const byDay = new Map();
      for (const msg of messages) {
        const day = new Date(msg.created_at).toISOString().slice(0, 10); // YYYY-MM-DD
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day).push(msg);
      }

      for (const [day, dayMessages] of byDay) {
        const dateLabel = new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', {
          year: 'numeric', month: 'long', day: 'numeric',
        });

        const lines = dayMessages.map(m => {
          const time = new Date(m.created_at).toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit',
          });
          const label = m.sender_role === 'super_admin' ? 'Support' : (m.sender_name || 'Studio');
          return `[${time}] ${label}: ${m.content}`;
        });

        const description = `Chat transcript — ${studio_name} — ${dateLabel}\n\n${lines.join('\n')}`;
        const meta = JSON.stringify({
          source: 'chat_archive',
          studio_id: Number(studio_id),
          date: day,
          message_count: dayMessages.length,
        });

        await query(`
          INSERT INTO tickets (subject, description, created_for_studio, status, escalated, comments, history, meta)
          VALUES ($1, $2, $3, 'closed', 0, '[]', '[]', $4)
        `, [
          `Chat Transcript — ${studio_name} — ${dateLabel}`,
          description,
          studio_id,
          meta,
        ]);

        // Mark this day's messages archived using the oldest/newest timestamps to avoid
        // accidentally archiving messages that arrived during processing
        const maxCreatedAt = dayMessages[dayMessages.length - 1].created_at;
        const minCreatedAt = dayMessages[0].created_at;
        await query(`
          UPDATE chat_messages
          SET archived_at = CURRENT_TIMESTAMP
          WHERE studio_id = $1
            AND archived_at IS NULL
            AND created_at >= $2
            AND created_at <= $3
        `, [studio_id, minCreatedAt, maxCreatedAt]);

        console.log(`[chat-archive] Archived ${dayMessages.length} messages for "${studio_name}" on ${day}`);
      }
    }
  } catch (err) {
    console.error('[chat-archive] Error during chat archival:', err?.message || err);
  }
}

export function scheduleDailyArchive() {
  // Run immediately on startup to catch any messages missed while the server was down,
  // then repeat every 24 hours.
  archiveChatToTickets();
  setInterval(archiveChatToTickets, 24 * 60 * 60 * 1000);
}
