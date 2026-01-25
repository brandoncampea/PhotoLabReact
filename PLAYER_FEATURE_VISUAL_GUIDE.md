# Player Names Feature - Visual Guide

## 🎬 User Flow

### Album Owner Workflow
```
1. Navigate to Album Details Page
            ↓
2. Click "📋 Upload Player Names" Button
            ↓
3. Upload CSV File (file_name, player_name)
            ↓
4. Server parses CSV and matches to photos
            ↓
5. Photos updated with player names
            ↓
6. See "✓ Updated X of Y photos" message
```

### Customer Workflow
```
1. Browse Album Details Page
            ↓
2. See Photos with 👤 Player Names
            ↓
3. Use "Filter by player name..." field
            ↓
4. Type player name (e.g., "John")
            ↓
5. Photos instantly filtered to matching players
            ↓
6. Click to view/order photos
```

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                      │
├─────────────────────────────────────────────────────────┤
│  AlbumDetails.tsx                                        │
│  ├── CSV Upload UI                                       │
│  │   ├── File Input                                      │
│  │   ├── Example Display                                 │
│  │   └── Feedback Messages                               │
│  ├── Player Filter Input                                 │
│  └── PhotoCard Display                                   │
│      └── Shows 👤 Player Names                           │
│                                                           │
│  photoService.ts                                         │
│  └── uploadPlayerNamesCsv()                              │
│  └── getPhotosByAlbum(albumId, playerName?)              │
│                                                           │
│  exifService.ts                                          │
│  └── searchInMetadata() [includes playerNames]           │
└─────────────────────────────────────────────────────────┘
                          │
                    Axios HTTP
                          │
                          ↓
┌─────────────────────────────────────────────────────────┐
│                    BACKEND (Node.js)                     │
├─────────────────────────────────────────────────────────┤
│  POST /api/photos/album/:id/upload-players              │
│  ├── Multer: Handle file upload                          │
│  ├── csv-parser: Parse CSV                               │
│  ├── Match filenames to photos                           │
│  └── Update database                                     │
│                                                           │
│  GET /api/photos/album/:id?playerName=...               │
│  └── Filter by player_names column                       │
│                                                           │
│  GET /api/photos/search?q=...                           │
│  └── Search includes player_names column                 │
└─────────────────────────────────────────────────────────┘
                          │
                        SQL
                          │
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   DATABASE (SQLite)                      │
├─────────────────────────────────────────────────────────┤
│  photos table                                            │
│  ├── id (PK)                                             │
│  ├── album_id (FK)                                       │
│  ├── file_name                                           │
│  ├── thumbnail_url                                       │
│  ├── full_image_url                                      │
│  ├── description                                         │
│  ├── metadata                                            │
│  └── player_names  ← NEW COLUMN                          │
│  └── created_at                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 📊 CSV Processing Flow

```
CSV File (file_name, player_name)
        │
        ↓ (uploaded to backend)
        │
multer middleware (receives file)
        │
        ↓ (stream to disk)
        │
csv-parser (parses rows)
        │
        ↓ (build mapping object)
        │
playerMapping = {
  "photo001.jpg": "John Smith",
  "photo002.jpg": "Jane Doe",
  ...
}
        │
        ↓ (iterate photos in album)
        │
For each photo in photos:
  if (photo.file_name in playerMapping):
    UPDATE photos SET player_names = playerMapping[file_name]
        │
        ↓
Database updated
        │
        ↓
Return { rowsParsed, photosUpdated, totalPhotos }
        │
        ↓
Frontend displays success message
        │
        ↓
Photos reloaded and displayed with player names
```

---

## 💾 Database Changes

### Migration Flow

```
Server Starts
    │
    ↓
database.js initDb()
    │
    ├─ CREATE TABLE photos (existing columns)
    │
    ├─ Try to ADD COLUMN player_names
    │   │
    │   ├─ If NOT EXISTS → Column added (first run)
    │   └─ If EXISTS → Skipped (already migrated)
    │
    └─ Database ready for feature
```

### Before & After

**Before:**
```sql
SELECT id, file_name, thumbnail_url FROM photos WHERE album_id = 1;
-- id | file_name      | thumbnail_url
-- 1  | photo001.jpg   | /uploads/...
-- 2  | photo002.jpg   | /uploads/...
```

**After:**
```sql
SELECT id, file_name, player_names FROM photos WHERE album_id = 1;
-- id | file_name      | player_names
-- 1  | photo001.jpg   | John Smith
-- 2  | photo002.jpg   | Jane Doe
```

---

## 🎨 UI Components

### Upload Dialog
```
┌─────────────────────────────────────────────────────┐
│ Upload Player Names CSV                             │
├─────────────────────────────────────────────────────┤
│ CSV should have columns: file_name, player_name     │
│                                                     │
│ [Choose File] [Upload...]                           │
│                                                     │
│ ✓ Updated 4 of 10 photos with player names          │
│                                                     │
│ Example CSV format:                                 │
│ file_name,player_name                               │
│ photo001.jpg,John Smith                             │
│ photo002.jpg,Jane Doe                               │
└─────────────────────────────────────────────────────┘
```

### Search Bar with Filter
```
┌─────────────────────────────────────────────────────┐
│ Search photos by name or metadata...                │
│                                                     │
│ Filter by player name...                            │
│                                                     │
│ Sort by: [File Name ▼]                              │
│          [📋 Upload Player Names]                   │
└─────────────────────────────────────────────────────┘
```

### Photo Card Display
```
┌──────────────────────┐
│                      │
│   [Photo Image]      │
│                      │
├──────────────────────┤
│ photo001.jpg         │
│ 👤 John Smith        │ ← New!
│ 📷 Canon EOS R5      │
│ 📅 Jan 15, 2026      │
└──────────────────────┘
```

---

## 🔄 Data Flow Examples

### Example 1: Upload CSV
```
User Action:
  [Upload] → players.csv

CSV Content:
  file_name,player_name
  photo001.jpg,John Smith
  photo002.jpg,Jane Doe

Backend Process:
  1. Parse CSV
  2. Find photos with matching filenames
  3. Update player_names column
  4. Return counts

Response:
  {
    message: "Player names uploaded successfully",
    rowsParsed: 2,
    photosUpdated: 2,
    totalPhotos: 2
  }

UI Shows:
  ✓ Updated 2 of 2 photos with player names
```

### Example 2: Filter by Player
```
User Action:
  Type "John" in player filter

Frontend Logic:
  filtered = photos.filter(photo =>
    photo.playerNames?.toLowerCase().includes("john")
  )

Result:
  Shows only photos with player names containing "John"
  [Photo: John Smith] [Photo: John Smith]

Backend Query (if querying API):
  GET /api/photos/album/1?playerName=John
  
  WHERE album_id = 1 AND player_names LIKE '%John%'
```

### Example 3: Global Search
```
User Action:
  Search "John" in main search bar

Frontend/Backend:
  SELECT * FROM photos
  WHERE file_name LIKE '%John%' 
     OR description LIKE '%John%'
     OR metadata LIKE '%John%'
     OR player_names LIKE '%John%'  ← New!

Results:
  • All photos matching "John" across all albums
  • Including those tagged as "John Smith"
  • Shows album name for context
```

---

## 🛠️ File Relationships

```
AlbumDetails.tsx
├── Imports photoService
│   └── uploadPlayerNamesCsv()
│       ↓
│       POST /api/photos/album/:id/upload-players
│       └── server/routes/photos.js
│           └── server/database.js
│
├── Imports exifService
│   └── searchInMetadata() [searches playerNames]
│
└── Renders PhotoCard
    └── src/components/PhotoCard.tsx
        └── Displays playerNames with 👤 emoji

Search.tsx
├── Uses exifService.searchInMetadata()
│   └── Searches including playerNames
│
└── Displays PhotoCard with playerNames
```

---

## 📦 Deployment Checklist

- ✅ Code complete and tested
- ✅ No breaking changes to existing features
- ✅ Database migration handles both new and existing DBs
- ✅ CSV parser dependency added to package.json
- ✅ Frontend builds without errors
- ✅ TypeScript types updated
- ✅ Documentation complete
- ✅ Backward compatible (existing photos still work)

**To Deploy:**
1. Commit: `git add -A && git commit -m "Add player names CSV upload feature"`
2. Push to production
3. Run `npm install` for csv-parser
4. No manual DB migration needed (automatic on startup)

---

## 🎯 Key Files Modified

| Component | File | Change |
|-----------|------|--------|
| **Database** | server/database.js | +player_names column migration |
| **Backend API** | server/routes/photos.js | +CSV upload endpoint, enhanced GET |
| **Dependencies** | package.json | +csv-parser |
| **Types** | src/types/index.ts | +playerNames to Photo |
| **Services** | src/services/photoService.ts | +uploadPlayerNamesCsv(), updated getPhotosByAlbum |
| **Search** | src/services/exifService.ts | Updated searchInMetadata |
| **Display** | src/components/PhotoCard.tsx | Display playerNames with 👤 |
| **Main UI** | src/pages/AlbumDetails.tsx | +CSV upload UI, +player filter |
| **Docs** | README.md | Feature section, links to docs |

---

## 🚀 Feature Highlights

1. **User-Friendly**
   - Simple CSV format (2 columns)
   - Visual feedback during upload
   - Instant search results

2. **Developer-Friendly**
   - RESTful API endpoints
   - Well-documented code
   - Comprehensive documentation

3. **Scalable**
   - Database-backed storage
   - Indexed queries for performance
   - Ready for future enhancements

4. **Non-Breaking**
   - Existing features unaffected
   - Automatic database migration
   - Optional feature (works without it)

---

## 📚 Full Documentation

- **Quick Start:** PLAYER_CSV_QUICKSTART.md
- **Full Docs:** PLAYER_TAGS_FEATURE.md  
- **Implementation:** PLAYER_CSV_IMPLEMENTATION.md
- **This Summary:** PLAYER_FEATURE_SUMMARY.md
- **CSV Template:** public/player-names-template.csv
