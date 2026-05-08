// scripts/fetchWhccCatalog.js
// Fetches the WHCC product catalog and prints the UID for the 3" Button
// Usage: node scripts/fetchWhccCatalog.js <API_KEY>

import fetch from 'node-fetch';

const API_URL = 'https://sandbox.whcc.com/api/v1/request-catalog'; // Use production URL for live
const API_KEY = process.argv[2];

if (!API_KEY) {
  console.error('Usage: node scripts/fetchWhccCatalog.js <API_KEY>');
  process.exit(1);
}

async function fetchCatalog() {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({})
  });
  if (!res.ok) {
    console.error('Failed to fetch WHCC catalog:', res.status, await res.text());
    process.exit(1);
  }
  return res.json();
}

function findButtonProduct(catalog) {
  // Recursively search for a product with "Button" in the name
  const results = [];
  function search(obj) {
    if (obj && typeof obj === 'object') {
      if (obj.ProductName && /button/i.test(obj.ProductName)) {
        results.push(obj);
      }
      for (const key in obj) {
        search(obj[key]);
      }
    }
  }
  search(catalog);
  return results;
}

(async () => {
  const catalog = await fetchCatalog();
  const buttons = findButtonProduct(catalog);
  if (!buttons.length) {
    console.log('No Button products found in WHCC catalog.');
    process.exit(0);
  }
  for (const btn of buttons) {
    console.log(`Found: ${btn.ProductName} | ProductCode: ${btn.ProductCode}`);
  }
})();
