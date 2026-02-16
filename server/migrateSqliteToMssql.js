import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, queryRows, transaction } from './mssql.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const getArg = (flag) => {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : undefined;
};

const sqlitePath = getArg('--sqlite') || getArg('-s') || path.join(__dirname, 'photolab.db');
const shouldTruncate = args.includes('--truncate');
const dryRun = args.includes('--dry-run');

const tableOrder = [
  'studios',
  'users',
  'price_lists',
  'products',
  'categories',
  'product_sizes',
  'price_list_products',
  'packages',
  'package_items',
  'albums',
  'photos',
  'orders',
  'order_items',
  'profile_config',
  'user_cart',
  'watermarks',
  'discount_codes',
  'discount_code_products',
  'analytics',
  'shipping_config',
  'stripe_config',
  'subscription_plans'
];

function runSqliteJson(sql) {
  try {
    const output = execFileSync('sqlite3', ['-json', sqlitePath, sql], { encoding: 'utf8' });
    const trimmed = output.trim();
    return trimmed ? JSON.parse(trimmed) : [];
  } catch (error) {
    const stderr = error.stderr?.toString?.() || '';
    throw new Error(
      `Failed to run sqlite3 CLI. Ensure sqlite3 is installed and supports -json. ${stderr}`
    );
  }
}

function tableExistsSqlite(table) {
  const rows = runSqliteJson(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}';`
  );
  return rows.length > 0;
}

async function getMssqlColumns(table) {
  return queryRows(
    `
      SELECT column_name, data_type
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = $1
      ORDER BY ORDINAL_POSITION
    `,
    [table]
  );
}

function normalizeValue(value, isBoolean) {
  if (!isBoolean) return value;
  if (value === null || value === undefined) return null;
  if (value === true || value === false) return value ? 1 : 0;
  if (value === 1 || value === '1') return 1;
  if (value === 0 || value === '0') return 0;
  return value;
}

async function migrateTable(table) {
  if (!tableExistsSqlite(table)) {
    console.log(`↷ Skip ${table}: not found in SQLite`);
    return 0;
  }

  const sqliteRows = runSqliteJson(`SELECT * FROM ${table};`);
  if (!sqliteRows.length) {
    console.log(`↷ Skip ${table}: no rows`);
    return 0;
  }

  const mssqlColumns = await getMssqlColumns(table);
  if (!mssqlColumns.length) {
    console.log(`↷ Skip ${table}: not found in MSSQL`);
    return 0;
  }

  const mssqlColumnNames = mssqlColumns.map((col) => col.column_name);
  const mssqlBooleanCols = new Set(
    mssqlColumns.filter((col) => col.data_type === 'bit').map((col) => col.column_name)
  );

  const sqliteColumnNames = new Set(Object.keys(sqliteRows[0] || {}));
  const insertColumns = mssqlColumnNames.filter((col) => sqliteColumnNames.has(col));

  if (!insertColumns.length) {
    console.log(`↷ Skip ${table}: no matching columns`);
    return 0;
  }

  if (dryRun) {
    console.log(`• ${table}: ${sqliteRows.length} rows (dry-run)`);
    return sqliteRows.length;
  }

  await transaction(async (client) => {
    for (const row of sqliteRows) {
      const values = insertColumns.map((col) =>
        normalizeValue(row[col], mssqlBooleanCols.has(col))
      );
      const placeholders = insertColumns.map((_, index) => `$${index + 1}`).join(', ');
      await client.query(
        `INSERT INTO ${table} (${insertColumns.join(', ')}) VALUES (${placeholders})`,
        values
      );
    }
  });

  console.log(`✓ ${table}: ${sqliteRows.length} rows migrated`);
  return sqliteRows.length;
}

async function resetIdentities() {
  for (const table of tableOrder) {
    await query(
      `IF EXISTS (SELECT 1 FROM sys.identity_columns WHERE object_id = OBJECT_ID($1))
       BEGIN
         DECLARE @maxId INT = (SELECT ISNULL(MAX(id), 0) FROM ${table});
         DBCC CHECKIDENT ('${table}', RESEED, @maxId);
       END`,
      [table]
    );
  }
}

async function truncateTables() {
  for (const table of [...tableOrder].reverse()) {
    await query(`DELETE FROM ${table}`);
  }
}

async function main() {
  console.log('SQLite -> MSSQL migration starting...');
  console.log(`SQLite DB: ${sqlitePath}`);

  if (shouldTruncate && !dryRun) {
    await truncateTables();
    await resetIdentities();
    console.log('✓ Truncated MSSQL tables');
  }

  let total = 0;
  for (const table of tableOrder) {
    total += await migrateTable(table);
  }

  if (!dryRun) {
    await resetIdentities();
  }

  console.log(`Done. Total rows migrated: ${total}`);
  process.exit(0);
}

main().catch((error) => {
  console.error('Migration failed:', error.message || error);
  process.exit(1);
});
