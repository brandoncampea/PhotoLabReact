import csv

# Read all products from the full CSV
with open('whcc_all_products_full.csv', newline='') as infile:
    reader = csv.DictReader(infile)
    products = [row for row in reader if row['Product Name/Size'] and row['Price']]

# Format for user-friendly display (e.g., "8x10 Print (8x10) - $1.45")
def format_product(row):
    # Try to extract size from the name (e.g., "8x10"), fallback to code
    import re
    name = row['Product Name/Size']
    try:
        price = float(row['Price'])
    except Exception:
        return None
    # Find size in parentheses or at end
    size_match = re.search(r'(\d+x\d+|\d+oz|\d+x\d+x\d+)', name)
    size = size_match.group(0) if size_match else ''
    # Clean up name for display
    base = name.replace('Photo Print', 'Print').replace('Photo ', '').replace('Print Print', 'Print').strip()
    # Remove duplicate size in name if present
    if size and size in base:
        base = base.replace(size, '').strip()
    # Remove trailing/leading punctuation and whitespace
    base = base.strip(' -()')
    # Compose label
    label = f"{base} ({size}) - ${price:.2f}" if size else f"{base} - ${price:.2f}"
    return label

# Deduplicate and sort for user-friendly list
labels = sorted(set(l for l in (format_product(row) for row in products) if l))

# Write to a new file for review
with open('whcc_products_user_friendly.txt', 'w') as out:
    for label in labels:
        out.write(f"{label}\n")
