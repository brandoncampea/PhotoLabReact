// Sales Summary Report: CSV export (ESM)

import 'dotenv/config';
import { parse } from 'json2csv';
import sql from 'mssql';


const salesSummaryReport = async function(paramsObj) {
  // Accept both start/end and startDate/endDate
  const startDate = paramsObj.startDate || paramsObj.start;
  const endDate = paramsObj.endDate || paramsObj.end;
  let studioIds = paramsObj.studioIds || paramsObj['studioIds[]'];
  // Always treat as array
  if (Array.isArray(studioIds)) {
    studioIds = studioIds.filter(id => id && id !== '');
  } else if (typeof studioIds === 'string' && studioIds.length > 0) {
    studioIds = [studioIds];
  } else {
    studioIds = [];
  }

  let query = `SELECT s.name as studio_name, SUM(o.total) as total_sales, COUNT(o.id) as order_count
    FROM orders o
    JOIN studios s ON o.studio_id = s.id
    WHERE 1=1`;
  if (startDate) {
    query += ` AND o.created_at >= @startDate`;
  }
  if (endDate) {
    query += ` AND o.created_at <= @endDate`;
  }
  if (studioIds.length > 0) {
    query += ` AND o.studio_id IN (SELECT value FROM STRING_SPLIT(@studioIds, ','))`;
  }
  query += ' GROUP BY s.name';

  // Debug log
  console.log('[SALES SUMMARY REPORT] Final query:', query);
  const sqlParams = { startDate, endDate, studioIds: studioIds.join(',') };
  console.log('[SALES SUMMARY REPORT] Params:', sqlParams);

  // MSSQL execution
  const mssqlConfig = {
    server: process.env.DB_HOST,
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 1433,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
      encrypt: process.env.MSSQL_ENCRYPT === 'true',
      trustServerCertificate: process.env.MSSQL_TRUST_CERT === 'true',
    },
  };
  console.log('[SALES SUMMARY REPORT] Using MSSQL config:', mssqlConfig);
  const pool = await sql.connect(mssqlConfig);
  const request = pool.request();
  if (startDate) request.input('startDate', sql.DateTime, new Date(startDate));
  if (endDate) request.input('endDate', sql.DateTime, new Date(endDate));
  if (studioIds.length > 0) request.input('studioIds', sql.VarChar(sqlParams.studioIds.length), sqlParams.studioIds);
  const result = await request.query(query);
  const rows = result.recordset;
  if (!rows || rows.length === 0) {
    throw new Error('No sales summary found for the selected filters.');
  }
  return parse(rows);
};
export default salesSummaryReport;
