# Code Change Reference - Variant Pricing Fix

## File: server/routes/orders.js

### Location: POST / route handler, order item processing loop
Lines: ~3720-3780

### Change: Add variant pricing resolution before calculateItemAccountingSnapshot

### Before (Original Code)
```javascript
// OLD CODE - ignores variant pricing
const productOptions = await hydrateProductOptionsWithWhccVariants(item.productSizeId, mergedProductOptions);
const isDigital = isDigitalProductRow({
  productOptions,
  productCategory: productRow?.productCategory,
  productName: productRow?.productName,
});

const accounting = calculateItemAccountingSnapshot({
  unitPrice: item.price,
  quantity: item.quantity,
  baseUnitPrice: productRow?.sizeBasePrice ?? productRow?.productBasePrice ?? 0,
  productionUnitCost: productRow?.sizeCost ?? productRow?.productCost ?? 0,
  isDigital,
  productOptions,
});
```

### After (New Code with Variant Pricing)
```javascript
// NEW CODE - resolves variant pricing
const productOptions = await hydrateProductOptionsWithWhccVariants(item.productSizeId, mergedProductOptions);
const isDigital = isDigitalProductRow({
  productOptions,
  productCategory: productRow?.productCategory,
  productName: productRow?.productName,
});

// PATCH: If a variant is selected, resolve its base_cost and price
// instead of using the default product/size pricing.
let resolvedBaseUnitPrice = productRow?.sizeBasePrice ?? productRow?.productBasePrice ?? 0;
let resolvedProductionUnitCost = productRow?.sizeCost ?? productRow?.productCost ?? 0;

if (productOptions && item.productSizeId) {
  const selectedVariantId = Number(
    productOptions?.whccSelectedVariantId ??
    productOptions?.selectedWhccVariantId ??
    productOptions?.selectedVariantId ?? 0
  );
  const selectedVariantLocalId = String(
    productOptions?.whccSelectedVariantLocalId ??
    productOptions?.selectedWhccVariantLocalId ??
    ''
  ).trim();

  if (selectedVariantId > 0 || selectedVariantLocalId) {
    // Try to find the selected variant in the database
    const variantRow = selectedVariantId > 0
      ? await queryRow(
          `SELECT v.base_cost, v.price
           FROM super_price_list_item_whcc_variants v
           INNER JOIN super_price_list_items spi ON spi.id = v.super_price_list_item_id
           WHERE v.id = $1 AND spi.product_size_id = $2`,
          [selectedVariantId, item.productSizeId]
        )
      : null;

    if (variantRow) {
      const variantBaseCost = parseNullableNumber(variantRow?.base_cost);
      const variantPrice = parseNullableNumber(variantRow?.price);
      if (variantBaseCost !== null) {
        resolvedBaseUnitPrice = variantBaseCost;
      }
      if (variantPrice !== null) {
        // Optionally override retail price with variant price if needed
        // For now, keep the item.price from cart, but use variant cost
      }
      console.log('[ORDER ITEM VARIANT PRICING]', {
        productSizeId: item.productSizeId,
        selectedVariantId,
        variantBaseCost,
        variantPrice,
        resolvedBaseUnitPrice,
      });
    }
  }
}

const accounting = calculateItemAccountingSnapshot({
  unitPrice: item.price,
  quantity: item.quantity,
  baseUnitPrice: resolvedBaseUnitPrice,
  productionUnitCost: resolvedProductionUnitCost,
  isDigital,
  productOptions,
});
```

## Key Differences Highlighted

### 1. Variable Declaration
```diff
- // Directly use product row values
+ // Initialize with default, may override with variant
+ let resolvedBaseUnitPrice = productRow?.sizeBasePrice ?? productRow?.productBasePrice ?? 0;
+ let resolvedProductionUnitCost = productRow?.sizeCost ?? productRow?.productCost ?? 0;
```

### 2. Variant Detection
```diff
+ if (productOptions && item.productSizeId) {
+   const selectedVariantId = Number(
+     productOptions?.whccSelectedVariantId ??
+     productOptions?.selectedWhccVariantId ??
+     productOptions?.selectedVariantId ?? 0
+   );
```

### 3. Database Query
```diff
+   if (selectedVariantId > 0) {
+     const variantRow = await queryRow(
+       `SELECT v.base_cost, v.price
+        FROM super_price_list_item_whcc_variants v
+        INNER JOIN super_price_list_items spi ON spi.id = v.super_price_list_item_id
+        WHERE v.id = $1 AND spi.product_size_id = $2`,
+       [selectedVariantId, item.productSizeId]
+     );
+   }
```

### 4. Variant Cost Resolution
```diff
+   if (variantRow) {
+     const variantBaseCost = parseNullableNumber(variantRow?.base_cost);
+     if (variantBaseCost !== null) {
+       resolvedBaseUnitPrice = variantBaseCost;
+     }
+   }
```

### 5. Pass Resolved Values to Calculation
```diff
  const accounting = calculateItemAccountingSnapshot({
    unitPrice: item.price,
    quantity: item.quantity,
-   baseUnitPrice: productRow?.sizeBasePrice ?? productRow?.productBasePrice ?? 0,
+   baseUnitPrice: resolvedBaseUnitPrice,
-   productionUnitCost: productRow?.sizeCost ?? productRow?.productCost ?? 0,
+   productionUnitCost: resolvedProductionUnitCost,
    isDigital,
    productOptions,
  });
```

## Logic Flow

```
Order Creation (POST /orders)
    ↓
Process each item
    ↓
Load product & size data
    ↓
Check if variant is selected (productOptions.whccSelectedVariantId)
    ├─ NO VARIANT → Use default product/size pricing
    │
    └─ VARIANT SELECTED
        ↓
        Query super_price_list_item_whcc_variants table
        ↓
        Variant found? 
        ├─ NO → Fall back to default pricing
        │
        └─ YES → Use variant base_cost
            ↓
            Log variant pricing applied
            ↓
            Use resolved base_cost in accounting calculation
```

## Error Handling

The implementation is defensive:

1. **Null checks**: `?.` optional chaining prevents errors
2. **Type safety**: `Number()` and `String()` ensure correct types
3. **Fallback logic**: If variant query fails, uses default pricing
4. **No throwing**: Invalid data doesn't crash order creation

## Testing the Change

### Verify in Server Logs
```
Look for when creating an order with variant product:
[ORDER ITEM VARIANT PRICING] {
  productSizeId: 12345,
  selectedVariantId: 67890,
  variantBaseCost: 5.50,
  variantPrice: 12.99,
  resolvedBaseUnitPrice: 5.50
}
```

### Verify in Database
```sql
-- Check order_items for the new order
SELECT 
  oi.id,
  oi.price,                    -- Should be cart price (e.g., 12.99)
  oi.base_revenue_amount,      -- Should be variant base_cost (e.g., 5.50)
  oi.studio_payout_amount      -- Should reflect variant margin (12.99-5.50)
FROM order_items oi
WHERE oi.order_id = (SELECT MAX(id) FROM orders);
```

### Verify Calculation
```
If variant base_cost = 5.50 and item.price = 12.99:

studio_payout_amount = 12.99 - 5.50 = 7.49 ✅
super_admin_share_amount = 5.50 - production_cost_amount
```

## Rollback Instructions

If issues occur, revert to original code:

1. Remove all variant pricing resolution code (~50 lines)
2. Change:
   ```javascript
   baseUnitPrice: resolvedBaseUnitPrice,
   ```
   Back to:
   ```javascript
   baseUnitPrice: productRow?.sizeBasePrice ?? productRow?.productBasePrice ?? 0,
   ```
3. Remove logging statements
4. Redeploy server

No database changes needed. Existing orders unaffected.
