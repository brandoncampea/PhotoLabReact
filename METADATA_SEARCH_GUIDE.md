# Enhanced Photo Metadata Search Feature

## Overview
The search functionality now supports comprehensive photo metadata/EXIF searching with field-specific filtering capabilities.

## Features

### 🔍 Comprehensive Search
Search across all photo fields:
- **Filename** - Photo file names
- **Camera Metadata** - Camera make, model, ISO, aperture, shutter speed, focal length
- **EXIF Data** - Date taken, image resolution
- **Player Names** - Tagged player/person names (from CSV upload)
- **Description** - Photo descriptions
- **Album Name** - Album containing the photo

### 🎯 Field-Specific Search
Use the "Search in:" dropdown to filter by specific EXIF properties:
- **All Fields** - Default search across everything
- **Camera Make/Model** - Find photos by specific camera
- **ISO** - Search by ISO sensitivity
- **Aperture** - Find by f-stop (e.g., f/2.8, f/5.6)
- **Shutter Speed** - Search by exposure time (e.g., 1/250, 1/1000)
- **Focal Length** - Find by focal length (e.g., 50mm, 24-70mm)

### 📊 Rich Results Display
Each search result shows:
- Photo thumbnail with watermark
- Player name (if tagged)
- Album name (badge in corner)
- Complete EXIF metadata grid:
  - 📷 Camera (make/model)
  - 🔆 ISO
  - 🔎 Aperture
  - ⏱️ Shutter Speed
  - 🎯 Focal Length
  - 📅 Date taken
  - 📐 Resolution

### 📈 Sorting Options
Sort search results by:
- **File Name** - Alphabetical order
- **Date Taken** - Most recent first
- **Album** - Grouped by album

### 🔗 Backend API Endpoints

#### Standard Search (All Fields)
```
GET /api/photos/search?q=canon
```
Searches across filename, description, metadata JSON, and player names.

Example response:
```json
[
  {
    "id": 1,
    "fileName": "photo001.jpg",
    "albumId": 1,
    "albumName": "Game Photos",
    "metadata": "{\"cameraMake\":\"Canon\",\"cameraModel\":\"EOS R5\",\"iso\":\"400\",...}",
    "playerNames": "John Smith",
    "description": "Portrait shot",
    "thumbnailUrl": "/uploads/...",
    "fullImageUrl": "/uploads/...",
    "createdDate": "2026-01-25T10:00:00Z"
  }
]
```

#### Field-Specific Search (New)
```
GET /api/photos/search?q=f/2.8&field=aperture
```

Supported field values:
- `field=filename` - Search filename only
- `field=camera` - Search camera make/model
- `field=iso` - Search ISO value
- `field=aperture` - Search aperture value
- `field=shutterSpeed` - Search shutter speed
- `field=focalLength` - Search focal length
- `field=player` - Search player names
- `field=description` - Search descriptions

#### Advanced Metadata Search (New)
```
GET /api/photos/search/metadata?q=f/2.8&type=aperture
```

Supported type values:
- `type=camera` - Camera make or model
- `type=iso` - ISO sensitivity
- `type=aperture` - Aperture f-stop
- `type=shutterSpeed` - Shutter speed
- `type=focalLength` - Focal length
- `type=date` - Date taken

This endpoint parses JSON metadata for precise matching.

## Usage Examples

### Example 1: Find Photos Shot with Specific Camera
1. Enter search box: "Canon"
2. Select "Camera Make/Model" from filter
3. View all photos taken with Canon cameras

### Example 2: Find Fast Aperture Photos
1. Enter search box: "f/2.8"
2. Select "Aperture" from filter
3. See all photos taken with f/2.8 aperture

### Example 3: Find ISO 400 Photos
1. Enter search box: "400"
2. Select "ISO" from filter
3. View all photos taken at ISO 400

### Example 4: Find High-Speed Photos
1. Enter search box: "1/1000"
2. Select "Shutter Speed" from filter
3. See fast action shots

### Example 5: Find Photos from Specific Album
1. Enter search box: album name
2. Results show all photos from that album
3. Album name displayed on each card

## Frontend Implementation

### Search Component State
```typescript
- searchQuery: string - Current search term
- metadataFilter: 'all' | 'camera' | 'iso' | 'aperture' | 'shutterSpeed' | 'focalLength'
- sortBy: 'name' | 'date' | 'album'
- allPhotos: Photo[] - All loaded photos
- filteredPhotos: Photo[] - Search results
```

### Search Logic Flow
```
User enters search term + selects filter
        ↓
filterPhotos() function runs
        ↓
If metadataFilter !== 'all':
  Filter by specific EXIF field
Else:
  Use exifService.searchInMetadata() (searches all fields)
        ↓
Sort results (name/date/album)
        ↓
Display with metadata grid
```

### Enhanced exifService Methods

**searchInMetadataWithField(photo, term)**
- Returns: `{ matches: boolean, matchField?: string }`
- Shows which field matched the search
- Used for detailed search results

**getMetadataDisplay(metadata)**
- Returns formatted metadata array
- Includes emoji icons for each field
- Used to display metadata grid on search results

**formatMetadataForDisplay(metadata)**
- Returns single-line formatted string
- Example: "📷 Canon EOS R5 • ISO 400 • f/2.8 • 1/250 • 50mm"
- For quick preview

## Search Results Display

Each search result card shows:
```
┌─────────────────────────────┐
│  [Photo Thumbnail]          │ ← Album name badge
│                             │    (top right)
├─────────────────────────────┤
│ photo001.jpg                │
│ 👤 John Smith               │ (if tagged)
├─────────────────────────────┤
│ 📷 Camera: Canon EOS R5     │
│ 🔆 ISO: 400                 │
│ 🔎 Aperture: f/2.8          │ ← Metadata grid
│ ⏱️ Shutter: 1/250           │
│ 🎯 Focal: 50mm              │
│ 📅 Date: Jan 15, 2026       │
│ 📐 Resolution: 6720x4480    │
└─────────────────────────────┘
```

## Technical Details

### Database Query Optimization
- Uses COLLATE NOCASE for case-insensitive search
- Limits results to 100 photos to prevent performance issues
- Joins albums table to include album names
- Indexes on album_id and file_name columns

### Metadata Storage
- Metadata stored as JSON text in database
- Example JSON structure:
```json
{
  "cameraMake": "Canon",
  "cameraModel": "EOS R5",
  "dateTaken": "2026-01-25T10:00:00Z",
  "iso": "400",
  "aperture": "f/2.8",
  "shutterSpeed": "1/250",
  "focalLength": "50mm",
  "width": 6720,
  "height": 4480,
  "fileSize": 2048576
}
```

### Search Strategy
- **Frontend filtering** - Faster, instant results, works offline
- **Backend search** - Better for large datasets, exact matching
- **Hybrid approach** - Frontend handles most searches, backend available for API consumers

## Performance Considerations

### Large Dataset Handling
- Frontend loads all photos from all albums into memory
- Client-side filtering for instant results
- Limits to 100 results to prevent UI slowdown
- Consider pagination if dataset grows beyond 1000 photos

### Search Tips
1. Use specific field filters for faster results
2. Combine search terms (e.g., "Canon" + "Camera" filter)
3. Use partial values (e.g., "2.8" finds "f/2.8")
4. ISO searches work best with exact values (e.g., "400", "3200")

## Future Enhancements

Potential improvements:
1. **Advanced Filters** - Date range picker, ISO range slider
2. **Search History** - Remember recent searches
3. **Saved Searches** - Save frequent search combinations
4. **Search Suggestions** - Autocomplete based on metadata
5. **Batch Export** - Export search results as ZIP
6. **Search Analytics** - Track popular searches
7. **Smart Grouping** - Group results by camera/ISO/date
8. **Filters UI** - Visual filter builder for complex searches

## Troubleshooting

### No Results Found
- Check spelling of search term
- Try broader search (use "All Fields" filter)
- Verify photos have metadata extracted
- Try searching by filename instead

### Slow Search
- Use specific field filter instead of "All Fields"
- Narrow search term to be more specific
- Sort by name instead of date (faster)
- Check browser console for errors

### Metadata Not Displaying
- Some photos may not have EXIF metadata
- Metadata may not be extracted from uploaded photos
- Check that metadata is stored as valid JSON in database

## API Usage for Developers

### JavaScript Example
```javascript
// Search all fields
const results = await fetch('/api/photos/search?q=canon');

// Search specific field
const aperture = await fetch('/api/photos/search?q=f/2.8&field=aperture');

// Advanced metadata search
const iso = await fetch('/api/photos/search/metadata?q=400&type=iso');

// Parse results
const photos = await results.json();
photos.forEach(photo => {
  const metadata = JSON.parse(photo.metadata);
  console.log(`${photo.fileName}: ${metadata.cameraMake} @ ISO ${metadata.iso}`);
});
```

### Using exifService
```typescript
import { exifService } from '../services/exifService';

// Search with field info
const result = exifService.searchInMetadataWithField(photo, 'f/2.8');
if (result.matches) {
  console.log(`Matched in ${result.matchField} field`);
}

// Get formatted display
const display = exifService.getMetadataDisplay(photo.metadata);
display.forEach(field => {
  console.log(`${field.label}: ${field.value}`);
});

// Format single line
const summary = exifService.formatMetadataForDisplay(photo.metadata);
console.log(summary);
```
