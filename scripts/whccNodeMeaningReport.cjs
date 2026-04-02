require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const axios = require('axios');

function hasSignal(values, regex) {
  return values.some((v) => regex.test(String(v || '')));
}

(async () => {
  const base = process.env.WHCC_SANDBOX === 'true'
    ? 'https://sandbox.apps.whcc.com'
    : 'https://apps.whcc.com';

  const tokenResp = await axios.get(`${base}/api/AccessToken`, {
    params: {
      grant_type: 'consumer_credentials',
      consumer_key: process.env.WHCC_CONSUMER_KEY,
      consumer_secret: process.env.WHCC_CONSUMER_SECRET,
    },
    headers: { Accept: 'application/json' },
  });

  const token = tokenResp.data?.Token || tokenResp.data?.token;
  const catalogResp = await axios.get(`${base}/api/catalog`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  const categories = Array.isArray(catalogResp.data?.Categories)
    ? catalogResp.data.Categories
    : [];

  const rows = [];
  const perCategoryImageMode = [];

  for (const category of categories) {
    const categoryName = String(category?.Name || 'Uncategorized');
    const productList = Array.isArray(category?.ProductList) ? category.ProductList : [];
    const productNodeCounts = [];

    for (const product of productList) {
      const productUID = Number(
        product?.Id ?? product?.ProductUID ?? product?.ProductId ?? 0
      ) || 0;
      if (!productUID) continue;

      const productName = String(product?.Name || '');
      const nodes = Array.isArray(product?.ProductNodes) ? product.ProductNodes : [];
      const bookAttributes = Array.isArray(product?.bookAttributes) ? product.bookAttributes : [];
      const attributeCategories = Array.isArray(product?.AttributeCategories)
        ? product.AttributeCategories
        : [];
      const attributeCategoryNames = attributeCategories.map((ac) => ac?.AttributeCategoryName);
      const attributeNames = attributeCategories.flatMap((ac) =>
        (Array.isArray(ac?.Attributes) ? ac.Attributes : []).map((a) => a?.AttributeName)
      );

      const explicitMultiSignal =
        bookAttributes.length > 0 ||
        hasSignal(attributeCategoryNames, /front\s*and\s*back|front\s*only|inside|pages?|spread|album|book|cover/i) ||
        hasSignal(attributeNames, /front\s*and\s*back|front\s*only|inside|pages?|spread|album|book|cover/i);

      const explicitSingleSignal =
        hasSignal(attributeCategoryNames, /single\s*image/i) ||
        hasSignal(attributeNames, /single\s*image/i);

      productNodeCounts.push({
        productUID,
        productName,
        nodeCount: nodes.length,
        hasBookAttributes: bookAttributes.length > 0,
        explicitMultiSignal,
        explicitSingleSignal,
      });

      if (!nodes.length) {
        rows.push({
          category: categoryName,
          productUID,
          productName,
          nodeId: null,
          nodeDescription: null,
          x: null,
          y: null,
          w: null,
          h: null,
        });
        continue;
      }

      for (const node of nodes) {
        rows.push({
          category: categoryName,
          productUID,
          productName,
          nodeId: Number(node?.DP2NodeID ?? node?.ProductNodeID ?? 0) || null,
          nodeDescription: node?.Description ?? null,
          x: Number(node?.X ?? 0),
          y: Number(node?.Y ?? 0),
          w: Number(node?.W ?? 0),
          h: Number(node?.H ?? 0),
        });
      }
    }

    const productsWithNodes = productNodeCounts.filter((p) => p.nodeCount > 0);
    const singleImageProducts = productsWithNodes.filter((p) => p.nodeCount === 1);
    const multiImageProducts = productsWithNodes.filter((p) => p.nodeCount > 1);
    const missingNodeProducts = productNodeCounts.filter((p) => p.nodeCount === 0);
    const inferredMultiSignalProducts = productNodeCounts.filter((p) => p.nodeCount === 0 && p.explicitMultiSignal);
    const inferredSingleSignalProducts = productNodeCounts.filter((p) => p.nodeCount === 0 && p.explicitSingleSignal);
    const productsWithBookAttributes = productNodeCounts.filter((p) => p.hasBookAttributes);

    const multiImageHistogram = multiImageProducts.reduce((acc, p) => {
      const key = String(p.nodeCount);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    perCategoryImageMode.push({
      category: categoryName,
      totalProducts: productNodeCounts.length,
      productsWithNodeData: productsWithNodes.length,
      productsMissingNodeData: missingNodeProducts.length,
      productsWithBookAttributes: productsWithBookAttributes.length,
      singleImageProducts: singleImageProducts.length,
      multiImageProducts: multiImageProducts.length,
      inferredMultiSignalProducts: inferredMultiSignalProducts.length,
      inferredSingleSignalProducts: inferredSingleSignalProducts.length,
      classification:
        multiImageProducts.length > 0
          ? 'contains-multi-image-products'
          : inferredMultiSignalProducts.length > 0
          ? 'inferred-multi-image-from-catalog-signals'
          : inferredSingleSignalProducts.length > 0
          ? 'single-image-indicated-by-catalog'
          : singleImageProducts.length > 0
          ? 'single-image-only'
          : 'no-node-data',
      multiImageNodeCounts: multiImageHistogram,
      multiImageSample: multiImageProducts.slice(0, 5).map((p) => ({
        productUID: p.productUID,
        productName: p.productName,
        imageSlots: p.nodeCount,
      })),
      inferredMultiSample: inferredMultiSignalProducts.slice(0, 5).map((p) => ({
        productUID: p.productUID,
        productName: p.productName,
      })),
      inferredSingleSample: inferredSingleSignalProducts.slice(0, 5).map((p) => ({
        productUID: p.productUID,
        productName: p.productName,
      })),
    });
  }

  const nodeSummaryMap = new Map();
  for (const row of rows) {
    const key = String(row.nodeId ?? 'null');
    if (!nodeSummaryMap.has(key)) {
      nodeSummaryMap.set(key, { count: 0, samples: [] });
    }
    const entry = nodeSummaryMap.get(key);
    entry.count += 1;
    if (entry.samples.length < 5) {
      entry.samples.push({
        category: row.category,
        productUID: row.productUID,
        productName: row.productName,
        w: row.w,
        h: row.h,
        description: row.nodeDescription,
      });
    }
  }

  const summary = {
    totalCategories: categories.length,
    totalProducts: new Set(rows.map((r) => r.productUID)).size,
    totalNodeRows: rows.length,
    categoryImageModes: perCategoryImageMode,
    nodeIds: Array.from(nodeSummaryMap.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 30)
      .map(([nodeId, value]) => ({
        nodeId,
        count: value.count,
        samples: value.samples,
      })),
  };

  const outPath = 'scripts/whcc-node-meaning-report.json';
  fs.writeFileSync(outPath, JSON.stringify({ summary, rows }, null, 2));

  console.log('Category image mode summary:');
  console.log(JSON.stringify(perCategoryImageMode, null, 2));
  console.log('\nNode ID usage summary:');
  console.log(JSON.stringify({
    totalCategories: summary.totalCategories,
    totalProducts: summary.totalProducts,
    totalNodeRows: summary.totalNodeRows,
    topNodeIds: summary.nodeIds.slice(0, 10),
  }, null, 2));
  console.log(`\nSaved full report to ${outPath}`);
})().catch((e) => {
  console.error(e?.response?.status, e?.response?.data || e.message);
  process.exit(1);
});
