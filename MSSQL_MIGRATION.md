# MSSQL Migration Complete

## Summary
Project has been successfully converted from PostgreSQL to Microsoft SQL Server (MSSQL).

## Changes Made

### Database Helper
- **New file**: [server/mssql.js](server/mssql.js) - MSSQL connection pool and query helpers
- **Removed**: PostgreSQL helper (postgres.js - kept for reference but not used)
- **Migration script**: [server/migrateSqliteToMssql.js](server/migrateSqliteToMssql.js) - Converts SQLite data to MSSQL

### Core Updates
1. **Server startup** - Updated to use MSSQL initialization
2. **All route files** - Switched from postgres.js to mssql.js imports
3. **Middleware** - Updated auth.js to use MSSQL helpers
4. **Seed scripts** - Updated to use MSSQL async/transaction API
5. **SQL compatibility** - Replaced PostgreSQL-specific SQL:
   - `NOW()` → `CURRENT_TIMESTAMP`
   - `INTERVAL '1 month'` → `DATEADD(month, 1, CURRENT_TIMESTAMP)`
   - `RETURNING id` → `INSERT...OUTPUT INSERTED.id`
   - `ON CONFLICT` → `IF EXISTS...IF NOT EXISTS`
   - Boolean `true/false` → Integer `1/0` (MSSQL BIT type)
   - `$1, $2` placeholders → `@p1, @p2` (auto-converted)

### Environment Configuration
Required MSSQL connection settings in `.env.local`:
```
# Option 1: Connection string
MSSQL_CONNECTION_STRING=Server=localhost,1433;Database=photolab;User Id=sa;Password=...;

# Option 2: Individual parameters
DB_HOST=localhost
DB_PORT=1433
DB_NAME=photolab
DB_USER=sa
DB_PASSWORD=yourStrong(!)Password

# Optional
MSSQL_ENCRYPT=true
MSSQL_TRUST_CERT=false
```

### Dependencies
- Added: `mssql` (^11.0.1)
- Removed: `pg` (PostgreSQL), `@types/better-sqlite3`, `better-sqlite3`, `sqlite3`

### Migration Script
Run MSSQL data migration from SQLite:
```bash
npm run migrate:sqlite -- --truncate
# Or with dry-run:
npm run migrate:sqlite -- --dry-run
```

## MSSQL Schema Features
- **Identity columns** with auto-increment (replaces SERIAL)
- **BIT** type for booleans (1/0 vs true/false)
- **DATETIME2** with DEFAULT CURRENT_TIMESTAMP
- **NVARCHAR** for Unicode text
- **PRIMARY KEY constraints** with CHECK on singleton records

## Testing
After MSSQL setup:
1. Install MSSQL Server locally or connect to cloud instance
2. Update `.env.local` with connection details
3. Start backend: `npm run server`
4. Seed data: `npm run seed:products`, `npm run seed:photos`
5. Run tests: `npm run test:e2e`

## Known Differences from PostgreSQL
- No native JSON aggregation (handled in application layer)
- UPSERTs replaced with IF EXISTS/ELSE logic
- Date arithmetic uses DATEADD/DATEDIFF instead of INTERVAL
- Identity resets must be manual via DBCC CHECKIDENT

## Files Modified
- server/mssql.js (created)
- server/server.js
- server/middleware/auth.js
- server/middleware/subscription.js
- All route files (auth, users, albums, photos, orders, products, categories, cart, profile, shipping, stripe, analytics, priceLists, priceListItems, packages, discountCodes, watermarks, subscriptionPlans, studios, webhooks)
- Seed scripts (createTestUsers.js, seedTestStudio.js, seedProducts.js, seedPhotos.js)
- package.json

## Next Steps
1. Install MSSQL Server or use Azure SQL Database
2. Update `.env.local` with MSSQL connection details
3. Run `npm install` to install mssql package
4. Run backend server and seed database
5. Run tests to verify compatibility
