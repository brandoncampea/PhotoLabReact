import sql from 'mssql';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const config = process.env.MSSQL_CONNECTION_STRING || {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '1433', 10),
  options: {
    encrypt: process.env.MSSQL_ENCRYPT === 'true',
    trustServerCertificate: process.env.MSSQL_TRUST_CERT === 'true',
  },
};

const poolPromise = sql.connect(config)
  .then(pool => {
    console.log('Connected to MSSQL');
    return pool;
  })
  .catch(err => {
    console.error('MSSQL Connection Error:', err);
    throw err;
  });

export async function query(text, params = []) {
  const pool = await poolPromise;
  const request = pool.request();
  if (params && Array.isArray(params)) {
    params.forEach((param, idx) => {
      request.input(`p${idx + 1}`, param);
    });
  }
  const result = await request.query(text);
  return result.recordset;
}

export default {
  query,
};
