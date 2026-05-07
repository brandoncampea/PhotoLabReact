import mssql from '../mssql.js';

const runWhccVariantSchemaMigrations = async () => {
  try {
    await mssql.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'super_price_list_item_whcc_variants')
      CREATE TABLE super_price_list_item_whcc_variants (
        id INT IDENTITY(1,1) PRIMARY KEY,
        super_price_list_item_id INT NOT NULL,
        display_name NVARCHAR(255) NULL,
        whcc_product_uid INT NOT NULL,
        whcc_product_node_ids NVARCHAR(MAX) NULL,
        whcc_item_attribute_uids NVARCHAR(MAX) NULL,
        base_cost DECIMAL(10,2) NULL,
        price DECIMAL(10,2) NULL,
        is_default BIT NOT NULL DEFAULT 0,
        is_active BIT NOT NULL DEFAULT 1,
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE()
      )
    `);

    await mssql.query(`
      IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'IX_super_price_list_item_whcc_variants_item_id'
          AND object_id = OBJECT_ID('super_price_list_item_whcc_variants')
      )
      CREATE INDEX IX_super_price_list_item_whcc_variants_item_id
      ON super_price_list_item_whcc_variants (super_price_list_item_id)
    `);

    await mssql.query(`
      IF COL_LENGTH('super_price_list_item_whcc_variants', 'display_name') IS NULL
      BEGIN
        ALTER TABLE super_price_list_item_whcc_variants ADD display_name NVARCHAR(255) NULL
      END
    `);

    await mssql.query(`
      IF COL_LENGTH('super_price_list_item_whcc_variants', 'whcc_product_node_ids') IS NULL
      BEGIN
        ALTER TABLE super_price_list_item_whcc_variants ADD whcc_product_node_ids NVARCHAR(MAX) NULL
      END
    `);

    await mssql.query(`
      IF COL_LENGTH('super_price_list_item_whcc_variants', 'whcc_item_attribute_uids') IS NULL
      BEGIN
        ALTER TABLE super_price_list_item_whcc_variants ADD whcc_item_attribute_uids NVARCHAR(MAX) NULL
      END
    `);

    await mssql.query(`
      IF COL_LENGTH('super_price_list_item_whcc_variants', 'is_default') IS NULL
      BEGIN
        ALTER TABLE super_price_list_item_whcc_variants ADD is_default BIT NOT NULL DEFAULT 0
      END
    `);

    await mssql.query(`
      IF COL_LENGTH('super_price_list_item_whcc_variants', 'is_active') IS NULL
      BEGIN
        ALTER TABLE super_price_list_item_whcc_variants ADD is_active BIT NOT NULL DEFAULT 1
      END
    `);

    await mssql.query(`
      IF COL_LENGTH('super_price_list_item_whcc_variants', 'base_cost') IS NULL
      BEGIN
        ALTER TABLE super_price_list_item_whcc_variants ADD base_cost DECIMAL(10,2) NULL
      END
    `);

    await mssql.query(`
      IF COL_LENGTH('super_price_list_item_whcc_variants', 'price') IS NULL
      BEGIN
        ALTER TABLE super_price_list_item_whcc_variants ADD price DECIMAL(10,2) NULL
      END
    `);

    console.log('[startup] WHCC variant schema migration complete');
  } catch (error) {
    console.error('[startup] WHCC variant schema migration failed:', error?.message || error);
    throw error;
  }
};

export default runWhccVariantSchemaMigrations;
