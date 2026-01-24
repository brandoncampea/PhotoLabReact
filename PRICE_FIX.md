# Price Structure Fix

## Issue
Photos were incorrectly assigned prices. Only products and packages should have prices, not individual photos.

## Changes Made

### 1. Type Definitions (`src/types/index.ts`)
- **Removed** `price` field from `Photo` interface
- **Added** `price` field to `CartItem` interface (stores the product price for that cart item)

### 2. Photo Display Components
- **PhotoCard.tsx**: Removed price display from photo cards
- **AdminPhotos.tsx**: Removed price display from admin photo list

### 3. Cart System Updates
- **CartContext.tsx**:
  - Made `addToCart` async to fetch product price
  - Fetches product and size information when adding to cart
  - Calculates price from `product.basePrice + size.priceModifier`
  - Stores calculated price in the CartItem
  - Updated `getTotalPrice()` to use `item.price` instead of `photo.price`

- **CartItem.tsx**:
  - Updated to display `item.price` instead of `photo.price`
  - Shows the product price that was calculated when item was added to cart

### 4. Service Updates
- **mockApi.ts**:
  - Removed `price` field from all mock photo data
  - Updated order creation to use `item.price` instead of `photo.price`

- **adminMockApi.ts**:
  - Removed `price` from uploaded photos
  - Removed `price` from photo update method

- **stripeService.ts**:
  - Updated payment calculation to use `item.price` instead of `photo.price`

- **CropperModal.tsx**:
  - Updated `getTotalPrice()` fallback to return 0 if no product selected

## How It Works Now

1. **Customer Views Photos**: Photos are displayed without prices in albums
2. **Customer Selects Product**: When clicking on a photo, customer chooses a product and size
3. **Price Calculation**: Price is calculated from `product.basePrice + size.priceModifier`
4. **Add to Cart**: The calculated price is stored with the cart item
5. **Cart Display**: Cart shows the product price that was calculated at add time
6. **Checkout**: Order total is calculated from cart item prices

## Example Flow

```typescript
// Customer views album - no prices shown
<PhotoCard photo={photo} /> // No price displayed

// Customer selects product and size in cropper modal
selectedProduct = { id: 1, basePrice: 15.00, ... }
selectedSize = { id: 2, priceModifier: 5.00, ... }

// Price calculated when adding to cart
const price = 15.00 + 5.00 = 20.00

// Cart item created with calculated price
const cartItem = {
  photoId: 123,
  photo: photo,
  productId: 1,
  productSizeId: 2,
  price: 20.00, // Product price, not photo price
  quantity: 1
}

// Cart displays: $20.00 × 1 = $20.00
```

## Benefits

- **Correct Architecture**: Prices belong to products, not photos
- **Flexible Pricing**: Same photo can have different prices based on product selection
- **Accurate Totals**: Cart totals reflect actual product prices
- **Clear Separation**: Photos are assets, products are what customers buy

## Migration Notes

If you have existing cart data in localStorage, users may need to clear their cart or the old items (with photo.price) will cause issues. You can add migration logic in CartContext if needed:

```typescript
useEffect(() => {
  const savedCart = localStorage.getItem('cart');
  if (savedCart) {
    const items = JSON.parse(savedCart);
    // Migrate old cart items that don't have price field
    const migratedItems = items.map(item => ({
      ...item,
      price: item.price || 0 // Default to 0 for old items
    }));
    setItems(migratedItems);
  }
}, []);
```
