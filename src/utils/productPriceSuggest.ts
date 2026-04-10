import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Fetches price suggestions for a given product name and size from the web.
 * Returns an array of { source, price, url } objects.
 */
export async function fetchProductPriceSuggestions(productName: string, sizeLabel: string): Promise<Array<{source: string, price: string, url: string}>> {
  const queries = [
    `${productName} ${sizeLabel} print price`,
    `${productName} ${sizeLabel} photo price`,
    `${sizeLabel} print price`,
    `${sizeLabel} photo price`,
  ];
  const results: Array<{source: string, price: string, url: string}> = [];

  for (const query of queries) {
    // Use DuckDuckGo for scraping-friendly search
    const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    try {
      const { data } = await axios.get(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const $ = cheerio.load(data);
      // DuckDuckGo: .result__a for links, .result__snippet for snippets
      $('.result').slice(0, 3).each((_, el) => {
        const link = $(el).find('.result__a').attr('href');
        const snippet = $(el).find('.result__snippet').text();
        const priceMatch = snippet.match(/\$\d{1,4}(?:\.\d{2})?/);
        if (link && priceMatch) {
          results.push({
            source: $(el).find('.result__a').text(),
            price: priceMatch[0],
            url: link.startsWith('http') ? link : `https://duckduckgo.com${link}`,
          });
        }
      });
      if (results.length > 0) break; // Stop after first non-empty result
    } catch (e) {
      // Ignore errors, try next query
    }
  }
  return results;
}
