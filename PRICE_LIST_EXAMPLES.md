# Price List Examples & Use Cases

## Quick Start Examples

### Example 1: Wedding Portfolio Pricing

**Scenario:** You want premium pricing for wedding photos

**CSV File:**
```csv
Product,Size,Width,Height,Price
Premium Print,5x7,5,7,24.99
Premium Print,8x10,8,10,34.99
Premium Print,11x14,11,14,49.99
Canvas Print,16x20,16,20,79.99
Canvas Print,20x24,20,24,99.99
Digital Download,4K,3840,2160,14.99
```

**Steps:**
1. Admin > Price Lists > "📥 Import from CSV"
2. Upload CSV
3. Review products (Premium Print → needs creation or mapping to Standard Print)
4. Name list "Wedding Premium 2026"
5. Confirm import
6. Go to Admin > Albums
7. Edit "Wedding Photos" album
8. Select "Wedding Premium 2026" from Price List dropdown
9. Save

**Result:** Wedding album customers see premium pricing!

---

### Example 2: Seasonal Bulk Discount

**Scenario:** Offer volume discounts for bulk orders in spring

**CSV File:**
```csv
Product,Size,Width,Height,Price
Standard Print,4x6,4,6,6.99
Standard Print,5x7,5,7,8.99
Standard Print,8x10,8,10,11.99
Canvas Print,12x16,12,16,19.99
Canvas Print,16x20,16,20,24.99
```

**Steps:**
1. Create price list "Spring Bulk Sale"
2. Import CSV with lower prices
3. Assign to "Family Portraits" album
4. Customers ordering during spring see discounts

---

### Example 3: Client-Specific Pricing

**Scenario:** Special pricing agreement with corporate client

**Manual Creation:**
1. Admin > Price Lists > "+ Create Price List"
2. Name: "Acme Corp 2026"
3. Description: "Custom pricing for Acme Corporation"
4. Save
5. Manually add items or import from CSV
6. Go to Albums
7. Create new album "Acme Corporate Event"
8. Assign "Acme Corp 2026" price list

---

### Example 4: Test Sale

**Scenario:** Quick A/B test with lower pricing

**CSV File (Minimal Format):**
```csv
Product,Price
Standard Print,7.99
Canvas Print,24.99
Digital Download,2.99
```

**System Behavior:**
- Parses Product and Price (Size is optional)
- Creates pricing for all sizes of each product
- User reviews and confirms
- Creates "Test Sale" price list

---

## CSV Format Reference

### Supported Column Names (Case-Insensitive)
| Purpose | Recognized Names |
|---------|------------------|
| Product | Product, Product Name, Item, Type |
| Size | Size, Size Name, Dimension |
| Width | Width, W, Dimension Width |
| Height | Height, H, Dimension Height |
| Price | Price, Cost, Amount, Unit Price |
| Description | Description, Desc, Notes |

### Valid CSV Examples

**Minimal (only required columns):**
```csv
Product,Price
Standard Print,9.99
Canvas Print,29.99
```

**With sizes:**
```csv
Product,Size,Price
Standard Print,4x6,9.99
Standard Print,5x7,11.99
```

**Full format:**
```csv
Product Name,Size,Width,Height,Price,Description
Standard Print,4x6,4,6,9.99,High quality photo
Canvas Print,12x16,12,16,29.99,Museum canvas
```

**Different column order (still works):**
```csv
Price,Product,Size,Height,Width
9.99,Standard Print,4x6,6,4
11.99,Standard Print,5x7,7,5
```

---

## Smart Grouping Examples

### Product Name Matching

The system automatically groups similar products:

| CSV Name | Matched To | Confidence |
|----------|-----------|------------|
| "Standard Print" | Standard Print | 100% |
| "standard prints" | Standard Print | 90% |
| "Print - Standard" | Standard Print | 80% |
| "Std Prints" | (no match, fallback) | 20% |
| "Canvas" | Canvas Print | 90% |
| "Museum Canvas" | Canvas Print | 80% |

**Matching Algorithm:**
- Exact match = 100%
- Substring match = 90%
- Word-level match = % of matching words
- Minimum threshold = 40%

---

## Common Import Scenarios

### Scenario 1: Excel Export from Spreadsheet

1. Create pricing in Excel
2. Save as CSV (.csv format)
3. Upload to Photo Lab
4. System auto-detects columns
5. Groups and maps products
6. Done!

### Scenario 2: Vendor Price Sheet

1. Vendor sends Excel with their pricing
2. Convert to CSV if needed
3. Import into Photo Lab
4. Review mappings
5. Assign to appropriate albums

### Scenario 3: Dynamic Pricing Update

1. Monthly pricing review
2. Export current price list
3. Update prices in Excel
4. Save as CSV
5. Import new version
6. Replace old price list
7. Verify assignments

### Scenario 4: Multi-Vendor Comparison

1. Create price list from Vendor A
2. Create price list from Vendor B
3. Create price list from Vendor C
4. Compare pricing and choose best
5. Assign winning price list to album

---

## Product Grouping Examples

### Example: Multiple Size CSV

**Input CSV:**
```csv
Product,Size,Width,Height,Price
12x16 Canvas,12x16,12,16,29.99
16x20 Canvas,16x20,16,20,39.99
20x24 Canvas,20x24,20,24,49.99
```

**System Groups As:**
- Product: "Canvas Print" (matched via similarity)
- Items: 3 different sizes with prices
- Creates 1 price list with 3 items (one for each size)

---

### Example: Multi-Product Import

**Input CSV:**
```csv
Product,Size,Price
Small Prints,4x6,9.99
Small Prints,5x7,11.99
Big Canvas,16x20,39.99
Big Canvas,20x24,49.99
Digital Files,Original,4.99
Digital Files,4K,6.99
```

**System Groups As:**
- **Group 1:** "Small Prints" → "Standard Print" (3 items)
  - 4x6 @ $9.99
  - 5x7 @ $11.99
  
- **Group 2:** "Big Canvas" → "Canvas Print" (2 items)
  - 16x20 @ $39.99
  - 20x24 @ $49.99
  
- **Group 3:** "Digital Files" → "Digital Download" (2 items)
  - Original @ $4.99
  - 4K @ $6.99

**Final Price List:** 1 list with 7 items across 3 products

---

## Troubleshooting Import Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "No valid pricing data found" | Missing Price column | Ensure CSV has a "Price" column |
| Products not grouped correctly | Poor naming match | Edit CSV product names to be clearer |
| Wrong product mapping | Low similarity score | Rename CSV products to match existing ones |
| Missing sizes in import preview | Sizes not in CSV | Add Size, Width, Height columns |

---

## Tips & Best Practices

✅ **DO:**
- Use clear product names matching your product list
- Include all required columns (Product, Price)
- Test imports with small CSVs first
- Review mappings before confirming
- Give price lists descriptive names
- Document which albums use which price lists

❌ **DON'T:**
- Leave price column empty
- Use special characters in product names
- Import the same CSV multiple times
- Assign multiple price lists to one album (use most recent)
- Delete price lists still assigned to albums (remove assignments first)

---

## Integration with Other Features

### Works With:
- ✅ Albums - Each album can have its own price list
- ✅ Products - Maps to existing product definitions
- ✅ Sizes - Automatically maps sizes to products
- ✅ Orders - Customers pay according to album's price list
- ✅ Discount Codes - Can stack on top of price list prices

### Future Integration:
- 📅 Scheduled Price Changes - Auto-apply price list on date
- 👥 Customer Groups - Different price lists per customer type
- 📊 A/B Testing - Compare performance of different price lists
- 📈 Analytics - Track which price list has best conversion
- 🔄 Historical Tracking - See price changes over time
