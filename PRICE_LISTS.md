# Price Lists Feature

## Overview
The Photo Lab now supports **multiple price lists** that can be assigned to different albums. This allows you to offer different pricing strategies for different albums or customer groups.

## Features

### 1. **Create Price Lists**
- Create custom price lists via Admin > Price Lists
- Each price list contains pricing for specific product sizes
- Assign price lists to albums to override default pricing

### 2. **CSV/Excel Import**
- Import pricing data from CSV or Excel files
- Supports flexible CSV formats with columns like: Product, Size, Width, Height, Price
- **Smart product grouping**: Similar product names are automatically grouped and mapped to existing products
- **Automatic size creation**: The system intelligently identifies sizes and creates them if needed

### 3. **Album-Specific Pricing**
- Assign a price list to any album from the album editor
- Albums without a price list use default product pricing
- Change pricing on the fly by assigning different price lists

## CSV Import Format

### Required Columns
- **Product**: Product name (e.g., "Standard Print", "Canvas Print")
- **Price**: Price per unit (e.g., "9.99")

### Optional Columns
- **Size**: Size name/identifier (e.g., "4x6", "8x10")
- **Width**: Width dimension (e.g., "4")
- **Height**: Height dimension (e.g., "6")
- **Description**: Product description

### Example CSV

```csv
Product,Size,Width,Height,Price
Standard Print,4x6,4,6,9.99
Standard Print,5x7,5,7,11.99
Standard Print,8x10,8,10,14.99
Canvas Print,12x16,12,16,29.99
Canvas Print,16x20,16,20,39.99
Digital Download,Original,0,0,4.99
Digital Download,4K,3840,2160,6.99
```

## Workflow

1. **Create Price List** → Click "Create Price List" button
2. **Import from CSV** → Click "📥 Import from CSV", upload your file
3. **Review Mapping** → System shows product groupings and mappings (e.g., "Standard Print" → Standard Print product)
4. **Confirm Import** → Name your price list and finalize the import
5. **Assign to Album** → Go to Albums, select an album, choose the price list
6. **Done** → Customers will see the new prices when viewing that album

## Smart Product Grouping

The import system uses intelligent similarity detection to:
- Match CSV product names to existing products (e.g., "standard prints" → "Standard Print")
- Group multiple items by the same product
- Preserve price and size information
- Handle typos and variations in product names

**Minimum match threshold**: 40% similarity required for automatic mapping
If no match is found, items are mapped to the first available product as a fallback.

## API Integration (Coming Soon)

- Real database persistence for price lists
- Bulk price updates via API
- Historical pricing tracking
- Dynamic pricing based on customer groups

## Example Use Cases

### 1. Wedding Season Pricing
Create a "Wedding Premium" price list with higher prices during peak season, assign to wedding album.

### 2. Bulk Discounts
Create a "Volume Discount" price list with reduced pricing, assign when offering bulk orders.

### 3. Seasonal Sales
Create seasonal price lists (Spring Sale, Summer Sale, etc.) and rotate them by album.

### 4. Client-Specific Pricing
Create per-client price lists for wholesale or special pricing arrangements.
