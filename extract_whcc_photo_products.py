import openpyxl
import csv

wb = openpyxl.load_workbook('2024 WHCC List Pricing.xlsx')
ws = wb['Photo']

with open('whcc_photo_products_full.csv', 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['Product Code', 'Product Name/Size', 'Price'])
    for row in ws.iter_rows(min_row=2):
        code, name, price = row[0].value, row[1].value, row[2].value
        if code and name and price:
            writer.writerow([code, name.strip(), price])
