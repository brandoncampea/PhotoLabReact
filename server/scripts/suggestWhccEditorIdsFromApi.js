import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const args = process.argv.slice(2);

const getArgValue = (name, fallback = '') => {
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  return String(args[idx + 1] || fallback).trim();
};

const inFile = getArgValue('--in', 'server/scripts/whcc-editor-mapping.candidates.json');
const outFile = getArgValue('--out', 'server/scripts/whcc-editor-mapping.suggested.json');

const editorApiBase = String(process.env.WHCC_EDITOR_API_BASE || 'https://prospector.dragdrop.design/api/v1').trim().replace(/\/$/, '');
const editorKey = String(process.env.WHCC_EDITOR_KEY || '').trim();
const editorSecret = String(process.env.WHCC_EDITOR_SECRET || '').trim();

const PROD_BASE = 'https://prospector.dragdrop.design/api/v1';
const STAGE_BASE = 'https://prospector-stage.dragdrop.design/api/v1';

const normalize = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getOrientation = (value) => {
  const raw = String(value || '').toLowerCase();
  if (/\b(horizontal|landscape)\b/.test(raw)) return 'horizontal';
  if (/\b(vertical|portrait)\b/.test(raw)) return 'vertical';
  return null;
};

const getSizeToken = (value) => {
  const match = String(value || '').toLowerCase().match(/\b(\d+(?:\.\d+)?x\d+(?:\.\d+)?)\b/);
  return match ? match[1] : null;
};

const tokenSet = (value) => new Set(normalize(value).split(' ').filter(Boolean));

const scoreNameMatch = (a, b) => {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;

  let score = 0;
  if (na === nb) score = 100;
  else if (na.includes(nb) || nb.includes(na)) score = 70;

  const ta = tokenSet(a);
  const tb = tokenSet(b);
  const intersection = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size || 1;
  const jaccard = intersection / union;
  score = Math.max(score, Math.round(jaccard * 60));

  const orientationA = getOrientation(a);
  const orientationB = getOrientation(b);
  if (orientationA && orientationB) {
    if (orientationA === orientationB) score += 15;
    else score -= 25;
  }

  const sizeA = getSizeToken(a);
  const sizeB = getSizeToken(b);
  if (sizeA && sizeB) {
    if (sizeA === sizeB) score += 20;
    else score -= 20;
  }

  return Math.max(0, Math.min(100, score));
};

const selectBestProduct = (localProductName, whccProducts) => {
  let best = null;
  let bestScore = 0;

  for (const p of whccProducts) {
    const score = scoreNameMatch(localProductName, p?.name);
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }

  if (!best || bestScore < 40) return { product: null, score: bestScore };
  return { product: best, score: bestScore };
};

const authPayloadVariants = (key, secret) => [
  {
    label: 'key+secret+claims',
    payload: {
      key,
      secret,
      claims: { accountId: 'whcc-editor-mapping-sync' },
    },
  },
  {
    label: 'key+secret',
    payload: {
      key,
      secret,
    },
  },
  {
    label: 'clientKey+clientSecret+claims',
    payload: {
      clientKey: key,
      clientSecret: secret,
      claims: { accountId: 'whcc-editor-mapping-sync' },
    },
  },
  {
    label: 'clientKey+clientSecret',
    payload: {
      clientKey: key,
      clientSecret: secret,
    },
  },
];

const tryGetAccessToken = async (base, key, secret) => {
  const errors = [];
  for (const variant of authPayloadVariants(key, secret)) {
    try {
      const response = await axios.post(`${base}/auth/access-token`, variant.payload, {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });

      const token = response?.data?.accessToken;
      if (token) {
        return {
          ok: true,
          accessToken: token,
          variant: variant.label,
        };
      }

      errors.push({
        variant: variant.label,
        status: response?.status || null,
        details: 'No accessToken in response',
      });
    } catch (error) {
      errors.push({
        variant: variant.label,
        status: error?.response?.status || null,
        details: error?.response?.data || error?.message || 'Request failed',
      });
    }
  }

  return {
    ok: false,
    errors,
  };
};

const main = async () => {
  if (!editorKey || !editorSecret) {
    throw new Error('Missing WHCC_EDITOR_KEY or WHCC_EDITOR_SECRET in .env.local');
  }

  const inputPath = path.isAbsolute(inFile) ? inFile : path.resolve(process.cwd(), inFile);
  const outputPath = path.isAbsolute(outFile) ? outFile : path.resolve(process.cwd(), outFile);

  const inputRaw = await fs.readFile(inputPath, 'utf8');
  const inputJson = JSON.parse(inputRaw);
  const candidates = Array.isArray(inputJson)
    ? inputJson
    : Array.isArray(inputJson?.candidates)
    ? inputJson.candidates
    : Array.isArray(inputJson?.mappings)
    ? inputJson.mappings
    : [];

  if (!candidates.length) {
    throw new Error(`No candidates found in ${inputPath}`);
  }

  const candidateBases = Array.from(new Set([editorApiBase, PROD_BASE, STAGE_BASE].map((v) => String(v || '').trim()).filter(Boolean)));

  let accessToken = null;
  let resolvedBase = null;
  let authVariant = null;
  const authFailures = [];

  for (const base of candidateBases) {
    const result = await tryGetAccessToken(base, editorKey, editorSecret);
    if (result.ok) {
      accessToken = result.accessToken;
      resolvedBase = base;
      authVariant = result.variant;
      break;
    }
    authFailures.push({ base, attempts: result.errors });
  }

  if (!accessToken || !resolvedBase) {
    throw new Error(
      `Failed to authenticate against WHCC Editor API. Tried bases: ${candidateBases.join(', ')}. ` +
      `Check WHCC_EDITOR_KEY/WHCC_EDITOR_SECRET and WHCC_EDITOR_API_BASE. Details: ${JSON.stringify(authFailures)}`
    );
  }

  console.log(`Authenticated against ${resolvedBase} using ${authVariant}`);

  const commonHeaders = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Accept-Encoding': 'gzip, deflate, br',
  };

  const [productsResp, designsResp] = await Promise.all([
    axios.get(`${resolvedBase}/products`, { headers: commonHeaders }),
    axios.get(`${resolvedBase}/designs`, { headers: commonHeaders }),
  ]);

  const whccProducts = Array.isArray(productsResp?.data) ? productsResp.data : [];
  const whccDesigns = Array.isArray(designsResp?.data) ? designsResp.data : [];

  const designsByProductId = new Map();
  for (const d of whccDesigns) {
    const pid = String(d?.product?._id || '').trim();
    if (!pid) continue;
    if (!designsByProductId.has(pid)) designsByProductId.set(pid, []);
    designsByProductId.get(pid).push(d);
  }

  const mappings = [];
  let matched = 0;
  let unmatched = 0;

  for (const row of candidates) {
    const productId = Number(row?.productId || row?.mapping?.productId || 0);
    const productName = String(row?.productName || row?.name || '').trim();

    if (!productId || !productName) {
      unmatched += 1;
      continue;
    }

    const best = selectBestProduct(productName, whccProducts);
    if (!best.product) {
      mappings.push({
        productId,
        productName,
        editorProvider: 'whcc',
        requiresWhccEditor: true,
        whccEditorProductId: '',
        whccEditorDesignId: '',
        _match: { status: 'unmatched', score: best.score },
      });
      unmatched += 1;
      continue;
    }

    const whccEditorProductId = String(best.product?._id || '').trim();
    const productDesigns = designsByProductId.get(whccEditorProductId) || [];

    const selectedDesign = productDesigns[0] || null;
    const whccEditorDesignId = String(selectedDesign?._id || '').trim();

    mappings.push({
      productId,
      productName,
      editorProvider: 'whcc',
      requiresWhccEditor: true,
      whccEditorProductId,
      whccEditorDesignId,
      _match: {
        status: whccEditorDesignId ? 'matched' : 'product-only',
        score: best.score,
        matchedWhccProductName: String(best.product?.name || ''),
        designCountForProduct: productDesigns.length,
      },
    });

    matched += 1;
  }

  const output = {
    generatedAt: new Date().toISOString(),
    source: inputPath,
    editorApiBase: resolvedBase,
    authVariant,
    summary: {
      candidates: candidates.length,
      matchedProducts: matched,
      unmatchedProducts: unmatched,
      suggestedMappings: mappings.length,
      completeMappings: mappings.filter((m) => m.whccEditorProductId && m.whccEditorDesignId).length,
      productOnlyMappings: mappings.filter((m) => m.whccEditorProductId && !m.whccEditorDesignId).length,
    },
    mappings,
  };

  await fs.writeFile(outputPath, JSON.stringify(output, null, 2));

  console.log(`Generated: ${outputPath}`);
  console.log(`Candidates: ${candidates.length}`);
  console.log(`Matched products: ${matched}`);
  console.log(`Unmatched: ${unmatched}`);
  console.log(`Complete mappings: ${output.summary.completeMappings}`);
};

main().catch((error) => {
  console.error('❌ Failed to suggest WHCC editor IDs:', error?.response?.data || error?.message || error);
  process.exit(1);
});
