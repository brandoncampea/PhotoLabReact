# Player Names/Tags Feature

## Overview
This feature allows customers and album owners to upload a CSV file that tags photos with player names, making them searchable by customer name.

## How It Works

### 1. CSV Upload
Album owners can upload a CSV file to an album containing player name mappings. The CSV requires two columns:
- `file_name` (or `fileName`) - The exact filename of the photo
- `player_name` (or `playerName`) - The player/person's name to associate with that photo

### 2. Example CSV Format
```csv
file_name,player_name
photo001.jpg,John Smith
photo002.jpg,Jane Doe
photo003.jpg,Michael Johnson
photo004.jpg,John Smith
photo005.jpg,Sarah Williams
```

### 3. Alternative CSV Headers
You can use any of these header variations:
- `file_name` or `fileName` or `filename` or `File Name`
- `player_name` or `playerName` or `Player Name`

## Features

### For Album Owners
- **Upload CSV**: Click "📋 Upload Player Names" in the Album Details page
- **Easy CSV Format**: Simple two-column CSV with file names and player names
- **Feedback**: Real-time feedback showing how many photos were updated

### For Customers
- **Filter by Player**: Use the "Filter by player name..." search box to find all photos of a specific player
- **Search Across Albums**: Use the main search to find photos by player name across all albums
- **View on Cards**: Player names are displayed on photo cards with a 👤 emoji indicator

## Backend Implementation

### Database Changes
- Added `player_names` column to `photos` table (TEXT type)
- Automatically migrates existing databases

### New API Endpoint
**POST** `/api/photos/album/:albumId/upload-players`
- Accepts multipart/form-data with CSV file
- Parses CSV and matches file names to photos
- Updates photo records with player names
- Returns success/failure counts

### Updated GET Endpoints
**GET** `/api/photos/album/:albumId?playerName=John`
- New optional `playerName` query parameter
- Filters photos to only those with matching player names
- Case-insensitive matching

**GET** `/api/photos/search?q=John`
- Search now includes player names
- Finds photos by player name in addition to filename/metadata

## Frontend Implementation

### AlbumDetails.tsx
- New "Filter by player name..." input field
- "📋 Upload Player Names" button
- CSV upload dialog with example format
- Real-time upload feedback
- Photos automatically reload after CSV upload

### PhotoCard.tsx
- Displays player names when available
- Shows "👤 [Player Name]" with orange text

### photoService.ts
- New `uploadPlayerNamesCsv()` method
- Updated `getPhotosByAlbum()` to support playerName parameter

### exifService.ts
- Updated `searchInMetadata()` to include player names

## Usage Example

### Step 1: Prepare CSV File
Create a file named `team_photos.csv`:
```csv
file_name,player_name
game_001.jpg,Alex Thompson
game_002.jpg,Alex Thompson
game_003.jpg,Emma Williams
game_004.jpg,Michael Chen
game_005.jpg,Emma Williams
```

### Step 2: Upload
1. Go to Album Details page
2. Click "📋 Upload Player Names"
3. Select the CSV file
4. Wait for success message showing "Updated X of Y photos"

### Step 3: Search
1. Use "Filter by player name..." to find all photos of a player
2. Or use main search (works across all albums)

## Error Handling
- **Missing CSV**: Returns 400 error
- **Parse Error**: Shows friendly error message
- **No Matches**: Updates 0 photos (file names don't match)
- **Partial Matches**: Updates only matching photos (useful for large uploads)

## Technical Details

### CSV Parsing
- Uses `csv-parser` npm package
- Flexible header matching (case-insensitive, accepts variations)
- Trims whitespace from values
- Handles headers in any order

### Database Schema
```sql
ALTER TABLE photos ADD COLUMN player_names TEXT;
```

### Query Examples
```sql
-- Filter photos by player name
SELECT * FROM photos WHERE album_id = ? AND player_names LIKE ?;

-- Search across all columns including player names
SELECT * FROM photos WHERE 
  file_name LIKE ? OR 
  description LIKE ? OR 
  player_names LIKE ? OR 
  metadata LIKE ?;
```

## Future Enhancements
- Multiple players per photo (comma-separated)
- Duplicate file name handling
- Batch operations on multiple albums
- Player name autocompletion
- Player statistics (most photographed, etc.)
