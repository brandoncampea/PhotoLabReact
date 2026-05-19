// Photo Uploads Report: CSV export (ESM)

import 'dotenv/config';
import { parse } from 'json2csv';
import sql from 'mssql';


const photoUploadsReport = async function(paramsObj) {
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

  let query = `SELECT p.id, p.file_name, p.created_at, a.name as album_name, s.name as studio_name
    FROM photos p
    JOIN albums a ON p.album_id = a.id
    JOIN studios s ON a.studio_id = s.id
    WHERE 1=1`;
  if (startDate) {
    query += ` AND p.created_at >= @startDate`;
  }
  if (endDate) {
    query += ` AND p.created_at <= @endDate`;
  }
  if (studioIds.length > 0) {
    query += ` AND s.id IN (SELECT value FROM STRING_SPLIT(@studioIds, ','))`;
  }

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
    throw new Error('No photo uploads found for the selected filters.');
  }
  return parse(rows);
};
export default photoUploadsReport;
