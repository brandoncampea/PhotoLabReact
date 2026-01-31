# Batch Shipping Feature

## Overview
The batch shipping feature allows customers to place orders that are charged immediately but NOT submitted to the lab until an admin processes them in bulk with a shared batch shipping address.

## Customer Flow

1. **Place Order**: Customer adds items to cart and proceeds to checkout
2. **Select Batch Shipping**: During checkout, customer selects "Batch Shipping" option
3. **Payment Charged**: Customer's payment is processed immediately
4. **Order Created**: Order is created with `isBatch: true` and `labSubmitted: false` flags
5. **Confirmation**: Customer receives order confirmation but order is NOT sent to lab yet

## Admin Flow

### Viewing Batch Orders

1. Navigate to **Admin → Orders**
2. Click the **"Batch Orders"** tab
3. See all pending batch orders (where `isBatch: true` AND `labSubmitted: false`)
4. Badge shows count: e.g., "Batch Orders (3)"

### Submitting Batch Orders to Lab

1. On the **Batch Orders** tab, fill in the **Batch Shipping Address** form:
   - Full Name *
   - Email *
   - Address Line 1 *
   - Address Line 2 (optional)
   - City *
   - State *
   - Zip Code *
   - Country *

2. Click **"Submit N Batch Order(s) to Lab"** button

3. Confirm the submission dialog

4. System actions:
   - Saves batch shipping address to each order
   - Submits orders to WHCC/Mpix with the batch address
   - Sets `labSubmitted: true` on all orders
   - Records `labSubmittedAt` timestamp
   - Updates order status to "Processing"

### Order Display Features

**Batch Orders are visually identified with:**
- Yellow "Batch Order" badge
- Green "Submitted to Lab" badge (after submission)
- ⚠️ Warning icon for pending submissions
- Customer's original shipping address displayed
- Batch shipping address shown after submission

## Technical Implementation

### Order Type Fields

```typescript
interface Order {
  // ... existing fields
  isBatch?: boolean;              // True if batch shipping selected
  batchShippingAddress?: ShippingAddress;  // Address used for lab submission
  labSubmitted?: boolean;         // True after admin submits to lab
  labSubmittedAt?: string;        // Timestamp of lab submission
}
```

### API Methods

**adminMockApi.orders.getAll()**
- Returns all orders including batch orders

**adminMockApi.orders.submitBatchToLab(orderIds, batchAddress)**
- Submits specified orders to lab
- Updates batch address, labSubmitted flag, and timestamp
- Changes order status to "Processing"

### Mock Data

The mockApi properly tracks batch orders in memory. In production:
- Backend should store these fields in database
- WHCC/Mpix services should be called during batch submission
- Email notifications should be sent to customers when orders are submitted

## UI Components

### AdminOrders.tsx Updates

- **Tab Navigation**: "All Orders" | "Batch Orders (count)"
- **Batch Address Form**: Grid layout with validation
- **Submit Button**: Disabled when no pending orders or form incomplete
- **Order Cards**: Enhanced with batch badges and shipping info
- **Empty State**: Shows appropriate message per tab

## Testing

### Test Batch Order Flow

1. **Customer Portal**:
   - Add items to cart
   - Select "Batch Shipping" at checkout
   - Complete payment
   - Verify order appears in Orders page

2. **Admin Portal**:
   - Login to admin (admin@photolab.com)
   - Go to Orders → Batch Orders tab
   - Verify pending batch order appears
   - Fill in batch shipping address
   - Click "Submit to Lab"
   - Verify success message

3. **Verification**:
   - Order should move out of "Batch Orders" tab
   - Order should show "Submitted to Lab" badge in "All Orders"
   - Order status should be "Processing"

## Future Enhancements

- [ ] Email notifications when batch is submitted
- [ ] Batch submission history/audit log
- [ ] Ability to exclude specific orders from batch
- [ ] Multiple batch addresses for different order groups
- [ ] Batch deadline countdown timer
- [ ] CSV export of batch orders for lab submission
