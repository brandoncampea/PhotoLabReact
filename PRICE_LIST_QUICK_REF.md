# Price Lists - Quick Reference Guide

## 📍 Location in Admin Panel
**Admin > 💰 Price Lists** (Sidebar Navigation)

## 🎯 What It Does
- Allows you to create different pricing tiers
- Assign custom pricing to individual albums
- Import bulk pricing from CSV/Excel files
- Automatically group similar products
- Override default product pricing

## ⚡ Quick Actions

### Create a New Price List
1. Click **"+ Create Price List"**
2. Enter name (e.g., "Summer Sale")
3. Optional: Add description
4. Click **Create**

### Import Prices from CSV
1. Click **"📥 Import from CSV"**
2. Upload your CSV file
3. Review product groupings
4. Enter price list name
5. Click **"Import Price List"**

### Assign Price List to Album
1. Go to **Admin > 📁 Albums**
2. Edit any album
3. Find **"Price List"** dropdown
4. Select your custom price list
5. Save album
6. ✅ Done! Album now uses custom pricing

### Delete a Price List
1. Click on price list card
2. Click **Delete** button
3. Confirm deletion

### View Price Details
1. Click on a price list card
2. Table shows all pricing items
3. Shows: Product name, Size, Price
4. Click **Remove** to delete individual items

## 📋 CSV File Format

**Minimum (just these 2 columns):**
```csv
Product,Price
Standard Print,9.99
Canvas Print,29.99
```

**Recommended (with sizes):**
```csv
Product,Size,Width,Height,Price
Standard Print,4x6,4,6,9.99
Standard Print,8x10,8,10,14.99
Canvas Print,16x20,16,20,39.99
```

**Download template:**
`/price-list-template.csv` from public folder

## 🔄 Common Workflows

### Scenario 1: Sale Pricing
```
1. Create price list "June Sale"
2. Import CSV with 20% lower prices
3. Assign to appropriate albums
4. Customer sees sale prices
```

### Scenario 2: Premium Products
```
1. Create price list "Premium 2026"
2. Manually create with higher prices
3. Assign to wedding/high-end albums
4. Premium customers see premium pricing
```

### Scenario 3: Bulk Discount
```
1. Create price list "Bulk Order"
2. Import CSV with volume pricing
3. Assign when offering bulk deals
4. Auto-calculate savings for customers
```

## 📊 What You'll See

### Price Lists Grid
- Shows all available price lists
- Displays item count per list
- Quick delete button
- Click to expand details

### Details Panel
- Full table of all pricing items
- Product + Size + Price columns
- Remove button for each item
- Useful for verification

## ⚙️ Configuration

**Auto-Grouping Rules:**
- Names need ~40% similarity to existing products
- "Standard prints" matches "Standard Print"
- "Canvas" matches "Canvas Print"
- No match? Falls back to first available product

**Column Detection:**
- Product, Size, Price = required
- Width, Height, Description = optional
- Column order doesn't matter
- Case-insensitive names

## ✅ Checklist Before Import

- [ ] CSV file is properly formatted
- [ ] Product column has recognizable names
- [ ] Price column has valid numbers
- [ ] No empty rows between data
- [ ] Size/Width/Height optional but helpful
- [ ] Test with small CSV first

## ❓ FAQ

**Q: Can I use the same price list for multiple albums?**
A: Yes! Create one price list, assign it to as many albums as you want.

**Q: What if products don't match my CSV names?**
A: System shows mappings during import preview. You can review before confirming.

**Q: Can I edit prices after import?**
A: Yes, remove items from the price list and re-import, or edit in products section.

**Q: Do discount codes still work with price lists?**
A: Yes! Discounts apply on top of price list prices.

**Q: Which pricing wins - product or price list?**
A: Price list takes priority when assigned to an album.

**Q: Can I delete a price list if albums use it?**
A: Not recommended. First unassign from albums, then delete.

## 🆘 Troubleshooting

**Import fails - "No valid pricing data found"**
→ Make sure CSV has a "Price" column

**Products not grouped correctly**
→ Use clearer product names in CSV

**Wrong product mapped**
→ Edit CSV product names to match existing products better

**Can't find price list option when editing album**
→ Make sure you clicked "Manage price lists" link

## 📖 Documentation Links

- **Full Guide:** [PRICE_LISTS.md](PRICE_LISTS.md)
- **Examples:** [PRICE_LIST_EXAMPLES.md](PRICE_LIST_EXAMPLES.md)
- **Implementation:** [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)
- **Template CSV:** [price-list-template.csv](public/price-list-template.csv)

## 🚀 Next Steps

1. **Test it out:** Create a test price list
2. **Try import:** Download template CSV and import it
3. **Assign to album:** Pick an album and assign the price list
4. **Verify:** Check that prices show up correctly
5. **Use it:** Start creating real pricing strategies!

## 💡 Pro Tips

- ✅ Name price lists descriptively (include date or season)
- ✅ Keep backup CSVs of your pricing
- ✅ Test new pricing on a dummy album first
- ✅ Use consistent product naming across CSVs
- ✅ Document which albums use which price lists
- ✅ Review price list assignments regularly

---

**Last Updated:** January 24, 2026
**Version:** 1.0
**Status:** ✅ Production Ready
