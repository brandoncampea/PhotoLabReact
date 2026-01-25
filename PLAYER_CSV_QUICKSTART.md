# Quick Start: Player Names CSV Upload Feature

## 🎯 What It Does
Allows you to tag photos with player names via CSV, making them searchable by customer.

## ⚡ Quick Steps

### Step 1: Create Your CSV File
Create a file named `players.csv` with this format:
```
file_name,player_name
photo001.jpg,John Smith
photo002.jpg,Jane Doe
photo003.jpg,Michael Johnson
```

**Important:** The first column must match your actual photo filenames exactly!

### Step 2: Upload to Album
1. Open an album in the PhotoLab app
2. Click the **"📋 Upload Player Names"** button
3. Select your CSV file
4. Wait for the green success message showing "Updated X of Y photos"

### Step 3: Find Photos by Player
Customers can now:
- **Use "Filter by player name..."** field to find photos of a specific player
- **Use search** to find player names across all albums

## 📋 CSV Format Details

### Valid Column Headers (pick ONE for each column)
**First column (photo names):**
- `file_name` ✅
- `fileName` ✅
- `filename` ✅
- `File Name` ✅

**Second column (player names):**
- `player_name` ✅
- `playerName` ✅
- `Player Name` ✅

### Example Files
Use this template: https://yourapp.com/player-names-template.csv

Or create your own:
```csv
file_name,player_name
game_photo_1.jpg,Alex Thompson
game_photo_2.jpg,Alex Thompson
game_photo_3.jpg,Emma Williams
game_photo_4.jpg,Michael Chen
game_photo_5.jpg,Emma Williams
```

## ✨ Features

✅ Multiple players possible (upload again to update)
✅ Case-insensitive search
✅ Partial filename matching (updates matching photos)
✅ Instant feedback showing how many photos were tagged
✅ Player names display on each photo card with 👤 emoji
✅ Works across all albums

## ❓ Troubleshooting

**"Updated 0 of X photos"**
- Check that file names in CSV match exactly (including extension)
- File names are case-sensitive on some systems

**Player names not showing**
- Make sure your CSV uploaded successfully (green message appeared)
- Try refreshing the page
- Check that file names match

**CSV won't upload**
- Must be .csv file format
- Check column headers match examples above
- Make sure file isn't too large (under 10MB)

## 📝 Tips

- You can upload multiple times to add/update player names
- Whitespace is automatically trimmed
- One player name per photo (multiple players: use separate upload)
- File names must match exactly - copy/paste from file list if unsure

## 🚀 Advanced

### API Access (Developers)
```bash
# Upload CSV
curl -X POST http://api.yourapp.com/photos/album/1/upload-players \
  -F "csv=@players.csv"

# Get photos filtered by player
curl http://api.yourapp.com/photos/album/1?playerName=John

# Search all photos by player
curl http://api.yourapp.com/photos/search?q=John
```

### What Happens Behind the Scenes
1. Your CSV is parsed on the server
2. File names are matched to photos in the album
3. Player names are stored in the database
4. Photos are instantly tagged and searchable

---

Need help? Check the [full documentation](./PLAYER_TAGS_FEATURE.md)
