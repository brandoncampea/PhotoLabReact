# PostgreSQL Migration Guide

## Overview
Photo Lab React is being migrated from SQLite (better-sqlite3) to PostgreSQL for better concurrent user support and scalability.

## Architecture Changes

### Key Differences
| Feature | SQLite | PostgreSQL |
|---------|--------|----------|
| Concurrency | File-level locking, 10-100 users | Row-level locking, 100-1000+ users |
| Syntax | `?` placeholders | `$1, $2` numbered placeholders |
| Async | Synchronous (blocking) | Asynchronous (non-blocking) |
| Connection | Single file (photolab.db) | TCP connection to server |

### Migration Strategy

#### 1. **Completed Files** ✅
- `server/postgres.js` - New PostgreSQL connection pool and query helpers
- `server/server.js` - Updated to use PostgreSQL async initialization
- `server/middleware/auth.js` - Async JWT verification with PostgreSQL
- `server/routes/auth.js` - Async register/login with PostgreSQL
- `server/routes/users.js` - Admin user management with aggregated analytics

#### 2. **Files Needing Updates** (SQL syntax + async)
All remaining route files need:
- Replace `import { db }` with `import { queryRow, queryRows, query }`
- Convert `db.prepare().get()` → `await queryRow()`
- Convert `db.prepare().all()` → `await queryRows()`
- Convert `db.prepare().run()` → `await query()`
- Replace `?` placeholders with `$1, $2, $3...`
- Make route handlers `async`
- Use `RETURNING` clause instead of `lastInsertRowid`

**Routes to migrate:**
- [ ] cart.js
- [ ] orders.js
- [ ] albums.js
- [ ] photos.js
- [ ] products.js
- [ ] categories.js
- [ ] watermarks.js
- [ ] discountCodes.js
- [ ] priceLists.js
- [ ] packages.js
- [ ] profile.js
- [ ] analytics.js

## Setup Instructions

### 1. Install PostgreSQL (macOS)
```bash
# Using Homebrew
brew install postgresql
brew services start postgresql

# Or Docker
docker run --name photolab-postgres \
  -e POSTGRES_DB=photolab \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  -d postgres:15
```

### 2. Create Database
```bash
psql -U postgres -c "CREATE DATABASE photolab;"
```

### 3. Update .env.local
```bash
cp .env.local.example .env.local
```

Edit `.env.local`:
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=photolab
DB_USER=postgres
DB_PASSWORD=postgres
JWT_SECRET=your-secret-key-change-in-production
ADMIN_EMAILS=admin@photolab.com
VITE_USE_MOCK_API=false
```

### 4. Start Server
```bash
npm run dev
npm run server  # in another terminal
```

The schema will be auto-created on first server startup.

## Migration Examples

### Example 1: Simple SELECT
**SQLite (sync):**
```javascript
const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
```

**PostgreSQL (async):**
```javascript
import { queryRow } from '../postgres.js';
const user = await queryRow('SELECT * FROM users WHERE id = $1', [userId]);
```

### Example 2: INSERT with RETURNING
**SQLite (sync):**
```javascript
const result = db.prepare('INSERT INTO orders (user_id, total) VALUES (?, ?)').run(userId, total);
const orderId = result.lastInsertRowid;
```

**PostgreSQL (async):**
```javascript
import { queryRow } from '../postgres.js';
const result = await queryRow(
  'INSERT INTO orders (user_id, total) VALUES ($1, $2) RETURNING id',
  [userId, total]
);
const orderId = result.id;
```

### Example 3: Multiple Rows with Aggregation
**SQLite (sync):**
```javascript
const orders = db.prepare(`
  SELECT o.*, COUNT(*) OVER() as total_count
  FROM orders o
  WHERE user_id = ?
`).all(userId);
```

**PostgreSQL (async):**
```javascript
import { queryRows } from '../postgres.js';
const orders = await queryRows(`
  SELECT o.*, COUNT(*) OVER() as total_count
  FROM orders o
  WHERE user_id = $1
`, [userId]);
```

### Example 4: Transaction
**SQLite (sync):**
```javascript
db.exec('BEGIN');
try {
  db.prepare('UPDATE users SET balance = ?').run(newBalance);
  db.prepare('INSERT INTO transactions...').run(...);
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
}
```

**PostgreSQL (async):**
```javascript
import { transaction } from '../postgres.js';
await transaction(async (client) => {
  await client.query('UPDATE users SET balance = $1', [newBalance]);
  await client.query('INSERT INTO transactions...', [...]);
});
```

## Testing Checklist

### Unit Tests
- [ ] Register endpoint creates user with correct role
- [ ] Login updates last_login_at timestamp
- [ ] Admin endpoints require adminRequired middleware
- [ ] Cart operations work with JWT auth

### Integration Tests
- [ ] Full user flow: register → login → add to cart → checkout
- [ ] Admin user management: list users → update role → verify analytics
- [ ] Concurrent requests don't cause "database locked" errors

### Performance
- [ ] Multiple concurrent users can read simultaneously
- [ ] Multiple concurrent users can write without blocking

## Rollback Plan
If issues occur:
1. Switch `server.js` to import `initDb` from `database.js` instead of `postgres.js`
2. Keep SQLite database.js available
3. Revert route imports to use `{ db }`

## Monitoring
After migration, monitor:
- Connection pool health: `SELECT count(*) FROM pg_stat_activity;`
- Slow queries: Enable PostgreSQL query logging
- Lock contention: `SELECT * FROM pg_locks;`

## Performance Gains Expected
- **Reads**: SQLite → PostgreSQL (no change, both fast)
- **Writes**: SQLite (single writer) → PostgreSQL (multiple concurrent writers)
- **Concurrent users**: ~100 → ~500-1000+
- **Query latency**: Slightly higher due to network, but negligible on localhost

## Additional Resources
- [PostgreSQL Node.js Driver](https://node-postgres.com/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Migration Best Practices](https://wiki.postgresql.org/wiki/Porting_from_SQLite)
