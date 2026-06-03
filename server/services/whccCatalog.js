// server/services/whccCatalog.js
// Service for fetching and matching WHCC catalog products via API

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fetchToken } from '../routes/whccProxy.js';

function getWhccCreds() {
  const consumerKey = process.env.WHCC_CONSUMER_KEY || process.env.WHCC_API_KEY || '';
  const consumerSecret = process.env.WHCC_CONSUMER_SECRET || process.env.WHCC_API_SECRET || '';
  const isSandbox = process.env.WHCC_SANDBOX === 'true';
  return { consumerKey, consumerSecret, isSandbox };
}

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
  const { consumerKey, consumerSecret, isSandbox } = getWhccCreds();
  if (!consumerKey || !consumerSecret) {
    throw new Error('Set WHCC_CONSUMER_KEY and WHCC_CONSUMER_SECRET in your environment.');
  }
  const baseUrl = isSandbox ? 'https://sandbox.apps.whcc.com' : 'https://apps.whcc.com';
  const token = await fetchToken(consumerKey, consumerSecret, isSandbox);
  const res = await fetch(`${baseUrl}/api/catalog`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
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
