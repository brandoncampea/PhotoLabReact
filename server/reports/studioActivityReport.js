// Studio Activity Report: CSV export (ESM)

import 'dotenv/config';
import { parse } from 'json2csv';
import sql from 'mssql';


const studioActivityReport = async function(paramsObj) {
  const startDate = paramsObj.startDate || paramsObj.start;
  const endDate = paramsObj.endDate || paramsObj.end;

  let query = `SELECT s.name as studio_name,
    (SELECT COUNT(*) FROM photos p JOIN albums a ON p.album_id = a.id WHERE a.studio_id = s.id AND p.created_at >= @startDate AND p.created_at <= @endDate) as uploads,
    (SELECT COUNT(*) FROM orders o WHERE o.studio_id = s.id AND o.created_at >= @startDate AND o.created_at <= @endDate) as orders,
    (SELECT COALESCE(SUM(o.total),0) FROM orders o WHERE o.studio_id = s.id AND o.created_at >= @startDate AND o.created_at <= @endDate) as revenue
    FROM studios s`;

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
  const pool = await sql.connect(mssqlConfig);
  const request = pool.request();
  if (startDate) request.input('startDate', sql.DateTime, new Date(startDate));
  if (endDate) request.input('endDate', sql.DateTime, new Date(endDate));
  const result = await request.query(query);
  const rows = result.recordset;
  if (!rows || rows.length === 0) {
    throw new Error('No studio activity found for the selected filters.');
  }
  return parse(rows);
};
export default studioActivityReport;
