// server/services/whccCatalog.js
// Service for fetching and matching WHCC catalog products via API

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const WHCC_API_URL = 'https://sandbox.whcc.com/api/v1/request-catalog';
const WHCC_API_KEY = process.env.WHCC_API_KEY || '';

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractSize(s) {
  const m = String(s || '').match(/(\d+(?:x\d+)+)/);
  return m ? m[1] : '';
}

function flattenCatalog(catalog) {
  const map = new Map();
  function walk(obj) {
    if (obj && typeof obj === 'object') {
      if (obj.ProductName && obj.ProductCode) {
        const name = String(obj.ProductName);
        const sizeMatch = name.match(/(\d+(?:x\d+)+)/);
        const size = sizeMatch ? sizeMatch[1] : '';
        const key = `${normalize(name.replace(size, '').trim())}|${normalize(size)}`;
        map.set(key, obj);
      }
      for (const key in obj) walk(obj[key]);
    }
  }
  walk(catalog);
  return map;
}

async function fetchWhccCatalog() {
  if (!WHCC_API_KEY) throw new Error('Set WHCC_API_KEY in your environment.');
  const res = await fetch(WHCC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${WHCC_API_KEY}`,
    },
    body: JSON.stringify({})
  });
  if (!res.ok) throw new Error(`Failed to fetch WHCC catalog: ${res.status} ${await res.text()}`);
  return res.json();
}

async function getWhccProductMatch({ productName, sizeName }, catalogMap) {
  const key = `${normalize(productName.replace(sizeName, '').trim())}|${normalize(sizeName)}`;
  return catalogMap.get(key) || null;
}

export async function getWhccCatalogMap() {
  const catalog = await fetchWhccCatalog();
  return flattenCatalog(catalog);
}

export async function matchWhccProduct({ productName, sizeName }) {
  const catalogMap = await getWhccCatalogMap();
  return getWhccProductMatch({ productName, sizeName }, catalogMap);
}
