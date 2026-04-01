import csv
import json
import re

CATEGORY_MAP = [
    (re.compile(r'print', re.I), 'Prints'),
    (re.compile(r'canvas', re.I), 'Canvas'),
    (re.compile(r'poster', re.I), 'Posters'),
    (re.compile(r'frame', re.I), 'Frames'),
    (re.compile(r'mug|coaster|pillow|blanket|phone case', re.I), 'Gifts'),
    (re.compile(r'book', re.I), 'Books'),
    (re.compile(r'calendar', re.I), 'Calendars'),
    (re.compile(r'mount|foamboard|standout|bamboo|wood|acrylic|metal', re.I), 'Wall Art & Mounting'),
    (re.compile(r'card', re.I), 'Cards'),
    (re.compile(r'.*', re.I), 'Other'),
]

def categorize(name):
    for regex, cat in CATEGORY_MAP:
        if regex.search(name):
            return cat
    return 'Other'

products_by_category = {}
with open('whcc_all_products_full.csv', newline='') as infile:
    reader = csv.DictReader(infile)
    for row in reader:
        name = row['Product Name/Size']
        try:
            price = float(row['Price'])
        except Exception:
            continue
        cat = categorize(name)
        prod = {
            'code': row['Product Code'],
            'name': name,
            'price': price,
            'sheet': row['Sheet']
        }
        products_by_category.setdefault(cat, []).append(prod)

with open('whcc_products_grouped.json', 'w') as out:
    json.dump(products_by_category, out, indent=2)
