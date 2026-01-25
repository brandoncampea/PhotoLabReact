# Photo-Based Product Recommendations

## Overview
The Photo Lab automatically analyzes uploaded photos and recommends products that best match the photo's dimensions, aspect ratio, and quality.

## Features

### 1. Automatic Dimension Extraction
When photos are uploaded, the system automatically:
- Extracts pixel dimensions (width × height)
- Stores dimensions in the database
- Uses the `sharp` library for accurate metadata extraction

### 2. Smart Recommendation Algorithm
The recommendation engine considers multiple factors:

#### Aspect Ratio Matching (40 points)
- Detects common ratios: 3:2 (DSLR), 4:3 (point-and-shoot), 1:1 (square)
- Matches photo ratio to product size ratios
- 20% tolerance for acceptable matches

#### Size Compatibility (50 points)
- Compares photo dimensions to product sizes
- Ensures photo is large enough for print quality
- Recommends appropriately sized prints

#### Orientation Matching (30 points)
- Landscape: aspect ratio > 1
- Portrait: aspect ratio < 1
- Square: aspect ratio ≈ 1
- Matches photo orientation to product orientation

#### Resolution Quality (20 points)
- Calculates megapixels (width × height / 1,000,000)
- Recommends larger prints for high-resolution photos
- Suggests smaller prints for lower resolution

#### Digital Product Bonus (10 points)
- Adds points for digital downloads
- Always a safe choice regardless of dimensions

### 3. Match Quality Grades
Recommendations are graded based on total score:
- **Excellent** (>60 points): Perfect match, optimal quality
- **Good** (>30 points): Suitable match, good quality
- **Fair** (<30 points): Acceptable but may require cropping

## User Interface

### Recommendations Display
When selecting a product for a photo, users see:
1. **Smart Recommendations Section** (top of modal)
   - Up to 3 top-recommended products
   - Color-coded badges (green=excellent, blue=good, yellow=fair)
   - Match score (0-100)
   - Reasons for recommendation
   - Photo dimensions and aspect ratio

2. **Product Grid** (below recommendations)
   - All available products
   - Recommended products highlighted with ⭐ badge
   - Blue border and background for recommended items

### Example Recommendations
```
✨ Smart Recommendations
Based on your photo's dimensions (6000 × 4000px, 1.5 ratio, landscape)

┌─────────────────────────────────────┐
│ 8×12" Print               EXCELLENT │
│ $24.99                              │
│ Why recommended:                    │
│ • Perfect 3:2 aspect ratio match    │
│ • Ideal for landscape orientation   │
│ • Excellent resolution for this size│
│ Match Score: 90/100                 │
└─────────────────────────────────────┘
```

## Technical Implementation

### Backend API

#### GET `/api/photos/:id/recommendations`
Returns personalized product recommendations for a photo.

**Response:**
```json
{
  "photo": {
    "id": 123,
    "width": 6000,
    "height": 4000,
    "aspectRatio": 1.5,
    "orientation": "landscape",
    "megapixels": 24
  },
  "recommendations": [
    {
      "productId": 5,
      "productName": "8×12\" Print",
      "basePrice": 24.99,
      "score": 90,
      "matchQuality": "excellent",
      "reasons": [
        "Perfect 3:2 aspect ratio match",
        "Ideal for landscape orientation",
        "Excellent resolution for this size"
      ]
    }
  ]
}
```

### Database Schema

#### Photos Table Additions
```sql
ALTER TABLE photos ADD COLUMN width INTEGER;
ALTER TABLE photos ADD COLUMN height INTEGER;
```

### Frontend Components

#### CropperModal.tsx
- Fetches recommendations on mount
- Displays recommendation cards
- Highlights recommended products in grid
- Shows photo dimensions and orientation

#### photoService.ts
```typescript
async getRecommendations(photoId: number): Promise<RecommendationResponse>
```

## Scoring Algorithm Details

### Calculation Example
For a 6000×4000px landscape photo (3:2 ratio) with an 8×12" print:

1. **Size Match**: Width/height ratios match → +50 points
2. **Aspect Ratio**: 3:2 ratio detected, product is 3:2 → +40 points
3. **Orientation**: Both landscape → +30 points
4. **Resolution**: 24MP > 12MP threshold → +20 points
5. **Total**: 140 points (capped at 100)

**Result**: Excellent match (>60)

### Common Aspect Ratios
- **3:2** (1.5): DSLR cameras, 4×6", 8×12", 12×18", 16×24"
- **4:3** (1.33): Point-and-shoot, 8×10", 16×20"
- **1:1** (1.0): Square format, 8×8", 12×12"
- **5:7** (0.71): Portrait format, 5×7", 10×14"
- **16:9** (1.78): Wide format, panoramic

### Resolution Guidelines
- **< 3 MP**: Suitable for small prints (4×6", 5×7")
- **3-6 MP**: Good for medium prints (8×10", 8×12")
- **6-12 MP**: Excellent for standard prints (up to 16×20")
- **> 12 MP**: Perfect for large prints (16×24"+)

## Benefits

### For Customers
- **Confidence**: Know which products work best with their photos
- **Quality**: Avoid ordering prints that are too large for photo resolution
- **Ease**: No guessing about aspect ratios or cropping requirements
- **Education**: Learn about their photo specifications

### For Business
- **Reduced Returns**: Customers order appropriate sizes
- **Higher Satisfaction**: Products match customer expectations
- **Increased Sales**: Clear recommendations encourage purchases
- **Fewer Support Requests**: Automated guidance reduces confusion

## Usage Examples

### Example 1: High-Resolution DSLR Photo
```
Photo: 6000×4000px (24MP), 3:2 ratio, landscape
Top Recommendations:
1. 12×18" Print - Excellent match (95/100)
2. 16×24" Canvas - Excellent match (92/100)
3. 8×12" Print - Excellent match (90/100)
```

### Example 2: Phone Camera Square Photo
```
Photo: 3024×3024px (9MP), 1:1 ratio, square
Top Recommendations:
1. 12×12" Square Print - Excellent match (88/100)
2. 8×8" Canvas - Good match (85/100)
3. Digital Download - Good match (75/100)
```

### Example 3: Low-Resolution Portrait Photo
```
Photo: 1600×2400px (4MP), 0.67 ratio, portrait
Top Recommendations:
1. 5×7" Print - Good match (65/100)
2. 4×6" Print - Good match (62/100)
3. Digital Download - Fair match (45/100)
```

## Future Enhancements

### Potential Improvements
1. **AI-Based Content Analysis**: Detect faces, scenery types
2. **Color Profile Matching**: Recommend finishes based on colors
3. **Crop Suggestions**: Show optimal crop areas for each product
4. **Batch Analysis**: Analyze multiple photos at once
5. **Historical Learning**: Improve recommendations based on user purchases
6. **A/B Testing**: Test different scoring weights
7. **Mobile Optimization**: Touch-friendly recommendation cards

### Advanced Features
- **Smart Collections**: Auto-create product bundles based on photo set
- **Print Quality Preview**: Show predicted output quality
- **Cost Optimization**: Recommend best value for photo specifications
- **Template Matching**: Suggest products based on similar previous orders

## Testing

### Manual Testing Steps
1. Upload a photo through the admin interface
2. Verify dimensions are stored in database
3. Navigate to the photo in customer view
4. Click "Add to Cart" on the photo
5. Verify recommendations section appears
6. Check that recommendations match photo specs
7. Verify recommended products have ⭐ badge in grid
8. Test with various photo types (landscape, portrait, square)

### SQL Verification
```sql
-- Check dimensions were stored
SELECT id, file_name, width, height FROM photos WHERE width IS NOT NULL;

-- Verify recommendation endpoint
-- Visit: GET /api/photos/:id/recommendations
```

## Troubleshooting

### Issue: Dimensions not being stored
- Verify `sharp` package is installed: `npm list sharp`
- Check server logs for sharp errors
- Ensure photos table has width/height columns
- Restart server to apply migrations

### Issue: No recommendations shown
- Check browser console for API errors
- Verify photo has width/height in database
- Check that products exist in database
- Ensure products have sizes configured

### Issue: Poor recommendation quality
- Review scoring weights in `/server/routes/photos.js`
- Adjust aspect ratio tolerance (currently 20%)
- Modify resolution thresholds
- Check product size configurations

## Dependencies

### Backend
- `sharp`: Image processing and metadata extraction
- `better-sqlite3`: Database with width/height storage

### Frontend
- `photoService`: API client with getRecommendations method
- `CropperModal`: UI component for displaying recommendations

## Performance Considerations

- **Server Impact**: Minimal - dimension extraction happens during upload (one-time cost)
- **Database Impact**: Two additional INTEGER columns per photo
- **API Response**: Recommendations endpoint is fast (<50ms typical)
- **Frontend Impact**: Recommendations load in parallel with products

## Privacy & Data

- Only technical image dimensions are stored
- No image content analysis performed
- No personal data collected from photos
- Dimensions used solely for product matching
