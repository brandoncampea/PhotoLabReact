/**
 * Startup job: sync release-notes.json into the database.
 * Runs on every server start. Inserts any notes from the static file
 * that aren't already in the DB (matched by version string).
 *
 * No git, no Claude, no ANTHROPIC_API_KEY needed in production.
 * Notes are generated locally via server/scripts/generateReleaseNotes.mjs
 * and committed to the repo as server/data/release-notes.json.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import mssql from '../mssql.cjs';

const { queryRow, queryRows, query } = mssql;
const __dirname = dirname(fileURLToPath(import.meta.url));
const NOTES_FILE = resolve(__dirname, '../data/release-notes.json');

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

export async function autoGenerateReleaseNotes() {
  let notes = [];
  try {
    notes = JSON.parse(readFileSync(NOTES_FILE, 'utf8'));
  } catch {
    return; // file missing or empty — nothing to sync
  }

  if (!Array.isArray(notes) || !notes.length) return;

  try {
    await ensureTable();

    const existingRows = await queryRows(`SELECT version FROM release_notes WHERE version IS NOT NULL`);
    const existingVersions = new Set(existingRows.map(r => String(r.version || '')));

    let inserted = 0;
    for (const note of notes) {
      if (!note.title?.trim() || !note.content?.trim()) continue;
      if (existingVersions.has(String(note.version || ''))) continue;

      await query(
        `INSERT INTO release_notes (title, version, summary, content, published, published_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 1, GETDATE(), GETDATE(), GETDATE())`,
        [note.title.trim(), note.version || null, note.summary?.trim() || null, note.content.trim()]
      );
      inserted++;
    }

    if (inserted > 0) {
      console.log(`[release-notes] Synced ${inserted} new note(s) from release-notes.json`);
    }
  } catch (err) {
    console.error('[release-notes] Sync failed:', err.message);
  }
}
