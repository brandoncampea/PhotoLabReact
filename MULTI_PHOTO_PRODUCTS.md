# Multi-Photo Products Implementation Guide

## Overview
Multi-photo products allow customers to create items like collages, photo albums, or multi-image gifts that require multiple photos per order item. This guide covers identification, selection, and order processing.

## 1. Identifying Multi-Photo Products in Mpix API

### Current Approach
Currently, **Mpix product catalog in the codebase does NOT have multi-photo products**. They are all single-photo items (prints, canvas, books, gifts, etc.).

### How to Identify Multi-Photo Products
When expanding the Mpix catalog, multi-photo products should be identified by adding a `maxPhotos` field to the product object:

```typescript
interface MpixProduct {
  productUID: number;
  productId: number;
  name: string;
  description: string;
  width?: number;
  height?: number;
  basePrice: number;
  category: string;
  maxPhotos?: number;  // NEW: undefined/1 = single photo, >1 = multi-photo
  minPhotos?: number;  // NEW: minimum required photos
}
```

### Mpix API Response Pattern
When fetching products from the actual Mpix API, the response will likely include:

```json
{
  "productId": "collage-4-photo",
  "name": "4-Photo Collage",
  "maxPhotos": 4,
  "minPhotos": 4,
  "photoLayout": "2x2",
  "basePrice": 12.99
}
```

### Examples of Multi-Photo Products to Add Later
- **Photo Collages**: 2-photo, 4-photo, 6-photo, 9-photo layouts
- **Multi-Photo Books**: Depending on page count and layout options
- **Photo Calendars**: Multiple photos throughout the year
- **Gift Collections**: Multi-image mugs, blankets, puzzles with multiple photo slots

---

## 2. CartItem Structure for Multi-Photo Products

### Current Type Definition
The `CartItem` type already supports multi-photo products:

```typescript
export interface CartItem {
  photoId: number;           // primary photo id (backward compatibility)
  photo: Photo;              // primary photo object
  photoIds?: number[];       // all photos (multi-photo products)
  photos?: Photo[];          // full photo objects
  quantity: number;
  price: number;
  cropData?: CropData;
  productId?: number;
  productSizeId?: number;
}
```

### Single-Photo Product (Current Behavior)
```javascript
const cartItem = {
  photoId: 42,
  photo: { id: 42, fileName: "photo.jpg", ... },
  quantity: 1,
  price: 9.99,
  cropData: { x: 0, y: 0, width: 100, height: 100, ... }
};
```

### Multi-Photo Product (New Behavior)
```javascript
const cartItem = {
  photoId: 42,                          // primary photo (for compatibility)
  photo: { id: 42, fileName: "photo1.jpg", ... },
  photoIds: [42, 43, 44, 45],          // all selected photos
  photos: [
    { id: 42, fileName: "photo1.jpg", ... },
    { id: 43, fileName: "photo2.jpg", ... },
    { id: 44, fileName: "photo3.jpg", ... },
    { id: 45, fileName: "photo4.jpg", ... }
  ],
  quantity: 1,
  price: 12.99,
  cropData: [                           // optional: per-photo crop data
    { x: 0, y: 0, width: 100, height: 100, ... },
    { x: 10, y: 20, width: 95, height: 90, ... },
    { x: 5, y: 5, width: 98, height: 98, ... },
    { x: 0, y: 0, width: 100, height: 100, ... }
  ]
};
```

---

## 3. Customer Photo Selection UI

### Current Flow (Single-Photo)
1. Customer views album → clicks on photo → Photo detail page
2. Photo detail shows "Add to Cart" button
3. Customer selects product type (print, canvas, etc.) and size
4. One photo → one product → one cart item

### New Flow (Multi-Photo Products)
Two possible approaches:

#### **Approach A: Product-First (Recommended)**
1. Customer selects multi-photo product first
2. System shows "Select X photos for this product"
3. Modal/gallery appears for multi-photo selection
4. Customer selects required number of photos with drag-to-reorder
5. Optionally crop each photo
6. Add to cart

#### **Approach B: Photo-First**
1. Customer clicks on a photo
2. If product is multi-photo: "This product requires 4 photos. Select additional photos from your album"
3. Multi-select interface appears
4. Proceed to add to cart

**Recommendation**: Use **Approach A** (Product-First) because:
- Product requirements are clear upfront
- UX is more explicit about number of photos needed
- Easier to validate all photos are selected before adding to cart

---

## 4. Implementation Components

### 4.1 Update Product Catalog (mpixService.ts)
Add multi-photo products when expanding the catalog:

```typescript
// In getDefaultProductCatalog():
{
  productUID: 300,
  productId: 300,
  name: '4-Photo Collage 8x10',
  description: 'Gallery-wrapped 4-photo collage (2x2 layout)',
  width: 8,
  height: 10,
  basePrice: 12.99,
  category: 'collage',
  maxPhotos: 4,
  minPhotos: 4
},
{
  productUID: 301,
  productId: 301,
  name: '9-Photo Collage 11x14',
  description: 'Gallery-wrapped 9-photo collage (3x3 layout)',
  width: 11,
  height: 14,
  basePrice: 18.99,
  category: 'collage',
  maxPhotos: 9,
  minPhotos: 9
}
```

### 4.2 Update CartContext
Modify `addToCart()` to handle multi-photo products:

```typescript
addToCart(item: CartItem): void {
  // Validate multi-photo requirements
  if (item.productId && products[item.productId].maxPhotos) {
    const maxPhotos = products[item.productId].maxPhotos;
    const photoCount = item.photoIds?.length || 1;
    
    if (photoCount !== maxPhotos) {
      throw new Error(`This product requires exactly ${maxPhotos} photos`);
    }
  }
  
  // Add or update cart item
  const existingIndex = this.items.findIndex(
    i => i.photoId === item.photoId && i.productId === item.productId
  );
  
  if (existingIndex >= 0) {
    this.items[existingIndex].quantity += item.quantity;
  } else {
    this.items.push(item);
  }
}
```

### 4.3 Create MultiPhotoSelector Component
New component for selecting multiple photos:

```typescript
// src/components/MultiPhotoSelector.tsx
interface MultiPhotoSelectorProps {
  albumPhotos: Photo[];
  requiredCount: number;
  onSelect: (photos: Photo[]) => void;
  onCancel: () => void;
}

export const MultiPhotoSelector: React.FC<MultiPhotoSelectorProps> = ({
  albumPhotos,
  requiredCount,
  onSelect,
  onCancel
}) => {
  const [selectedPhotos, setSelectedPhotos] = useState<Photo[]>([]);
  
  const handlePhotoClick = (photo: Photo) => {
    setSelectedPhotos(prev => {
      const isSelected = prev.find(p => p.id === photo.id);
      if (isSelected) {
        return prev.filter(p => p.id !== photo.id);
      } else if (prev.length < requiredCount) {
        return [...prev, photo];
      }
      return prev;
    });
  };
  
  return (
    <div className="multi-photo-selector">
      <h3>Select {requiredCount} photos for this product</h3>
      <p>{selectedPhotos.length} / {requiredCount} selected</p>
      
      <div className="photo-grid">
        {albumPhotos.map(photo => (
          <div
            key={photo.id}
            className={`photo-item ${selectedPhotos.find(p => p.id === photo.id) ? 'selected' : ''}`}
            onClick={() => handlePhotoClick(photo)}
          >
            <img src={photo.thumbnailUrl} alt={photo.fileName} />
            <div className="selection-number">
              {selectedPhotos.findIndex(p => p.id === photo.id) + 1 || ''}
            </div>
          </div>
        ))}
      </div>
      
      <div className="buttons">
        <button 
          onClick={onCancel}
          className="btn-secondary"
        >
          Cancel
        </button>
        <button
          onClick={() => onSelect(selectedPhotos)}
          disabled={selectedPhotos.length !== requiredCount}
          className="btn-primary"
        >
          Confirm Selection
        </button>
      </div>
    </div>
  );
};
```

### 4.4 Update Order Conversion (Services)
Modify checkoutService.ts to handle multi-photo order items:

```typescript
// In convertCartToMpixOrder() or similar:
const orderItems = cart.items.map(item => {
  const photos = item.photos || [item.photo];
  
  return {
    productId: item.productId,
    quantity: item.quantity,
    images: photos.map((photo, index) => ({
      imageId: photo.id,
      position: index + 1,
      url: photo.fullImageUrl
    }))
  };
});
```

---

## 5. Order Processing

### Mpix API Order Submission (Multi-Photo Item)
```json
{
  "orderItems": [
    {
      "productId": "collage-4-photo",
      "quantity": 1,
      "images": [
        { "position": 1, "imageUrl": "https://..." },
        { "position": 2, "imageUrl": "https://..." },
        { "position": 3, "imageUrl": "https://..." },
        { "position": 4, "imageUrl": "https://..." }
      ]
    }
  ]
}
```

### WHCC API Order Submission (Multi-Photo Item)
```json
{
  "OrderItems": [
    {
      "ProductUID": 12345,
      "Quantity": 1,
      "ItemAssets": [
        {
          "ProductNodeID": 1,
          "AssetPath": "https://...",
          "ImageHash": "hash1",
          "PrintedFileName": "photo1.jpg"
        },
        {
          "ProductNodeID": 2,
          "AssetPath": "https://...",
          "ImageHash": "hash2",
          "PrintedFileName": "photo2.jpg"
        },
        {
          "ProductNodeID": 3,
          "AssetPath": "https://...",
          "ImageHash": "hash3",
          "PrintedFileName": "photo3.jpg"
        },
        {
          "ProductNodeID": 4,
          "AssetPath": "https://...",
          "ImageHash": "hash4",
          "PrintedFileName": "photo4.jpg"
        }
      ]
    }
  ]
}
```

---

## 6. Database Schema Updates

### OrderItems Table
Add columns to support multi-photo tracking:

```sql
ALTER TABLE order_items ADD COLUMN photo_ids TEXT;  -- JSON array: [1, 2, 3, 4]
ALTER TABLE order_items ADD COLUMN photo_count INT DEFAULT 1;

-- Example data:
-- id: 1, order_id: 5, product_id: 300, photo_id: 42, photo_ids: "[42, 43, 44, 45]", photo_count: 4
-- id: 2, order_id: 5, product_id: 1, photo_id: 51, photo_ids: NULL, photo_count: 1
```

---

## 7. Implementation Checklist

### Phase 1: Data Model (Current State)
- [x] CartItem type supports photoIds and photos arrays
- [ ] Update mpixService to include maxPhotos/minPhotos in product definitions
- [ ] Update WHCC product catalog similarly

### Phase 2: UI Components
- [ ] Create MultiPhotoSelector component
- [ ] Update photo detail page to detect multi-photo products
- [ ] Add multi-photo selection flow to AlbumDetails page
- [ ] Update CartItem display to show multiple photos when present

### Phase 3: Cart & Checkout
- [ ] Update CartContext.addToCart() to validate photo count requirements
- [ ] Update Cart.tsx to display multi-photo items
- [ ] Update CartItem.tsx component to show photo gallery for multi-photo items
- [ ] Add crop modal support for multi-photo items (per-photo cropping)

### Phase 4: Order Processing
- [ ] Update checkoutService.ts order conversion functions
- [ ] Modify mpixService.convertCartToMpixOrder() for multi-photo handling
- [ ] Modify whccService.convertCartToWhccOrder() for multi-photo handling
- [ ] Test order submission with multi-photo items

### Phase 5: Database & Storage
- [ ] Migrate order_items table to add photo_ids and photo_count columns
- [ ] Update orderService to store/retrieve multi-photo order data
- [ ] Update order history display to show multi-photo items

### Phase 6: Testing & QA
- [ ] Unit tests for multi-photo validation
- [ ] E2E tests for multi-photo selection flow
- [ ] E2E tests for multi-photo checkout
- [ ] E2E tests for multi-photo order confirmation
- [ ] Integration tests with Mpix API (sandbox)

---

## 8. Future Considerations

### Advanced Features
1. **Photo Positioning**: Allow customers to arrange/reorder photos in collage layouts
2. **Crop Per Photo**: Individual crop controls for each photo in multi-photo item
3. **Layout Options**: Different grid layouts (2x2, 3x3, 1x4, etc.) for collages
4. **Photo Sizing**: Different sizes/scales for individual photos in collage
5. **Custom Borders**: Add spacing or borders between collage photos
6. **Batch Multi-Photo**: Apply same multi-photo product to multiple sets of photos

### Analytics & Reporting
- Track which multi-photo products are most popular
- Monitor photo selection patterns (do customers reorder selected photos?)
- Measure average time in multi-photo selection UI
- Track abandonment rate for multi-photo products vs single-photo

---

## 9. Current Gaps (To Address When Adding Multi-Photo Products)

1. **Product Catalog**: Add multi-photo products to mpixService and whccService
2. **Photo Selection UI**: Create MultiPhotoSelector component
3. **Validation Logic**: Enforce min/max photo requirements
4. **Order Conversion**: Ensure services handle multiple photos per item
5. **Database Migration**: Add photo_ids column to order_items table
6. **Cart Display**: Show photo grid for multi-photo items
7. **Order History**: Display multi-photo items correctly in past orders
