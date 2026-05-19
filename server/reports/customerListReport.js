// Customer List Report: CSV export (ESM)

import 'dotenv/config';
import { parse } from 'json2csv';
import sql from 'mssql';


const customerListReport = async function(paramsObj) {
  const startDate = paramsObj.startDate || paramsObj.start;
  const endDate = paramsObj.endDate || paramsObj.end;
  let studioIds = paramsObj.studioIds || paramsObj['studioIds[]'];
  if (Array.isArray(studioIds)) {
    studioIds = studioIds.filter(id => id && id !== '');
  } else if (typeof studioIds === 'string' && studioIds.length > 0) {
    studioIds = [studioIds];
  } else {
    studioIds = [];
  }

  let query = `SELECT DISTINCT u.name as customer_name, u.email as customer_email, s.name as studio_name, COUNT(o.id) as order_count
    FROM orders o
    JOIN users u ON o.user_id = u.id
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
  query += ' GROUP BY u.name, u.email, s.name';

  const sqlParams = { startDate, endDate, studioIds: studioIds.join(',') };
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
  if (studioIds.length > 0) request.input('studioIds', sql.VarChar(sqlParams.studioIds.length), sqlParams.studioIds);
  const result = await request.query(query);
  const rows = result.recordset;
  if (!rows || rows.length === 0) {
    throw new Error('No customers found for the selected filters.');
  }
  return parse(rows);
};
export default customerListReport;
