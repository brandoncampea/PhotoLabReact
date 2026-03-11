import os

FILES = [
    "src/pages/admin/AdminAnalytics.tsx",
    "src/pages/admin/AdminOrders.tsx",
    "src/pages/admin/AdminProfile.tsx",
    "src/pages/admin/AdminShipping.tsx",
    "src/pages/admin/AdminStripe.tsx",
    "src/pages/admin/AdminStudioAdmins.tsx",
    "src/pages/admin/AdminWhccConfig.tsx",
    "src/pages/admin/AdminMpixConfig.tsx",
    "src/pages/admin/AdminPhotos.tsx",
    "src/pages/admin/AdminUsers.tsx",
    "src/pages/admin/AdminWatermarks.tsx",
    "src/pages/admin/AdminPackages.tsx",
    "src/pages/admin/AdminDiscountCodes.tsx",
    "src/components/AdminMpixImport.tsx",
    "src/components/AdminWhccImport.tsx",
]

REPLACEMENTS = [
    ("color: '#666'", "color: 'var(--text-secondary)'"),
    ("color: '#999'", "color: 'var(--text-secondary)'"),
    ("color: '#888'", "color: 'var(--text-secondary)'"),
    ("color: '#555'", "color: 'var(--text-secondary)'"),
    ("color: '#333'", "color: 'var(--text-primary)'"),
    ("backgroundColor: '#f5f5f5'", "backgroundColor: 'var(--bg-tertiary)'"),
    ("backgroundColor: '#f8f9fa'", "backgroundColor: 'var(--bg-tertiary)'"),
    ("backgroundColor: '#f9f9f9'", "backgroundColor: 'var(--bg-tertiary)'"),
    ("backgroundColor: '#f0f0f0'", "backgroundColor: 'var(--bg-tertiary)'"),
    ("backgroundColor: 'white'", "backgroundColor: 'var(--bg-primary)'"),
    ("backgroundColor: '#fff'", "backgroundColor: 'var(--bg-primary)'"),
    ("border: '1px solid #ddd'", "border: '1px solid var(--border-color)'"),
    ("border: '1px solid #dee2e6'", "border: '1px solid var(--border-color)'"),
    ("borderBottom: '1px solid #dee2e6'", "borderBottom: '1px solid var(--border-color)'"),
    ("borderBottom: '2px solid #dee2e6'", "borderBottom: '2px solid var(--border-color)'"),
    ("backgroundColor: '#e9ecef'", "backgroundColor: 'var(--bg-secondary)'"),
    ("color: '#c62828'", "color: 'var(--error-color)'"),
    ("color: '#d32f2f'", "color: 'var(--error-color)'"),
]

for filepath in FILES:
    if not os.path.exists(filepath):
        print(f"NOT FOUND: {filepath}")
        continue
    with open(filepath, 'r') as fh:
        content = fh.read()
    original = content
    for old, new in REPLACEMENTS:
        content = content.replace(old, new)
    if content != original:
        with open(filepath, 'w') as fh:
            fh.write(content)
        print(f"Updated: {filepath}")
    else:
        print(f"No change: {filepath}")
