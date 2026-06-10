// This file exists only to prevent ESM import errors.
// All database logic is in mssql.cjs (CommonJS format).
//
// If you see an error when trying to import this file:
//   - Use mssql.cjs instead: const mssql = require('./mssql.cjs');
//   - Or: import mssql from './mssql.cjs';
//
// This file throws an error because ESM and CommonJS cannot be mixed.

throw new Error('Do not import mssql.mjs. Use mssql.cjs instead.');
