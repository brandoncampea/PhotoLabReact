// Patch for missing mssql import and initializeDatabase export
import mssql from './mssql.cjs';
export const initializeDatabase = mssql.initializeDatabase;
