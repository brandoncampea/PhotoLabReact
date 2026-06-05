# Variant Pricing Fix - Test Plan

## Overview
This test plan verifies that orders created with variant products correctly use the variant's base costs and prices for calculating studio costs, production costs, and profit margins.

## Prerequisites
- Access to the database
- A price list with variant pricing configured
- Admin account to view order details

## Test Scenarios

### Scenario 1: Create Order with Variant Product (Different Base Cost)

**Setup:**
1. Create or use existing product with multiple variants:
   - Variant A (Premium): base_cost = $5.00, price = $12.00
   - Variant B (Standard): base_cost = $3.00, price = $8.00

2. Ensure both variants are active in super_price_list_item_whcc_variants table

**Steps:**
1. Add photo to cart
2. Select product with variant pricing
3. Select Variant A (Premium) - base_cost $5.00
4. Proceed to checkout
5. Create order

**Expected Results:**
1. In database, check order_items table:
   ```sql
   SELECT 
     oi.id,
     oi.price,
     oi.base_revenue_amount,
     oi.production_cost_amount,
     oi.gross_studio_markup_amount,
     oi.studio_payout_amount,
     oi.super_admin_share_amount
   FROM order_items oi
   WHERE oi.order_id = <new_order_id>;
   ```

2. Calculations should be:
   - `price`: $12.00 (from item price in cart)
   - `base_revenue_amount`: $5.00 (from variant base_cost, NOT default product cost)
   - `studio_payout_amount`: ($12.00 - $5.00) = $7.00
   - `super_admin_share_amount`: ($5.00 - production_cost)

3. Server log should show:
   ```
   [ORDER ITEM VARIANT PRICING] {
     productSizeId: <id>,
     selectedVariantId: <id>,
     variantBaseCost: 5,
     variantPrice: 12,
     resolvedBaseUnitPrice: 5
   }
   ```

### Scenario 2: Compare Same Product with Different Variants

**Setup:**
1. Add same product photo twice, each with different variant selection

**Steps:**
1. Item 1: Select Variant A (Premium - $5.00 cost)
2. Item 2: Select Variant B (Standard - $3.00 cost)
3. Create order with both items

**Expected Results:**
1. In database:
   ```sql
   SELECT 
     oi.id,
     oi.product_id,
     oi.price,
     oi.base_revenue_amount,
     oi.studio_payout_amount
   FROM order_items oi
   WHERE oi.order_id = <order_id>
   ORDER BY oi.id;
   ```

2. Item 1 should have:
   - base_revenue_amount: $5.00
   - studio_payout_amount: higher (Premium)

3. Item 2 should have:
   - base_revenue_amount: $3.00
   - studio_payout_amount: lower (Standard)

### Scenario 3: Regression - Non-Variant Products Still Work

**Setup:**
1. Use product WITHOUT variants (no entries in super_price_list_item_whcc_variants)

**Steps:**
1. Add photo with non-variant product
2. Create order

**Expected Results:**
1. Order calculations should use default product/size pricing:
   - base_revenue_amount should equal product_size.price or product.price
2. No variant pricing logs in console
3. order_items.base_revenue_amount should match expected base price

### Scenario 4: Invalid Variant ID (Should Fallback)

**Setup:**
1. Send order with non-existent variant ID
2. Or send order with variant ID that doesn't match the product_size_id

**Steps:**
1. Manually create order item with invalid variant ID (for testing)
2. Submit order

**Expected Results:**
1. System should fallback to default product/size pricing
2. No errors in database
3. Order should process successfully with default costs
4. No variant pricing logs (since lookup failed)

## Database Validation Queries

### Check variant pricing was applied:
```sql
-- Find orders with specific product
SELECT 
  o.id as order_id,
  o.created_at,
  oi.id as item_id,
  p.name as product_name,
  oi.price as retail_price,
  oi.base_revenue_amount as studio_cost,
  oi.production_cost_amount,
  oi.studio_payout_amount,
  oi.quantity,
  oi.product_options_snapshot
FROM orders o
INNER JOIN order_items oi ON o.id = oi.order_id
LEFT JOIN products p ON p.id = oi.product_id
WHERE p.id = <product_id>
  AND o.created_at > CURRENT_TIMESTAMP - INTERVAL 1 HOUR
ORDER BY o.created_at DESC;
```

### Compare expected vs actual base cost:
```sql
-- Show variant pricing from price list
SELECT 
  oi.id as item_id,
  oi.order_id,
  p.name as product_name,
  ps.size_name,
  oi.base_revenue_amount as actual_base_cost,
  ps.cost as default_product_cost,
  COALESCE(v.base_cost, ps.cost) as expected_variant_cost
FROM order_items oi
LEFT JOIN products p ON p.id = oi.product_id
LEFT JOIN product_sizes ps ON ps.id = oi.product_size_id
LEFT JOIN super_price_list_item_whcc_variants v ON v.id = (
  -- Would need to parse productOptions to get variant ID
  -- This is a simplified query for reference
)
WHERE oi.order_id = <order_id>;
```

## Performance Considerations

**Impact:** 
- Each order item with variants will trigger one additional database query
- Query is indexed on (v.id, spi.product_size_id)
- Minimal performance impact expected

**Optimization (Future):**
- Could batch query multiple variants at once
- Could cache variant pricing in product options at time of cart addition
- Currently acceptable as single query per item

## Edge Cases to Test

1. **No variant selected** → Should use default product pricing
2. **Multiple quantity** → Variant cost should apply to all units
3. **Digital products** → Should ignore production_cost_amount regardless
4. **Batch orders** → Should work same as regular orders
5. **Orders with discount** → Should not affect variant cost calculation
6. **Orders with studio fees** → Should not affect variant cost calculation

## Rollback Plan

If issues are discovered:

1. Revert changes to server/routes/orders.js (remove the variant pricing lookup)
2. Orders will fall back to default product/size pricing
3. Existing orders are unaffected (immutable order_items)
4. No database migration needed

## Success Criteria

- ✅ Orders with variants use correct base costs from super_price_list_item_whcc_variants
- ✅ Non-variant orders continue to work with default pricing
- ✅ Studio payout calculations reflect variant costs
- ✅ No errors in order creation
- ✅ Build passes without errors
- ✅ Server logs show variant pricing applied
