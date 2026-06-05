# Variant Pricing Fix - Order Accounting Calculations

## Problem
When creating orders with items that have **variant pricing** (different base costs for different finishes/attributes), the system was not correctly calculating studio costs and profits. Instead of using the selected variant's `base_cost`, it was falling back to the default product size pricing.

## Impact
- **Studio Cost Calculations**: Used default product size base price instead of variant base cost
- **Production Cost**: Used default product size cost instead of variant cost  
- **Profit Margins**: Were incorrect when variants had different costs than the base product
- **Financial Reports**: Studio payout calculations were inaccurate for variant products

## Root Cause
In the order creation flow (`POST /orders`), when calculating item accounting:

```javascript
// OLD CODE - ignored variant pricing
const accounting = calculateItemAccountingSnapshot({
  unitPrice: item.price,
  quantity: item.quantity,
  baseUnitPrice: productRow?.sizeBasePrice ?? productRow?.productBasePrice ?? 0,  // ❌ Always uses default
  productionUnitCost: productRow?.sizeCost ?? productRow?.productCost ?? 0,        // ❌ Always uses default
  isDigital,
  productOptions,
});
```

The system had access to the selected variant ID through `item.productOptions?.whccSelectedVariantId`, but wasn't querying the variant pricing from the database.

## Solution
Modified order item accounting calculation in `server/routes/orders.js` (around line 3720) to:

1. **Check if a variant is selected** via `productOptions.whccSelectedVariantId` or `whccSelectedVariantLocalId`
2. **Query the database** for the variant's `base_cost` and `price` from `super_price_list_item_whcc_variants`
3. **Use variant pricing** instead of default product sizing when available

```javascript
// NEW CODE - respects variant pricing
let resolvedBaseUnitPrice = productRow?.sizeBasePrice ?? productRow?.productBasePrice ?? 0;
let resolvedProductionUnitCost = productRow?.sizeCost ?? productRow?.productCost ?? 0;

if (productOptions && item.productSizeId) {
  const selectedVariantId = Number(productOptions?.whccSelectedVariantId ?? 0);
  
  if (selectedVariantId > 0) {
    // Query the variant's actual base cost
    const variantRow = await queryRow(
      `SELECT v.base_cost, v.price
       FROM super_price_list_item_whcc_variants v
       INNER JOIN super_price_list_items spi ON spi.id = v.super_price_list_item_id
       WHERE v.id = $1 AND spi.product_size_id = $2`,
      [selectedVariantId, item.productSizeId]
    );

    if (variantRow) {
      const variantBaseCost = parseNullableNumber(variantRow?.base_cost);
      if (variantBaseCost !== null) {
        resolvedBaseUnitPrice = variantBaseCost;  // ✅ Use variant cost
      }
    }
  }
}

const accounting = calculateItemAccountingSnapshot({
  unitPrice: item.price,
  quantity: item.quantity,
  baseUnitPrice: resolvedBaseUnitPrice,      // ✅ Now uses variant cost if selected
  productionUnitCost: resolvedProductionUnitCost,
  isDigital,
  productOptions,
});
```

## Data Flow

```
CartContext (stores variant ID in productOptions)
    ↓
Order POST /orders endpoint (receives items with productOptions)
    ↓
NEW: Query super_price_list_item_whcc_variants for variant.base_cost
    ↓
calculateItemAccountingSnapshot (uses variant base_cost)
    ↓
Order Item saved with correct:
  - base_revenue_amount (based on variant cost)
  - studio_payout_amount (based on variant cost)
  - super_admin_share_amount (based on variant cost)
  - studio_net_payout_amount (correct profit)
```

## Testing

To verify the fix works correctly:

1. **Create a product with variants** that have different base costs
   - Example: "Premium Print" finish costs $2.50, "Standard Print" costs $2.00
   
2. **Add items to cart** with different variants selected
   
3. **Create an order** with those items
   
4. **Check order calculations** in the database:
   ```sql
   SELECT oi.id, oi.price, oi.base_revenue_amount, oi.studio_payout_amount
   FROM order_items oi
   WHERE oi.order_id = ?;
   ```

5. **Verify**:
   - `base_revenue_amount` should use variant base cost, not default product cost
   - `studio_payout_amount` should reflect correct margin based on variant pricing

## Logging
When an order is created with variant pricing, look for console log:
```
[ORDER ITEM VARIANT PRICING] {
  productSizeId: <id>,
  selectedVariantId: <id>,
  variantBaseCost: <cost>,
  variantPrice: <price>,
  resolvedBaseUnitPrice: <cost>
}
```

This confirms the variant pricing was found and applied.
