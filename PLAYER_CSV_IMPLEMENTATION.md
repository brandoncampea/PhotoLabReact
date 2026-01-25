# Player Names CSV Upload Feature - Implementation Summary

## Changes Made

### Backend Changes

#### 1. Database Schema (`server/database.js`)
- Added migration to create `player_names` TEXT column on `photos` table
- Automatically runs on server startup
- Existing databases will be updated automatically

#### 2. CSV Upload Endpoint (`server/routes/photos.js`)
- **New POST Route**: `/api/photos/album/:albumId/upload-players`
  - Accepts CSV file upload via multipart/form-data
  - Parses CSV with flexible header matching:
    - Accepts `file_name`, `fileName`, `filename`, or `File Name`
    - Accepts `player_name`, `playerName`, or `Player Name`
  - Matches photos by filename and updates `player_names` column
  - Returns: `{ message, rowsParsed, photosUpdated, totalPhotos }`
  - Error handling: Returns 400 for missing/malformed CSV

#### 3. Enhanced GET Endpoints (`server/routes/photos.js`)
- **GET `/api/photos/album/:albumId`**
  - Added `player_names` field to SELECT
  - New optional query parameter: `?playerName=...`
  - Case-insensitive filtering when playerName is provided

- **GET `/api/photos/search`**
  - Added `player_names` field to SELECT
  - Search now includes player names in WHERE clause
  - Searches: filename, description, metadata, AND player_names

#### 4. Dependencies
- Added `csv-parser` npm package for CSV parsing
- Already had: express, multer (for file uploads), better-sqlite3

### Frontend Changes

#### 1. Type Definitions (`src/types/index.ts`)
- Updated `Photo` interface to include `playerNames?: string` field

#### 2. Services

**photoService.ts:**
- Updated `getPhotosByAlbum()` to accept optional `playerName` parameter
- New method: `uploadPlayerNamesCsv(albumId, file)` → returns upload stats

**exifService.ts:**
- Updated `searchInMetadata()` to include player names in search

#### 3. Components

**PhotoCard.tsx:**
- Displays player names when available
- Shows "👤 [Player Name]" in orange/bold text below filename

#### 4. Pages

**AlbumDetails.tsx:**
- Added new state: `playerFilter`, `uploadingCsv`, `csvMessage`, `showCsvUpload`
- Added "Filter by player name..." search input
- Added "📋 Upload Player Names" button
- New CSV upload dialog with:
  - File input for CSV selection
  - Example CSV format display
  - Real-time upload feedback (success/error messages)
  - Loading state during upload
- Updated photo filtering logic to include `playerFilter`
- Added `handleCsvUpload()` handler that:
  - Uploads CSV to backend
  - Reloads photos to show updated player names
  - Displays success/error messages

### Files Created

1. **PLAYER_TAGS_FEATURE.md** - Comprehensive feature documentation
   - Feature overview
   - Usage guide for owners and customers
   - Implementation details
   - API specifications
   - Example CSV formats
   - Future enhancements

2. **public/player-names-template.csv** - Template CSV download
   - Users can download as reference
   - Shows proper format with example data

### File Changes Summary

| File | Change | Status |
|------|--------|--------|
| server/database.js | Added player_names column migration | ✅ |
| server/routes/photos.js | Added CSV upload endpoint, enhanced GET endpoints | ✅ |
| src/types/index.ts | Added playerNames to Photo interface | ✅ |
| src/services/photoService.ts | Added uploadPlayerNamesCsv method, updated getPhotosByAlbum | ✅ |
| src/services/exifService.ts | Updated searchInMetadata to include player names | ✅ |
| src/components/PhotoCard.tsx | Added player name display | ✅ |
| src/pages/AlbumDetails.tsx | Added CSV upload UI and player filter | ✅ |
| package.json | Added csv-parser dependency | ✅ |

## How to Use

### For Developers/Album Owners:

1. **Create a CSV file** with two columns:
   ```csv
   file_name,player_name
   photo001.jpg,John Smith
   photo002.jpg,Jane Doe
   ```

2. **Upload in Album Details page**:
   - Click "📋 Upload Player Names"
   - Select CSV file
   - See feedback showing updated count

3. **Search by player name**:
   - Use "Filter by player name..." field
   - Or search globally across albums

### API Usage Example:

**Upload CSV:**
```bash
curl -X POST http://localhost:3001/api/photos/album/1/upload-players \
  -F "csv=@players.csv"
```

**Get photos filtered by player:**
```bash
curl http://localhost:3001/api/photos/album/1?playerName=John
```

**Search all photos by player:**
```bash
curl http://localhost:3001/api/photos/search?q=John
```

## Testing

To test the feature:

1. **Create a CSV file** (see template in `/public/player-names-template.csv`)
2. **Navigate to an album** in the UI
3. **Click "📋 Upload Player Names"** button
4. **Select your CSV file** and wait for success message
5. **Observe**:
   - Player names appear on photo cards (👤 emoji)
   - Filter field works for searching by player
   - Search globally includes player names

## Error Handling

- Missing CSV → 400 with "No CSV file provided"
- Parse error → 400 with "Failed to parse CSV: [error]"
- No file matches → Updates 0 photos (no error)
- Partial matches → Updates only matching photos (safe operation)

## Performance Notes

- CSV parsing happens on server side (safe, no large uploads)
- File matching is O(n*m) but typically fast for reasonable album sizes
- Database queries are indexed on album_id
- Frontend filtering is client-side (instant)

## Security Considerations

- File upload limited to CSV files (but should validate extension)
- CSV parsing via external library (csv-parser, well-maintained)
- No authentication required for this feature (consider adding if sensitive)
- File path traversal prevented (uses basename)

## Future Enhancements

1. **Multiple players per photo** - Parse comma-separated player names
2. **Player autocomplete** - Show previous player names when typing
3. **Batch CSV operations** - Upload to multiple albums at once
4. **Player statistics** - Show most photographed players per album
5. **CSV download** - Export current photo→player mappings as CSV
6. **Validation** - Check for duplicate file names before upload
