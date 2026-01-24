import { PriceList, ImportedPriceData, PriceGroupMapping, Product } from '../types';
import { adminMockApi } from './adminMockApi';

export interface ColumnMapping {
  productIdx: number;
  sizeIdx: number;
  priceIdx: number;
  widthIdx: number;
  heightIdx: number;
  costIdx: number;
  descriptionIdx: number;
}

export interface ColumnSuggestion extends ColumnMapping {
  headers: string[];
}

/**
 * Detects CSV columns and suggests mappings
 * Returns suggested column indices based on header analysis
 */
export const detectColumnsFromCSV = (csvText: string): ColumnSuggestion => {
  const lines = csvText.trim().split('\n');
  if (lines.length === 0) throw new Error('CSV file is empty');

  const headers = lines[0].split(',').map(h => h.trim());
  const lowerHeaders = headers.map(h => h.toLowerCase());

  // Find column indices with scoring
  const findBestMatch = (keywords: string[]): number => {
    let bestIdx = -1;
    let bestScore = 0;

    lowerHeaders.forEach((header, idx) => {
      const score = keywords.reduce((acc, keyword) => {
        if (header.includes(keyword)) return acc + 1;
        return acc;
      }, 0);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });

    return bestIdx;
  };

  return {
    headers,
    productIdx: findBestMatch(['product', 'name']) ?? 0,
    sizeIdx: findBestMatch(['size']) ?? -1,
    priceIdx: findBestMatch(['price']) ?? 1,
    widthIdx: findBestMatch(['width', 'w']) ?? -1,
    heightIdx: findBestMatch(['height', 'h']) ?? -1,
    costIdx: findBestMatch(['cost']) ?? -1,
    descriptionIdx: findBestMatch(['description', 'desc']) ?? -1,
  };
};

/**
 * Parses CSV or Excel data into price list items
 * Expected format: Product Name, Size Name, Width, Height, Price, Cost (optional)
 * Removes duplicates keeping the first occurrence
 */
export const parseCSVData = (csvText: string, mapping: ColumnMapping): ImportedPriceData[] => {
  const lines = csvText.trim().split('\n');
  if (lines.length === 0) throw new Error('CSV file is empty');

  const {
    productIdx,
    sizeIdx,
    widthIdx,
    heightIdx,
    priceIdx,
    costIdx,
    descriptionIdx,
  } = mapping;

  if (productIdx === -1 || priceIdx === -1) {
    throw new Error('Product and Price columns are required');
  }

  const data: ImportedPriceData[] = [];
  const seen = new Set<string>(); // Track (product, size) combinations

  // Parse data rows (skip header)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cells = line.split(',').map(c => c.trim());
    
    const productName = cells[productIdx] || 'Unknown';
    const sizeName = sizeIdx >= 0 ? cells[sizeIdx] : 'Default';
    const duplicateKey = `${productName.toLowerCase()}|${sizeName.toLowerCase()}`;

    // Skip if we've already seen this product/size combination
    if (seen.has(duplicateKey)) {
      console.warn(`Row ${i + 1}: Duplicate "${productName}" / "${sizeName}", skipping`);
      continue;
    }
    seen.add(duplicateKey);
    
    const item: ImportedPriceData = {
      productName,
      sizeName,
      width: widthIdx >= 0 ? parseFloat(cells[widthIdx]) : undefined,
      height: heightIdx >= 0 ? parseFloat(cells[heightIdx]) : undefined,
      price: parseFloat(cells[priceIdx]) || 0,
      cost: costIdx >= 0 ? parseFloat(cells[costIdx]) : undefined,
      description: descriptionIdx >= 0 ? cells[descriptionIdx] : undefined,
    };

    if (isNaN(item.price)) {
      console.warn(`Row ${i + 1}: Invalid price "${cells[priceIdx]}", skipping`);
      continue;
    }

    data.push(item);
  }

  if (data.length === 0) throw new Error('No valid pricing data found in CSV');

  return data;
};

/**
 * Calculates similarity between two product names (0-1 scale)
 * Uses simple substring matching and word similarity
 */
const calculateSimilarity = (name1: string, name2: string): number => {
  const n1 = name1.toLowerCase();
  const n2 = name2.toLowerCase();

  // Exact match
  if (n1 === n2) return 1.0;

  // Substring match
  if (n1.includes(n2) || n2.includes(n1)) return 0.9;

  // Split by common delimiters and count matching words
  const words1 = n1.split(/[\s\-_,]+/).filter(w => w.length > 2);
  const words2 = n2.split(/[\s\-_,]+/).filter(w => w.length > 2);

  if (words1.length === 0 || words2.length === 0) return 0;

  const matches = words1.filter(w1 => words2.some(w2 => w2.includes(w1) || w1.includes(w2))).length;
  return matches / Math.max(words1.length, words2.length);
};

/**
 * Groups imported price data by similar products and finds matching products
 */
export const groupAndMapPriceData = (
  importedData: ImportedPriceData[],
  availableProducts: Product[]
): PriceGroupMapping[] => {
  const groups: Map<string, ImportedPriceData[]> = new Map();

  // Group by product name
  importedData.forEach(item => {
    const key = item.productName.toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(item);
  });

  // Map to existing products
  const mappings: PriceGroupMapping[] = [];

  groups.forEach((items, productName) => {
    // Find best matching product
    let bestProduct = availableProducts[0];
    let bestScore = -1;

    availableProducts.forEach(product => {
      const score = calculateSimilarity(productName, product.name);
      if (score > bestScore) {
        bestScore = score;
        bestProduct = product;
      }
    });

    // Only map if score is reasonable (>0.4)
    const targetProduct = bestScore > 0.4 ? bestProduct : availableProducts[0];

    const mapping: PriceGroupMapping = {
      productName,
      productId: targetProduct.id,
      items: items.map(item => ({
        sizeName: item.sizeName,
        width: item.width,
        height: item.height,
        price: item.price,
      })),
    };

    mappings.push(mapping);
  });

  return mappings;
};

/**
 * Finds or creates product sizes for imported data
 */
export const mapSizesForImport = (
  mappings: PriceGroupMapping[],
  products: Product[]
): Array<{
  productId: number;
  productSizeId: number;
  price: number;
  createNewSize?: { name: string; width?: number; height?: number };
}> => {
  const sizeMap: Array<{
    productId: number;
    productSizeId: number;
    price: number;
    createNewSize?: { name: string; width?: number; height?: number };
  }> = [];

  mappings.forEach(mapping => {
    const product = products.find(p => p.id === mapping.productId);
    if (!product) return;

    mapping.items.forEach(item => {
      // Try to find existing size by name
      let size = product.sizes.find(
        s => s.name.toLowerCase() === item.sizeName.toLowerCase()
      );

      if (size) {
        sizeMap.push({
          productId: mapping.productId,
          productSizeId: size.id,
          price: item.price,
        });
      } else {
        // Mark for new size creation
        sizeMap.push({
          productId: mapping.productId,
          productSizeId: 0, // Placeholder
          price: item.price,
          createNewSize: {
            name: item.sizeName,
            width: item.width,
            height: item.height,
          },
        });
      }
    });
  });

  return sizeMap;
};

/**
 * Creates a new price list from imported data
 */
export const createPriceListFromImport = async (
  name: string,
  description: string,
  mappings: Array<{ productName: string; items: Array<{ sizeName: string; width?: number; height?: number; price: number; cost?: number }> }>
): Promise<PriceList> => {
  // Create price list with nested products
  const priceListProducts = mappings.map(mapping => ({
    id: Math.floor(Math.random() * 100000),
    priceListId: 0, // Will be set by API
    name: mapping.productName,
    description: '',
    isDigital: false,
    sizes: mapping.items.map(item => ({
      id: Math.floor(Math.random() * 100000),
      productId: 0, // Will be set by API
      name: item.sizeName,
      width: item.width || 0,
      height: item.height || 0,
      price: item.price,
      cost: item.cost || 0,
    })),
  }));

  // Create price list with nested products
  const priceList = await adminMockApi.priceLists.create({
    name,
    description,
    products: priceListProducts,
  });

  return priceList;
};

/**
 * Gets prices for a product from a specific price list
 */
export const getPricesFromPriceList = (productId: number, priceList: PriceList | undefined): { [sizeId: number]: number } => {
  const prices: { [sizeId: number]: number } = {};

  if (priceList) {
    const product = priceList.products.find(p => p.id === productId);
    if (product) {
      product.sizes.forEach(size => {
        prices[size.id] = size.price;
      });
    }
  }

  return prices;
};
