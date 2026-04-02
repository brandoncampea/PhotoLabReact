const db = require('../server/mssql.cjs');

(async () => {
  try {
    await db.query(`
      IF OBJECT_ID('stripe_config','U') IS NULL
      BEGIN
        CREATE TABLE stripe_config (
          id INT PRIMARY KEY,
          publishable_key NVARCHAR(255) NULL,
          secret_key NVARCHAR(255) NULL,
          is_live_mode BIT DEFAULT 0,
          is_active BIT DEFAULT 1,
          updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
        )
      END
    `);

    const row = await db.queryRow('SELECT TOP 1 id FROM stripe_config WHERE id = 1');
    if (row) {
      await db.query(
        'UPDATE stripe_config SET is_active = $1, is_live_mode = $2, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
        [1, 0]
      );
    } else {
      await db.query(
        'INSERT INTO stripe_config (id, is_active, is_live_mode, updated_at) VALUES (1, $1, $2, CURRENT_TIMESTAMP)',
        [1, 0]
      );
    }

    const verify = await db.queryRow(
      'SELECT id, is_active as isActive, is_live_mode as isLiveMode FROM stripe_config WHERE id = 1'
    );

    console.log(JSON.stringify({ ok: true, stripeConfig: verify }, null, 2));
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
