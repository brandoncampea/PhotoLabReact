/**
 * Generates release notes from git history and writes them to
 * server/data/release-notes.json. Run via post-commit hook or manually
 * via `npm run release-notes`. No API key required.
 *
 * Usage: node server/scripts/generateReleaseNotes.mjs
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../');
const NOTES_FILE = resolve(ROOT, 'server/data/release-notes.json');

dotenv.config({ path: resolve(ROOT, '.env.local') });

const formatVersion = (isoDate) =>
  new Date(isoDate + 'T12:00:00Z').toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

// Read existing notes
let existing = [];
try {
  existing = JSON.parse(readFileSync(NOTES_FILE, 'utf8'));
} catch {
  existing = [];
}

const existingVersions = new Set(existing.map(n => String(n.version || '')));

// Find the date of the most recent note
const latestVersion = existing[0]?.version;
let sinceDate;
if (latestVersion) {
  const parsed = new Date(latestVersion);
  if (!isNaN(parsed.getTime())) {
    sinceDate = parsed.toISOString().slice(0, 10);
  }
}
if (!sinceDate) {
  sinceDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Get commits since that date
let gitLog = '';
try {
  gitLog = execSync(
    `git log --format="%ad %s" --date=short --since="${sinceDate}"`,
    { cwd: ROOT, encoding: 'utf8', timeout: 10000 }
  ).trim();
} catch (err) {
  console.error('[release-notes] git log failed:', err.message);
  process.exit(0);
}

if (!gitLog) {
  console.log('[release-notes] No new commits since last note');
  process.exit(0);
}

// Group by date
const byDate = {};
for (const line of gitLog.split('\n').filter(Boolean)) {
  const [date, ...rest] = line.split(' ');
  if (!date || !rest.length) continue;
  (byDate[date] = byDate[date] || []).push(rest.join(' '));
}

const newDates = Object.keys(byDate)
  .filter(date => !existingVersions.has(formatVersion(date)))
  .sort()
  .reverse();

if (!newDates.length) {
  console.log('[release-notes] All dates already have notes — nothing to generate');
  process.exit(0);
}

// Build notes from raw commit messages
const toAdd = newDates.map(date => {
  const commits = byDate[date];
  const version = formatVersion(date);
  const title = commits[0].replace(/^(fix|feat|chore|refactor|style|docs|test):\s*/i, '');
  const summary = `${commits.length} update${commits.length !== 1 ? 's' : ''} on ${version}.`;
  const content = commits.map(c => `- ${c}`).join('\n');
  return { version, title, summary, content };
});

const updated = [...toAdd, ...existing];
writeFileSync(NOTES_FILE, JSON.stringify(updated, null, 2) + '\n');

console.log(`[release-notes] Added ${toAdd.length} note(s): ${toAdd.map(d => d.version).join(', ')}`);
