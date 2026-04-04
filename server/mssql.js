import mssqlCjs from './mssql.cjs';

export async function query(text, params = []) {
  const result = await mssqlCjs.query(text, params);
  return result?.rows || [];
}

export async function queryRow(text, params = []) {
  return mssqlCjs.queryRow(text, params);
}

export async function queryRows(text, params = []) {
  return mssqlCjs.queryRows(text, params);
}

export async function tableExists(tableName) {
  return mssqlCjs.tableExists(tableName);
}

export async function columnExists(tableName, columnName) {
  return mssqlCjs.columnExists(tableName, columnName);
}

export async function transaction(callback) {
  return mssqlCjs.transaction(async (client) => {
    const legacyClient = {
      query: async (text, params = []) => {
        const result = await client.query(text, params);
        return result?.rows || [];
      },
    };

    return callback(legacyClient);
  });
}

export async function initializeDatabase() {
  return mssqlCjs.initializeDatabase();
}

export default {
  query,
  queryRow,
  queryRows,
  tableExists,
  columnExists,
  transaction,
  initializeDatabase,
};
