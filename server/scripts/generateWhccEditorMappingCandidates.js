import fs from 'fs/promises';
import path from 'path';
import mssql from '../mssql.cjs';

const { queryRows } = mssql;

const args = process.argv.slice(2);

const getArgValue = (name, fallback = '') => {
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  return String(args[idx + 1] || fallback).trim();
};

const outputArg = getArgValue('--out', 'server/scripts/whcc-editor-mapping.candidates.json');

const safeJsonParse = (value, fallback = {}) => {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const looksEditorEligible = (name, category, options) => {
  const n = String(name || '').toLowerCase();
  const c = String(category || '').toLowerCase();

  const keywordHit = /card|folded|flat|album|book|announcement|calendar|invite|stationery|press\s*print/.test(`${n} ${c}`);
  const explicitFlag = options?.requiresWhccEditor === true || String(options?.editorProvider || '').toLowerCase() === 'whcc';

  return keywordHit || explicitFlag;
};

const main = async () => {
  const outputPath = path.isAbsolute(outputArg) ? outputArg : path.resolve(process.cwd(), outputArg);

  const rows = await queryRows(
    `SELECT id, name, category, options
     FROM products
     ORDER BY category, name`,
    []
  );

  const candidates = [];
  const alreadyMapped = [];

  for (const row of rows) {
    const options = safeJsonParse(row.options, {});

    const current = {
      editorProvider: String(options?.editorProvider || '').trim() || null,
      requiresWhccEditor: options?.requiresWhccEditor === true,
      whccEditorProductId: String(options?.whccEditorProductId || '').trim() || null,
      whccEditorDesignId: String(options?.whccEditorDesignId || '').trim() || null,
    };

    if (current.whccEditorProductId && current.whccEditorDesignId) {
      alreadyMapped.push({
        productId: Number(row.id),
        productName: String(row.name || ''),
        ...current,
      });
      continue;
    }

    const hasWhccOrderSubmitHints =
      Number(options?.whccProductUID || options?.productUID || 0) > 0 ||
      Number(options?.whccProductNodeID || options?.productNodeID || 0) > 0;

    if (!hasWhccOrderSubmitHints && !looksEditorEligible(row.name, row.category, options)) {
      continue;
    }

    candidates.push({
      productId: Number(row.id),
      productName: String(row.name || ''),
      category: String(row.category || ''),
      existingHints: {
        whccProductUID: Number(options?.whccProductUID || options?.productUID || 0) || null,
        whccProductNodeID: Number(options?.whccProductNodeID || options?.productNodeID || 0) || null,
      },
      mapping: {
        editorProvider: 'whcc',
        requiresWhccEditor: true,
        whccEditorProductId: '',
        whccEditorDesignId: '',
      },
      notes: 'Fill whccEditorProductId and whccEditorDesignId from WHCC Editor API docs/catalog.',
    });
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalProductsScanned: rows.length,
      alreadyMappedCount: alreadyMapped.length,
      candidateCount: candidates.length,
    },
    alreadyMapped,
    candidates,
  };

  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2));

  console.log(`Generated: ${outputPath}`);
  console.log(`Products scanned: ${rows.length}`);
  console.log(`Already mapped: ${alreadyMapped.length}`);
  console.log(`Candidates: ${candidates.length}`);
};

main().catch((error) => {
  console.error('❌ Failed to generate WHCC editor mapping candidates:', error?.message || error);
  process.exit(1);
});
