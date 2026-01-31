# WHCC Product Import to Price Lists

## Overview
Added a new feature to import products from WHCC (White House Custom Gifts) product catalog directly into price lists. This allows admins to quickly populate price lists with WHCC products without manual data entry.

## Features

### 1. WHCC Product Catalog Service (`whccService.ts`)
- **`getProductCatalog()`** - Fetches WHCC products from their API (with fallback)
- **`getDefaultProductCatalog()`** - Returns default WHCC products (5x7, 4x6, 8x10 prints)
- Includes product UIDs, pricing, and attributes (paper types, finishes, shipping)

### 2. Admin Component (`AdminWhccImport.tsx`)
Multi-step wizard interface for importing products:
- **Step 1: Select Price List** - Choose which price list to add products to
- **Step 2: Select Products** - Browse WHCC catalog and select products
  - View product name, UID, base price, and dimensions
  - Option to override price for individual products
- **Step 3: Review & Confirm** - Preview selected products before import

### 3. AdminMockApi Updates
Added two new methods to `priceLists`:
- **`getPriceLists()`** - Alias for `getAll()` to fetch all price lists
- **`addItemsToPriceList(priceListId, items)`** - Batch add multiple products to a price list
  - Each item becomes a product with one size entry
  - Preserves WHCC UID for reference
  - Automatically calculates product/size IDs
  - Persists to localStorage

### 4. UI Integration
- Added **"📦 Import from WHCC"** button to AdminPriceLists page (next to CSV import)
- Opens modal that handles the 3-step import workflow
- Auto-refreshes price list after successful import

## How to Use

1. Navigate to **Admin > Price Lists**
2. Click **"📦 Import from WHCC"** button
3. Select a price list to add products to
4. Click "Next: Select Products"
5. Products from WHCC catalog will load (default products if API unavailable)
6. Check products you want to add, optionally override prices
7. Click "Review & Import"
8. Confirm the import
9. Products are added to the selected price list and persisted to localStorage

## Data Flow

```
whccService.getProductCatalog()
    ↓ (tries API, falls back to defaults)
    ↓
[WHCC Products Array]
    ↓ (displayed in modal)
    ↓
Admin selects products & prices
    ↓
adminMockApi.priceLists.addItemsToPriceList()
    ↓
Products added to price list, saved to localStorage
    ↓
Price list refreshed in UI
```

## Product Structure

Each WHCC product has:
```typescript
{
  productUID: number;        // WHCC product identifier
  name: string;              // e.g., "5x7 Print"
  description?: string;      // Product description
  basePrice: number;         // WHCC base price (in dollars)
  width?: number;            // Physical width
  height?: number;           // Physical height
  category?: string;         // Product category
}
```

When imported, each product becomes:
```typescript
{
  id: number;                // Internal product ID
  priceListId: number;       // Parent price list ID
  name: string;              // Product name
  description: string;       // Product description
  isDigital: false;          // Physical product
  whccProductUID: number;    // Reference to WHCC UID
  category: string;          // Product category
  sizes: [                   // Single size entry
    {
      id: number;
      productId: number;
      name: string;          // e.g., "5x7"
      width: number;
      height: number;
      price: number;         // Can be custom price
      cost: number;
    }
  ]
}
```

## Technical Details

### Files Modified
- `src/components/AdminWhccImport.tsx` - New component (383 lines)
- `src/pages/admin/AdminPriceLists.tsx` - Added import modal + button
- `src/services/adminMockApi.ts` - Added batch import methods
- `src/services/whccService.ts` - Already had catalog methods

### Key Functions

#### `AdminWhccImport.tsx`
- `handleLoadPriceLists()` - Fetch all price lists
- `handleLoadWhccProducts()` - Fetch WHCC product catalog
- `toggleProductSelection()` - Select/deselect products
- `updateMapping()` - Modify product price overrides
- `handleImport()` - Process the import

#### `whccService.ts`
- `getProductCatalog()` - Try API, fallback to defaults
- `getDefaultProductCatalog()` - Return default WHCC products

#### `adminMockApi.ts`
- `addItemsToPriceList()` - Batch add products with automatic ID generation

## Default Products

The default catalog includes three common WHCC print products:
- **5x7 Print** (UID: 2, $0.65)
- **4x6 Print** (UID: 3, $0.49)
- **8x10 Print** (UID: 4, $1.45)

All with standard paper and finish options.

## Future Enhancements

1. **Live WHCC API Integration** - Connect to actual WHCC product catalog endpoint
2. **Bulk Price Updates** - Apply discount percentage to all imported products
3. **Attribute Selection** - Choose paper types, finishes for each product
4. **Product Mapping** - Map WHCC products to existing price list products
5. **Import History** - Track which products came from WHCC imports
6. **CSV Export** - Export imported products as CSV for backup/editing
