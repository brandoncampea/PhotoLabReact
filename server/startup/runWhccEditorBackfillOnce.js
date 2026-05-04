import fs from 'fs/promises';
import path from 'path';
import mssql from '../mssql.cjs';

const { query, queryRow, transaction } = mssql;

const safeJsonParse = (value, fallback = {}) => {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const loadMappingsPayload = async (filePath, seen = new Set()) => {
  const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  if (seen.has(resolvedPath)) {
    throw new Error(`Recursive mapping source detected: ${resolvedPath}`);
  }

  seen.add(resolvedPath);
  const fileRaw = await fs.readFile(resolvedPath, 'utf8');
  const parsed = JSON.parse(fileRaw);

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.sourceFile) {
    const nested = await loadMappingsPayload(String(parsed.sourceFile), seen);
    const inlineMappings = Array.isArray(parsed.mappings) ? parsed.mappings : [];
    return {
      mappingPath: resolvedPath,
      sourcePath: nested.sourcePath,
      rows: [...inlineMappings, ...nested.rows],
    };
  }

  const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.mappings) ? parsed.mappings : [];
  return {
    mappingPath: resolvedPath,
    sourcePath: resolvedPath,
    rows,
  };
};

const normalizeRow = (row, idx) => {
  const rowLabel = `row ${idx + 1}`;
  const source = {
    ...(row || {}),
    ...((row && typeof row === 'object' && row.mapping && typeof row.mapping === 'object') ? row.mapping : {}),
  };

  const productId = Number(source?.productId || row?.productId || 0);
  const productName = String(source?.productName || row?.productName || '').trim();
  const whccEditorProductId = String(source?.whccEditorProductId || '').trim();
  const whccEditorDesignId = String(source?.whccEditorDesignId || '').trim();
  const editorProvider = String(source?.editorProvider || 'whcc').trim().toLowerCase() || 'whcc';
  const requiresWhccEditor = source?.requiresWhccEditor !== false;

  const errors = [];
  if (!Number.isInteger(productId) || productId <= 0) errors.push(`${rowLabel}: productId must be a positive integer`);

  return {
    productId,
    productName,
    whccEditorProductId,
    whccEditorDesignId,
    editorProvider,
    requiresWhccEditor,
    isComplete: !!whccEditorProductId && !!whccEditorDesignId,
    errors,
  };
};

const buildNextOptions = (currentOptions, mapping) => ({
  ...currentOptions,
  editorProvider: mapping.editorProvider,
  requiresWhccEditor: mapping.requiresWhccEditor,
  whccEditorProductId: mapping.whccEditorProductId,
  whccEditorDesignId: mapping.whccEditorDesignId,
});

// Product-only mappings are now enabled for editor launch.
const buildMappingOnlyOptions = (currentOptions, mapping) => ({
  ...currentOptions,
  editorProvider: mapping.editorProvider,
  requiresWhccEditor: true,
  whccEditorProductId: mapping.whccEditorProductId,
  whccEditorDesignId: mapping.whccEditorDesignId || currentOptions.whccEditorDesignId || '',
});

const optionsChanged = (before, after) => JSON.stringify(before) !== JSON.stringify(after);

const isTrue = (value) => String(value || '').trim().toLowerCase() === 'true';

async function ensureStartupTaskTable() {
  await query(
    `IF OBJECT_ID('dbo.startup_tasks', 'U') IS NULL
     BEGIN
       CREATE TABLE startup_tasks (
         task_name NVARCHAR(255) NOT NULL PRIMARY KEY,
         status NVARCHAR(32) NOT NULL,
         started_at DATETIME2 NOT NULL DEFAULT CURRENT_TIMESTAMP,
         completed_at DATETIME2 NULL,
         updated_count INT NOT NULL DEFAULT 0,
         details NVARCHAR(MAX) NULL,
         last_error NVARCHAR(MAX) NULL
       )
     END`,
    []
  );
}

async function acquireTaskLock(taskName) {
  try {
    await query(
      `INSERT INTO startup_tasks (task_name, status, started_at)
       VALUES ($1, 'running', CURRENT_TIMESTAMP)`,
      [taskName]
    );
    return { acquired: true, existing: null };
  } catch (error) {
    const existing = await queryRow('SELECT task_name as taskName, status FROM startup_tasks WHERE task_name = $1', [taskName]);
    return { acquired: false, existing, error };
  }
}

async function completeTask(taskName, updatedCount, details) {
  await query(
    `UPDATE startup_tasks
     SET status = 'completed',
         completed_at = CURRENT_TIMESTAMP,
         updated_count = $2,
         details = $3,
         last_error = NULL
     WHERE task_name = $1`,
    [taskName, Number(updatedCount) || 0, details ? JSON.stringify(details) : null]
  );
}

async function failTask(taskName, errorMessage, details) {
  await query(
    `UPDATE startup_tasks
     SET status = 'failed',
         completed_at = CURRENT_TIMESTAMP,
         details = $2,
         last_error = $3
     WHERE task_name = $1`,
    [taskName, details ? JSON.stringify(details) : null, String(errorMessage || 'Unknown error')]
  );
}

export default async function runWhccEditorBackfillOnce({ appVersion = 'unknown' } = {}) {
  const enabled = isTrue(process.env.WHCC_EDITOR_BACKFILL_ON_DEPLOY);
  if (!enabled) {
    console.log('[startup] WHCC editor backfill is disabled (set WHCC_EDITOR_BACKFILL_ON_DEPLOY=true to enable).');
    return;
  }

  const strict = isTrue(process.env.WHCC_EDITOR_BACKFILL_STRICT);
  // Product-only mappings (have productId but no designId) are always applied and enabled.
  const runKey = String(process.env.WHCC_EDITOR_BACKFILL_RUN_KEY || appVersion || 'manual').trim();
  const taskName = `whcc-editor-backfill:${runKey}`;
  const mappingFile = String(process.env.WHCC_EDITOR_BACKFILL_FILE || 'server/scripts/whcc-editor-mapping.json').trim();
  const mappingPath = path.isAbsolute(mappingFile) ? mappingFile : path.resolve(process.cwd(), mappingFile);

  await ensureStartupTaskTable();

  const lock = await acquireTaskLock(taskName);
  if (!lock.acquired) {
    if (lock.existing?.status === 'completed') {
      console.log(`[startup] WHCC editor backfill already completed for ${taskName}. Skipping.`);
      return;
    }
    console.log(`[startup] WHCC editor backfill task already exists with status=${lock.existing?.status || 'unknown'} for ${taskName}. Skipping duplicate run.`);
    return;
  }

  try {
    const { sourcePath, rows } = await loadMappingsPayload(mappingPath);

    if (!rows.length) {
      await completeTask(taskName, 0, { message: 'No mapping rows found; nothing to update.', mappingPath });
      console.log('[startup] WHCC editor backfill mapping file is empty. Nothing to do.');
      return;
    }

    const normalized = rows.map(normalizeRow);
    const validationErrors = normalized.flatMap((row) => row.errors);
    if (validationErrors.length) {
      throw new Error(`Validation failed: ${validationErrors.join(' | ')}`);
    }

    const incompleteMappings = normalized.filter((row) => !row.isComplete);
    if (incompleteMappings.length) {
      const idsPreview = incompleteMappings.slice(0, 20).map((row) => row.productId).join(', ');
      if (strict) {
        throw new Error(`Strict mode failed. Incomplete mappings: ${idsPreview}`);
      }
      console.warn(`[startup] Skipping ${incompleteMappings.length} incomplete mappings (missing editor IDs).`);
    }

    const report = {
      totalRows: normalized.length,
      skippedIncomplete: 0,
      missingProducts: [],
      unchanged: 0,
      appliedComplete: 0,
      appliedProductOnlyMapped: 0,
      toUpdate: [],
    };

    for (const mapping of normalized) {
      const product = await queryRow('SELECT id, name, category, options FROM products WHERE id = $1', [mapping.productId]);
      if (!product) {
        report.missingProducts.push(mapping.productId);
        continue;
      }

      const isProductOnly = !!mapping.whccEditorProductId && !mapping.whccEditorDesignId;
      const isActionableComplete = mapping.isComplete;
      // Product-only rows (have productId, no designId) are enabled for editor usage.
      const isActionableProductOnly = isProductOnly;

      if (!isActionableComplete && !isActionableProductOnly) {
        report.skippedIncomplete += 1;
        continue;
      }

      const currentOptions = safeJsonParse(product.options, {});
      // Product-only rows are now enabled (requiresWhccEditor=true)
      const nextOptions = isActionableComplete
        ? buildNextOptions(currentOptions, mapping)
        : buildMappingOnlyOptions(currentOptions, mapping);

      if (!optionsChanged(currentOptions, nextOptions)) {
        report.unchanged += 1;
        continue;
      }

      report.toUpdate.push({
        productId: Number(product.id),
        productName: String(product.name || ''),
        isProductOnlyMapped: isActionableProductOnly,
        nextOptions,
      });

      if (isActionableComplete) {
        report.appliedComplete += 1;
      } else {
        report.appliedProductOnlyMapped += 1;
      }
    }

    if (strict && report.missingProducts.length) {
      throw new Error(`Strict mode failed. Missing product IDs: ${report.missingProducts.join(', ')}`);
    }

    if (report.toUpdate.length) {
      await transaction(async (tx) => {
        for (const item of report.toUpdate) {
          await tx.query('UPDATE products SET options = $1 WHERE id = $2', [JSON.stringify(item.nextOptions), item.productId]);
        }
      });
    }

    const details = {
      mappingPath,
      sourcePath,
      totalRows: report.totalRows,
      skippedIncomplete: report.skippedIncomplete,
      appliedComplete: report.appliedComplete,
      appliedProductOnlyMapped: report.appliedProductOnlyMapped,
      updatedCount: report.toUpdate.length,
      unchangedCount: report.unchanged,
      missingProducts: report.missingProducts,
    };

    await completeTask(taskName, report.toUpdate.length, details);

    console.log(`[startup] WHCC editor backfill complete: updated=${report.toUpdate.length} (complete=${report.appliedComplete}, mappedOnly=${report.appliedProductOnlyMapped}), unchanged=${report.unchanged}, missing=${report.missingProducts.length}, skippedIncomplete=${report.skippedIncomplete}, skippedProductOnly=${report.skippedProductOnly}`);
    console.log(`[startup] WHCC editor backfill complete: updated=${report.toUpdate.length} (complete=${report.appliedComplete}, mappedOnly=${report.appliedProductOnlyMapped}), unchanged=${report.unchanged}, missing=${report.missingProducts.length}, skippedIncomplete=${report.skippedIncomplete}`);
  } catch (error) {
    await failTask(taskName, error?.message || String(error), { mappingPath });
    console.error('[startup] WHCC editor backfill failed:', error?.message || error);
  }
}
