// Centralized price lookup utility for studio price lists

export interface PriceListItem {
  productId: any;
  sizeId: any;
  price: number;
}

/**
 * Looks up the retail price for a given productId and sizeId from the studio price list.
 * Falls back to 0 if not found.
 */
export function getRetailPrice(productId: any, sizeId: any, priceListItems: PriceListItem[]): number {
  const item = priceListItems.find(
    (i) => String(i.productId) === String(productId) && String(i.sizeId) === String(sizeId)
  );
  return item ? Number(item.price) : 0;
}
