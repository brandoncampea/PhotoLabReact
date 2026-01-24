# Photo Metadata & Search Feature

## Overview
This feature automatically extracts and stores EXIF metadata from photos when they are uploaded by admins, and allows customers to search and filter photos based on filename and metadata.

## Features Added

### 1. Metadata Extraction
- **Location**: `src/services/exifService.ts`
- **Functionality**: Automatically extracts metadata from uploaded images including:
  - Camera Make & Model
  - Date Taken
  - ISO
  - Aperture (f-stop)
  - Shutter Speed
  - Focal Length
  - Image Dimensions (width × height)
  - File Size

### 2. Admin Photo Upload
- **Location**: `src/pages/admin/AdminPhotos.tsx`
- **Changes**: Modified `handleUpload` to extract metadata from each file before uploading
- **Process**: Uses `Promise.all` to extract metadata from multiple files concurrently

### 3. Customer Photo Search
- **Location**: `src/pages/AlbumDetails.tsx`
- **Features**:
  - Search input to filter photos by filename or metadata
  - Sort dropdown with options:
    - File Name (alphabetical)
    - Date Taken (newest first)
  - Real-time filtering as user types
  - Shows "No photos match your search" when no results found

### 4. Photo Card Display
- **Location**: `src/components/PhotoCard.tsx`
- **Enhancement**: Now displays metadata preview on photo cards:
  - Camera make and model (with 📷 icon)
  - Date taken (with 📅 icon)
  - Price

### 5. Detailed Metadata View
- **Location**: `src/components/CropperModal.tsx`
- **Enhancement**: Shows comprehensive metadata when viewing a photo:
  - Camera information
  - Date taken
  - ISO setting
  - Aperture value
  - Shutter speed
  - Focal length
  - Image dimensions

## Technical Implementation

### Type Definitions
```typescript
// src/types/index.ts
export interface PhotoMetadata {
  cameraMake?: string;
  cameraModel?: string;
  dateTaken?: string;
  iso?: number;
  aperture?: number;
  shutterSpeed?: string;
  focalLength?: number;
  width?: number;
  height?: number;
  fileSize?: number;
}

export interface Photo {
  // ... other fields
  metadata?: PhotoMetadata;
}
```

### Search Algorithm
The `exifService.searchInMetadata()` function searches:
1. Photo filename (case-insensitive)
2. Camera make
3. Camera model
4. Date taken
5. ISO value
6. Aperture value
7. Shutter speed
8. Focal length
9. Image dimensions

### CSS Styling
New CSS classes added:
- `.search-filter-bar` - Container for search and sort controls
- `.search-input` - Search text input styling
- `.sort-controls` - Sort dropdown container
- `.photo-metadata` - Metadata display in photo cards
- `.metadata-text` - Individual metadata text items

## User Experience

### For Customers:
1. View albums with photo cards showing basic metadata
2. Use search bar to find photos by name or camera settings
3. Sort photos by name or date taken
4. Click on photos to see full metadata details before ordering

### For Admins:
1. Upload photos as usual
2. Metadata is automatically extracted and stored
3. No additional steps required
4. Metadata is preserved across all photo operations

## Future Enhancements
- Add more EXIF fields (GPS location, lens info, flash settings)
- Allow filtering by specific metadata values (e.g., "Show only Canon photos")
- Add metadata editing capability for admins
- Export metadata to CSV/JSON
- Use a real EXIF library (exifr, exif-js) for production deployment

## Testing
To test the feature:
1. Start dev server: `npm run dev`
2. Log in to admin portal
3. Upload photos to an album (metadata will be simulated for testing)
4. View album as customer
5. Use search bar to filter photos
6. Try sorting by name and date
7. Click on photos to see detailed metadata

## Notes
- Current implementation simulates camera data for testing purposes
- In production, replace the simulated data in `exifService.extractMetadata()` with a real EXIF library
- Metadata is stored in the mock API and will need to be persisted to your ASP.NET backend
- Search is client-side; for large photo collections, consider server-side search
