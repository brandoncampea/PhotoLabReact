# Photo Recommendations - Quick Test Guide

## ✅ Implementation Complete

The photo recommendations feature is now fully implemented and ready to test!

## What Was Added

### Backend
- ✅ Database migrations for `width` and `height` columns in photos table
- ✅ Sharp library installed for image processing
- ✅ Photo upload endpoint extracts dimensions automatically
- ✅ New recommendation API endpoint: `GET /api/photos/:id/recommendations`
- ✅ Smart scoring algorithm (aspect ratio, orientation, resolution)

### Frontend
- ✅ TypeScript types updated with width/height
- ✅ Photo service with getRecommendations method
- ✅ CropperModal displays recommendations section
- ✅ Visual indicators for recommended products

## Quick Test (5 Minutes)

### Step 1: Restart the Server
```bash
# The server should already be running with the new code
# If not, run:
npm run server
```

### Step 2: Upload a Test Photo
1. Log in as admin
2. Go to Albums
3. Upload a photo (any JPEG/PNG)
4. Check server logs - you should see dimension extraction happening

### Step 3: View Recommendations
1. Log in as a customer
2. Navigate to the album with your test photo
3. Click "Add to Cart" on the photo
4. **Look for**: 
   - ✨ "Smart Recommendations" section at the top
   - Color-coded badges (green/blue/yellow)
   - "Why recommended" reasons
   - Photo dimensions shown
   - ⭐ "Recommended" badges on products in grid

### Step 4: Verify Different Photo Types

Upload photos with different characteristics:

**Landscape DSLR Photo** (3:2 ratio)
- Expected: Recommends 4×6", 8×12", 12×18" prints
- Quality: Should show "Excellent" matches

**Portrait Photo** (2:3 ratio)
- Expected: Recommends 5×7", 10×14" portrait prints
- Quality: Should match orientation

**Square Photo** (1:1 ratio)
- Expected: Recommends 8×8", 12×12" square prints
- Quality: Perfect 1:1 ratio match

**Low Resolution Photo** (<3MP)
- Expected: Recommends smaller prints, digital downloads
- Quality: May show "Fair" or "Good" matches

## What You Should See

### In CropperModal
```
✨ Smart Recommendations
Based on your photo's dimensions (6000 × 4000px, 1.5 ratio, landscape)

[Green Badge: EXCELLENT]
8×12" Print
$24.99
Why recommended:
• Perfect 3:2 aspect ratio match
• Ideal for landscape orientation
• Excellent resolution for this size
Match Score: 90/100

[Product Grid Below]
⭐ Recommended
8×12" Print
(blue border and background)
```

## Verify Backend

### Check Database
```bash
sqlite3 database.db "SELECT id, file_name, width, height FROM photos LIMIT 5;"
```

Expected: See width and height values for uploaded photos

### Test API Endpoint
```bash
curl http://localhost:3001/api/photos/1/recommendations
```

Expected JSON response with recommendations array

## Common Issues & Fixes

### Issue: No dimensions stored
**Symptom**: width/height are NULL in database
**Fix**: 
- Check `npm list sharp` - should show installed
- Restart server
- Re-upload photos (old photos won't have dimensions)

### Issue: No recommendations showing
**Symptom**: Modal opens but no recommendations section
**Fix**:
- Check browser console for errors
- Verify photo has dimensions in database
- Check that products exist with configured sizes

### Issue: Server won't start
**Symptom**: Error about sharp module
**Fix**:
```bash
npm install sharp
npm rebuild
```

### Issue: All recommendations show "Fair"
**Symptom**: Low scores for all products
**Fix**:
- Check that products have proper size configurations
- Verify product dimensions match common print sizes
- Review product size ratios in admin panel

## Testing Checklist

- [ ] Server starts without errors
- [ ] Database shows width/height columns exist
- [ ] Upload photo successfully
- [ ] Check database: uploaded photo has dimensions
- [ ] API endpoint returns recommendations
- [ ] Frontend modal shows recommendations section
- [ ] Recommendations have quality badges
- [ ] Reasons are displayed for each recommendation
- [ ] Product grid shows ⭐ badges for recommended items
- [ ] Recommended products have blue border/background
- [ ] Different photo types get different recommendations
- [ ] Scores make sense (landscape → landscape products)

## Next Steps After Testing

### If Everything Works:
1. ✅ Upload various real photos to test algorithm accuracy
2. ✅ Adjust scoring weights if needed (in `/server/routes/photos.js`)
3. ✅ Monitor customer feedback on recommendation quality
4. ✅ Consider A/B testing different UI placements

### If Issues Found:
1. Check browser console for JavaScript errors
2. Check server logs for API errors
3. Verify database schema with PRAGMA
4. Test API endpoint directly with curl
5. Review scoring algorithm logic

## Success Criteria

The feature is working correctly when:
- ✅ Uploaded photos automatically have width/height
- ✅ Recommendations API returns sensible suggestions
- ✅ UI clearly displays top 3 recommendations
- ✅ Recommendations make sense for photo characteristics
- ✅ Users can click recommendations to select products
- ✅ Visual indicators help identify recommended products

## Performance Check

Expected performance:
- Photo upload: <2s (including dimension extraction)
- Recommendations API: <50ms
- UI rendering: Instant (loads in parallel)

## Getting Help

If you encounter issues:
1. Check server logs for errors
2. Review browser console for frontend errors
3. Verify all migrations ran successfully
4. Check that sharp installed correctly
5. Ensure products are configured in admin panel

## Documentation

For more details, see:
- `/PHOTO_RECOMMENDATIONS.md` - Complete feature documentation
- `/server/routes/photos.js` - Recommendation algorithm
- `/src/components/CropperModal.tsx` - UI implementation
