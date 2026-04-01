
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

const sql = require('mssql');
const bcrypt = require('bcryptjs');

const rawConnectionString = (process.env.MSSQL_CONNECTION_STRING || '').trim();
const hasValidConnectionString = /(?:^|;)\s*(server|data source)\s*=\s*/i.test(rawConnectionString);

const parseConnectionString = (connectionString) => {
	const pairs = String(connectionString)
		.split(';')
		.map((part) => part.trim())
		.filter(Boolean)
		.map((part) => {
			const idx = part.indexOf('=');
			if (idx === -1) return [part.trim().toLowerCase(), ''];
			return [part.slice(0, idx).trim().toLowerCase(), part.slice(idx + 1).trim()];
		});

	const map = new Map(pairs);
	const serverRaw = map.get('server') || map.get('data source') || '';
	const serverWithoutProtocol = serverRaw.replace(/^tcp:/i, '').trim();
	const [serverHost, serverPortRaw] = serverWithoutProtocol.split(',');
	const port = Number(serverPortRaw || map.get('port') || 1433);

	const database = map.get('initial catalog') || map.get('database') || '';
	const user = map.get('user id') || map.get('uid') || map.get('user') || '';
	const password = map.get('password') || map.get('pwd') || '';
	const encrypt = map.has('encrypt') ? String(map.get('encrypt')).toLowerCase() !== 'false' : process.env.MSSQL_ENCRYPT !== 'false';
	const trustServerCertificate = map.has('trustservercertificate')
		? String(map.get('trustservercertificate')).toLowerCase() === 'true'
		: process.env.MSSQL_TRUST_CERT === 'true';

	return {
		user,
		password,
		server: serverHost,
		port,
		database,
		options: {
			encrypt,
			trustServerCertificate,
			connectionTimeout: 5000,
			requestTimeout: 10000,
		},
	};
};

const hasDbParts = !!(process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD);

const mssqlConfig = hasValidConnectionString
	? parseConnectionString(rawConnectionString)
	: hasDbParts
	? {
			user: process.env.DB_USER || 'sa',
			password: process.env.DB_PASSWORD || 'yourStrong(!)Password',
			server: process.env.DB_HOST || 'localhost',
			port: Number(process.env.DB_PORT || 1433),
			database: process.env.DB_NAME || 'photolab',
			options: {
				encrypt: process.env.MSSQL_ENCRYPT !== 'false',
				trustServerCertificate: process.env.MSSQL_TRUST_CERT === 'true',
				connectionTimeout: 5000,
				requestTimeout: 10000,
			},
		}
	: {
			user: process.env.DB_USER || 'sa',
			password: process.env.DB_PASSWORD || 'yourStrong(!)Password',
			server: process.env.DB_HOST || 'localhost',
			port: Number(process.env.DB_PORT || 1433),
			database: process.env.DB_NAME || 'photolab',
			options: {
				encrypt: process.env.MSSQL_ENCRYPT !== 'false',
				trustServerCertificate: process.env.MSSQL_TRUST_CERT === 'true',
				connectionTimeout: 5000,
				requestTimeout: 10000,
			},
		};

let poolPromise = null;
const getPoolPromise = () => {
	if (!poolPromise) {
		const pool = new sql.ConnectionPool(mssqlConfig);
		poolPromise = pool.connect().catch((error) => {
			poolPromise = null;
			throw error;
		});
	}
	return poolPromise;
};

function transformSql(text) {
	let sqlText = text;
	if (/RETURNING\s+id/i.test(sqlText)) {
		sqlText = sqlText.replace(/RETURNING\s+id\s*;?\s*$/i, '');
		sqlText = sqlText.replace(
			/INSERT\s+INTO\s+([^\(]+\([^)]+\))\s*VALUES/i,
			'INSERT INTO $1 OUTPUT INSERTED.id VALUES'
		);
	}
	sqlText = sqlText.replace(/\$(\d+)/g, '@p$1');
	return sqlText;
}

function normalizeResult(result) {
	return {
		rows: result.recordset || [],
		rowCount: result.rowsAffected?.[0] || 0,
	};
}

async function query(text, params = []) {
	const start = Date.now();
	try {
		const poolInstance = await getPoolPromise();
		const request = poolInstance.request();
		params.forEach((param, index) => {
			request.input(`p${index + 1}`, param);
		});
		const result = await request.query(transformSql(text));
		const duration = Date.now() - start;
		console.log('Executed query', { text, duration, rows: result.rowsAffected?.[0] || 0 });
		return normalizeResult(result);
	} catch (error) {
		console.error('Database query error:', error);
		throw error;
	}
}

async function queryRow(text, params) {
	const result = await query(text, params);
	return result.rows[0];
}

async function queryRows(text, params) {
	const result = await query(text, params);
	return result.rows;
}

async function tableExists(tableName) {
	const row = await queryRow(
		`SELECT TOP 1 1 as existsFlag FROM sys.tables WHERE name = $1`,
		[tableName]
	);
	return !!row;
}

async function columnExists(tableName, columnName) {
	const row = await queryRow(
		`SELECT TOP 1 1 as existsFlag FROM sys.columns c INNER JOIN sys.tables t ON t.object_id = c.object_id WHERE t.name = $1 AND c.name = $2`,
		[tableName, columnName]
	);
	return !!row;
}

async function transaction(callback) {
	const poolInstance = await getPoolPromise();
	const tx = new sql.Transaction(poolInstance);
	await tx.begin();
	const client = {
		query: async (text, params = []) => {
			const request = new sql.Request(tx);
			params.forEach((param, index) => {
				request.input(`p${index + 1}`, param);
			});
			const result = await request.query(transformSql(text));
			return normalizeResult(result);
		},
	};
	try {
		const result = await callback(client);
		await tx.commit();
		return result;
	} catch (error) {
		await tx.rollback();
		throw error;
	}
}


async function initializeDatabase() {
	// Create all required tables if they do not exist
	await query(`
		IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'studios')
		BEGIN
			CREATE TABLE studios (
				id INT IDENTITY(1,1) PRIMARY KEY,
				name NVARCHAR(255) NOT NULL,
				email NVARCHAR(255) UNIQUE,
				created_at DATETIME2 DEFAULT GETDATE(),
				subscription_status NVARCHAR(50) DEFAULT 'inactive',
				subscription_plan NVARCHAR(50),
				subscription_start DATETIME2,
				subscription_end DATETIME2
			)
		END
	`);
	await query(`
		IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'users')
		BEGIN
			CREATE TABLE users (
				id INT IDENTITY(1,1) PRIMARY KEY,
				studio_id INT FOREIGN KEY REFERENCES studios(id) ON DELETE CASCADE,
				email NVARCHAR(255) UNIQUE NOT NULL,
				password_hash NVARCHAR(255) NOT NULL,
				name NVARCHAR(255),
				role NVARCHAR(50) DEFAULT 'customer',
				created_at DATETIME2 DEFAULT GETDATE(),
				last_login DATETIME2
			)
		END
	`);
	await query(`
		IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'albums')
		BEGIN
			CREATE TABLE albums (
				id INT IDENTITY(1,1) PRIMARY KEY,
				studio_id INT FOREIGN KEY REFERENCES studios(id) ON DELETE CASCADE,
				name NVARCHAR(255) NOT NULL,
				description NVARCHAR(MAX),
				created_at DATETIME2 DEFAULT GETDATE()
			)
		END
	`);
	await query(`
		IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'photos')
		BEGIN
			CREATE TABLE photos (
				id INT IDENTITY(1,1) PRIMARY KEY,
				album_id INT FOREIGN KEY REFERENCES albums(id) ON DELETE CASCADE,
				studio_id INT FOREIGN KEY REFERENCES studios(id) ON DELETE CASCADE,
				url NVARCHAR(MAX) NOT NULL,
				filename NVARCHAR(255),
				uploaded_at DATETIME2 DEFAULT GETDATE(),
				metadata NVARCHAR(MAX)
			)
		END
	`);
	await query(`
		IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'orders')
		BEGIN
			CREATE TABLE orders (
				id INT IDENTITY(1,1) PRIMARY KEY,
				studio_id INT FOREIGN KEY REFERENCES studios(id) ON DELETE CASCADE,
				user_id INT FOREIGN KEY REFERENCES users(id),
				status NVARCHAR(50) DEFAULT 'pending',
				total FLOAT NOT NULL,
				created_at DATETIME2 DEFAULT GETDATE(),
				updated_at DATETIME2,
				shipping_address NVARCHAR(MAX),
				billing_address NVARCHAR(MAX),
				payment_status NVARCHAR(50),
				payment_intent_id NVARCHAR(255),
				stripe_fee_amount FLOAT DEFAULT 0,
				customer_receipt_sent_at DATETIME2,
				studio_receipt_sent_at DATETIME2
			)
		END
	`);
	await query(`
		IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'order_items')
		BEGIN
			CREATE TABLE order_items (
				id INT IDENTITY(1,1) PRIMARY KEY,
				order_id INT NOT NULL FOREIGN KEY REFERENCES orders(id) ON DELETE CASCADE,
				photo_id INT NOT NULL FOREIGN KEY REFERENCES photos(id),
				photo_ids NVARCHAR(MAX),
				product_id INT NOT NULL,
				quantity INT DEFAULT 1,
				price FLOAT NOT NULL,
				crop_data NVARCHAR(MAX)
			)
		END
	`);
	await query(`
		IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'products')
		BEGIN
			CREATE TABLE products (
				id INT IDENTITY(1,1) PRIMARY KEY,
				name NVARCHAR(255) NOT NULL,
				category NVARCHAR(255) NOT NULL,
				price FLOAT NOT NULL,
				description NVARCHAR(MAX),
				cost FLOAT,
				options NVARCHAR(MAX)
			)
		END
	`);
	await query(`
		IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'price_lists')
		BEGIN
			CREATE TABLE price_lists (
				id INT IDENTITY(1,1) PRIMARY KEY,
				studio_id INT FOREIGN KEY REFERENCES studios(id) ON DELETE CASCADE,
				name NVARCHAR(255) NOT NULL,
				description NVARCHAR(MAX),
				created_at DATETIME2 DEFAULT GETDATE()
			)
		END
	`);
	await query(`
		IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'shipping_config')
		BEGIN
			CREATE TABLE shipping_config (
				id INT PRIMARY KEY,
				batch_deadline NVARCHAR(255) DEFAULT '2099-12-31T23:59:59Z',
				direct_shipping_charge FLOAT DEFAULT 10.00,
				is_active BIT DEFAULT 1,
				batch_shipping_address NVARCHAR(MAX),
				updated_at DATETIME2 DEFAULT GETDATE()
			)
		END
	`);
	await query(`
		IF COL_LENGTH('orders', 'studio_id') IS NULL
		BEGIN
			ALTER TABLE orders ADD studio_id INT NULL
		END
	`);
	await query(`
		IF COL_LENGTH('shipping_config', 'batch_shipping_address') IS NULL
		BEGIN
			ALTER TABLE shipping_config ADD batch_shipping_address NVARCHAR(MAX) NULL
		END
	`);
	await query(`
		IF COL_LENGTH('shipping_config', 'updated_at') IS NULL
		BEGIN
			ALTER TABLE shipping_config ADD updated_at DATETIME2 DEFAULT GETDATE()
		END
	`);
	await query(`
		IF COL_LENGTH('orders', 'whcc_confirmation_id') IS NULL
		BEGIN
			ALTER TABLE orders ADD whcc_confirmation_id NVARCHAR(255) NULL
		END
	`);
	await query(`
		IF COL_LENGTH('orders', 'whcc_import_response') IS NULL
		BEGIN
			ALTER TABLE orders ADD whcc_import_response NVARCHAR(MAX) NULL
		END
	`);
	await query(`
		IF COL_LENGTH('orders', 'whcc_submit_response') IS NULL
		BEGIN
			ALTER TABLE orders ADD whcc_submit_response NVARCHAR(MAX) NULL
		END
	`);
	await query(`
		IF COL_LENGTH('orders', 'whcc_last_error') IS NULL
		BEGIN
			ALTER TABLE orders ADD whcc_last_error NVARCHAR(MAX) NULL
		END
	`);
	await query(`
		IF COL_LENGTH('orders', 'whcc_order_number') IS NULL
		BEGIN
			ALTER TABLE orders ADD whcc_order_number NVARCHAR(255) NULL
		END
	`);
	await query(`
		IF COL_LENGTH('orders', 'whcc_webhook_status') IS NULL
		BEGIN
			ALTER TABLE orders ADD whcc_webhook_status NVARCHAR(100) NULL
		END
	`);
	await query(`
		IF COL_LENGTH('orders', 'whcc_webhook_event') IS NULL
		BEGIN
			ALTER TABLE orders ADD whcc_webhook_event NVARCHAR(100) NULL
		END
	`);
	await query(`
		IF COL_LENGTH('orders', 'whcc_webhook_payload') IS NULL
		BEGIN
			ALTER TABLE orders ADD whcc_webhook_payload NVARCHAR(MAX) NULL
		END
	`);
	await query(`
		IF COL_LENGTH('orders', 'whcc_webhook_received_at') IS NULL
		BEGIN
			ALTER TABLE orders ADD whcc_webhook_received_at DATETIME2 NULL
		END
	`);
	await query(`
		IF COL_LENGTH('orders', 'shipping_carrier') IS NULL
		BEGIN
			ALTER TABLE orders ADD shipping_carrier NVARCHAR(100) NULL
		END
	`);
	await query(`
		IF COL_LENGTH('orders', 'tracking_number') IS NULL
		BEGIN
			ALTER TABLE orders ADD tracking_number NVARCHAR(255) NULL
		END
	`);
	await query(`
		IF COL_LENGTH('orders', 'tracking_url') IS NULL
		BEGIN
			ALTER TABLE orders ADD tracking_url NVARCHAR(MAX) NULL
		END
	`);
	await query(`
		IF COL_LENGTH('orders', 'shipped_at') IS NULL
		BEGIN
			ALTER TABLE orders ADD shipped_at DATETIME2 NULL
		END
	`);
	await query(`
		IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'whcc_webhook_config')
		BEGIN
			CREATE TABLE whcc_webhook_config (
				studio_id INT PRIMARY KEY,
				callback_uri NVARCHAR(MAX) NULL,
				last_verifier NVARCHAR(255) NULL,
				verified_at DATETIME2 NULL,
				last_registration_response NVARCHAR(MAX) NULL,
				last_verification_response NVARCHAR(MAX) NULL,
				last_payload NVARCHAR(MAX) NULL,
				last_received_at DATETIME2 NULL,
				created_at DATETIME2 DEFAULT GETDATE(),
				updated_at DATETIME2 DEFAULT GETDATE(),
				CONSTRAINT fk_whcc_webhook_config_studio FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE
			)
		END
	`);
	await query(`
		IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_shipping_config_id')
		BEGIN
			ALTER TABLE shipping_config DROP CONSTRAINT ck_shipping_config_id
		END
	`);
	// Add more tables as needed for your app...
	// (price_list_products, product_sizes, packages, etc.)
}

module.exports = {
	query,
	queryRow,
	queryRows,
	tableExists,
	columnExists,
	transaction,
	initializeDatabase,
	poolPromise: getPoolPromise(),
};
