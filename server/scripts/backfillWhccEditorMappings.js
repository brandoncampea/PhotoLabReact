import fs from 'fs/promises';
import path from 'path';
import mssql from '../mssql.cjs';

const { queryRow, transaction } = mssql;

const args = process.argv.slice(2);

const getArgValue = (name, fallback = '') => {
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  return String(args[idx + 1] || fallback).trim();
};

const hasFlag = (name) => args.includes(name);

const mappingFileArg = getArgValue('--file', 'server/scripts/whcc-editor-mapping.json');
const apply = hasFlag('--apply');
const strict = hasFlag('--strict');

const resolvePath = (value) => {
  if (!value) return path.resolve(process.cwd(), 'server/scripts/whcc-editor-mapping.json');
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
};

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
  const resolvedPath = resolvePath(filePath);
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
  const whccEditorProductId = String(source?.whccEditorProductId || '').trim();
  const whccEditorDesignId = String(source?.whccEditorDesignId || '').trim();
  const editorProvider = String(source?.editorProvider || 'whcc').trim().toLowerCase() || 'whcc';
  const requiresWhccEditor = source?.requiresWhccEditor !== false;

  const errors = [];
  if (!Number.isInteger(productId) || productId <= 0) {
    errors.push(`${rowLabel}: productId must be a positive integer`);
  }
  return {
    productId,
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

const optionsChanged = (before, after) => JSON.stringify(before) !== JSON.stringify(after);

const main = async () => {
  const { mappingPath, sourcePath, rows } = await loadMappingsPayload(mappingFileArg);

  if (!rows.length) {
    console.log(`No mappings found in ${mappingPath}. Nothing to update.`);
    return;
  }

  const normalized = rows.map(normalizeRow);
  const validationErrors = normalized.flatMap((r) => r.errors);
  if (validationErrors.length) {
    console.error('❌ Validation errors:');
    validationErrors.forEach((err) => console.error(`  - ${err}`));
    process.exit(1);
  }

  const incompleteMappings = normalized.filter((r) => !r.isComplete);
  if (incompleteMappings.length) {
    const idsPreview = incompleteMappings.slice(0, 20).map((r) => r.productId).join(', ');
    if (strict) {
      console.error(`❌ Strict mode: ${incompleteMappings.length} incomplete mappings (missing whccEditorProductId/whccEditorDesignId).`);
      if (idsPreview) console.error(`   productIds (first 20): ${idsPreview}`);
      process.exit(1);
    }
    console.warn(`⚠ Skipping ${incompleteMappings.length} incomplete mappings (missing whccEditorProductId/whccEditorDesignId).`);
    if (idsPreview) console.warn(`   productIds (first 20): ${idsPreview}`);
  }

  const actionableMappings = normalized.filter((r) => r.isComplete);

  const seen = new Set();
  const duplicateIds = [];
  for (const r of actionableMappings) {
    if (seen.has(r.productId)) duplicateIds.push(r.productId);
    seen.add(r.productId);
  }
  if (duplicateIds.length) {
    console.error('❌ Duplicate product IDs in mapping file:', Array.from(new Set(duplicateIds)).join(', '));
    process.exit(1);
  }

  const report = {
    totalRows: normalized.length,
    skippedIncomplete: normalized.length - actionableMappings.length,
    missingProducts: [],
    unchanged: [],
    toUpdate: [],
    updated: [],
  };

  for (const mapping of actionableMappings) {
    const product = await queryRow(
      'SELECT id, name, options FROM products WHERE id = $1',
      [mapping.productId]
    );

    if (!product) {
      report.missingProducts.push({ productId: mapping.productId });
      continue;
    }

    const currentOptions = safeJsonParse(product.options, {});
    const nextOptions = buildNextOptions(currentOptions, mapping);

    if (!optionsChanged(currentOptions, nextOptions)) {
      report.unchanged.push({
        productId: Number(product.id),
        productName: String(product.name || ''),
      });
      continue;
    }

    report.toUpdate.push({
      productId: Number(product.id),
      productName: String(product.name || ''),
      before: {
        editorProvider: currentOptions.editorProvider ?? null,
        requiresWhccEditor: currentOptions.requiresWhccEditor ?? null,
        whccEditorProductId: currentOptions.whccEditorProductId ?? null,
        whccEditorDesignId: currentOptions.whccEditorDesignId ?? null,
      },
      after: {
        editorProvider: nextOptions.editorProvider ?? null,
        requiresWhccEditor: nextOptions.requiresWhccEditor ?? null,
        whccEditorProductId: nextOptions.whccEditorProductId ?? null,
        whccEditorDesignId: nextOptions.whccEditorDesignId ?? null,
      },
      nextOptions,
    });
  }

  console.log('WHCC Editor backfill summary:');
  console.log(`  mapping rows: ${report.totalRows}`);
  console.log(`  source file: ${sourcePath}`);
  console.log(`  skipped incomplete: ${report.skippedIncomplete}`);
  console.log(`  missing products: ${report.missingProducts.length}`);
  console.log(`  unchanged: ${report.unchanged.length}`);
  console.log(`  updates needed: ${report.toUpdate.length}`);

  if (report.missingProducts.length) {
    console.log('  missing product IDs:', report.missingProducts.map((r) => r.productId).join(', '));
    if (strict) {
      console.error('❌ Strict mode enabled and missing products found. Aborting.');
      process.exit(1);
    }
  }

  if (!apply) {
    const preview = report.toUpdate.slice(0, 20).map((r) => ({
      productId: r.productId,
      productName: r.productName,
      before: r.before,
      after: r.after,
    }));

    console.log('\nDry run preview (first 20):');
    console.log(JSON.stringify(preview, null, 2));
    console.log('\nNo changes applied. Re-run with --apply to persist.');
    return;
  }

  if (!report.toUpdate.length) {
    console.log('No updates required.');
    return;
  }

  await transaction(async (tx) => {
    for (const row of report.toUpdate) {
      await tx.query('UPDATE products SET options = $1 WHERE id = $2', [JSON.stringify(row.nextOptions), row.productId]);
      report.updated.push({ productId: row.productId, productName: row.productName });
    }
  });

  console.log(`✅ Applied ${report.updated.length} updates in a single transaction.`);
};

main().catch((error) => {
  console.error('❌ WHCC editor backfill failed:', error?.message || error);
  process.exit(1);
});
