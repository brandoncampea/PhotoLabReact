import { Product, Package, PackageItem, PriceListItem } from '../types';

export function buildSuggestedPackages(products: Product[], priceListId: number, priceListItems: PriceListItem[]): Omit<Package, 'id'>[] {
  return [
    {
      name: 'Print Starter Package',
      packagePrice: 19.99,
      description: '',
      isActive: true,
      createdDate: '',
      priceListId,
      items: [
        (() => {
          const pli = priceListItems.find((pli: PriceListItem) => {
            const product = products.find((p: Product) => p.id === pli.productId && p.name.toLowerCase().includes('8x10'));
            const size = product?.sizes?.find((s: any) => s.id === pli.productSizeId && s.name.toLowerCase().includes('8x10'));
            return product && size;
          });
          return pli ? { productId: pli.productId, productSizeId: pli.productSizeId, quantity: 1 } : null;
        })(),
        (() => {
          const pli = priceListItems.find((pli: PriceListItem) => {
            const product = products.find((p: Product) => p.id === pli.productId && p.name.toLowerCase().includes('4x5'));
            const size = product?.sizes?.find((s: any) => s.id === pli.productSizeId && s.name.toLowerCase().includes('4x5'));
            return product && size;
          });
          return pli ? { productId: pli.productId, productSizeId: pli.productSizeId, quantity: 2 } : null;
        })(),
      ].filter((i): i is PackageItem => !!i && !!i.productId && !!i.productSizeId),
    },
    {
      name: 'Digital & Print Combo',
      packagePrice: 29.99,
      description: '',
      isActive: true,
      createdDate: '',
      priceListId,
      items: [
        (() => {
          const pli = priceListItems.find((pli: PriceListItem) => {
            const product = products.find((p: Product) => p.id === pli.productId && p.name.toLowerCase().includes('8x10'));
            const size = product?.sizes?.find((s: any) => s.id === pli.productSizeId && s.name.toLowerCase().includes('8x10'));
            return product && size;
          });
          return pli ? { productId: pli.productId, productSizeId: pli.productSizeId, quantity: 1 } : null;
        })(),
        (() => {
          const pli = priceListItems.find((pli: PriceListItem) => {
            const product = products.find((p: Product) => p.id === pli.productId && p.name.toLowerCase().includes('digital'));
            const size = product?.sizes?.find((s: any) => s.id === pli.productSizeId && s.name.toLowerCase().includes('high'));
            return product && size;
          });
          return pli ? { productId: pli.productId, productSizeId: pli.productSizeId, quantity: 1 } : null;
        })(),
      ].filter((i): i is PackageItem => !!i && !!i.productId && !!i.productSizeId),
    },
    {
      name: 'Button & Magnet Pack',
      packagePrice: 17.99,
      description: '',
      isActive: true,
      createdDate: '',
      priceListId,
      items: [
        (() => {
          const pli = priceListItems.find((pli: PriceListItem) => {
            const product = products.find((p: Product) => p.id === pli.productId && p.name.toLowerCase().includes('button'));
            const size = product?.sizes?.find((s: any) => s.id === pli.productSizeId && s.name.toLowerCase().includes('button'));
            return product && size;
          });
          return pli ? { productId: pli.productId, productSizeId: pli.productSizeId, quantity: 1 } : null;
        })(),
        (() => {
          const pli = priceListItems.find((pli: PriceListItem) => {
            const product = products.find((p: Product) => p.id === pli.productId && p.name.toLowerCase().includes('magnet'));
            const size = product?.sizes?.find((s: any) => s.id === pli.productSizeId && s.name.toLowerCase().includes('magnet'));
            return product && size;
          });
          return pli ? { productId: pli.productId, productSizeId: pli.productSizeId, quantity: 1 } : null;
        })(),
      ].filter((i): i is PackageItem => !!i && !!i.productId && !!i.productSizeId),
    },
    {
      name: 'Keychain & Print Combo',
      packagePrice: 21.99,
      description: '',
      isActive: true,
      createdDate: '',
      priceListId,
      items: [
        (() => {
          const pli = priceListItems.find((pli: PriceListItem) => {
            const product = products.find((p: Product) => p.id === pli.productId && p.name.toLowerCase().includes('keychain'));
            const size = product?.sizes?.find((s: any) => s.id === pli.productSizeId && s.name.toLowerCase().includes('keychain'));
            return product && size;
          });
          return pli ? { productId: pli.productId, productSizeId: pli.productSizeId, quantity: 1 } : null;
        })(),
        (() => {
          const pli = priceListItems.find((pli: PriceListItem) => {
            const product = products.find((p: Product) => p.id === pli.productId && p.name.toLowerCase().includes('8x10'));
            const size = product?.sizes?.find((s: any) => s.id === pli.productSizeId && s.name.toLowerCase().includes('8x10'));
            return product && size;
          });
          return pli ? { productId: pli.productId, productSizeId: pli.productSizeId, quantity: 1 } : null;
        })(),
      ].filter((i): i is PackageItem => !!i && !!i.productId && !!i.productSizeId),
    },
    {
      name: 'Ultimate Value Pack',
      packagePrice: 34.99,
      description: '',
      isActive: true,
      createdDate: '',
      priceListId,
      items: [
        (() => {
          const pli = priceListItems.find((pli: PriceListItem) => {
            const product = products.find((p: Product) => p.id === pli.productId && p.name.toLowerCase().includes('8x10'));
            const size = product?.sizes?.find((s: any) => s.id === pli.productSizeId && s.name.toLowerCase().includes('8x10'));
            return product && size;
          });
          return pli ? { productId: pli.productId, productSizeId: pli.productSizeId, quantity: 2 } : null;
        })(),
        (() => {
          const pli = priceListItems.find((pli: PriceListItem) => {
            const product = products.find((p: Product) => p.id === pli.productId && p.name.toLowerCase().includes('4x5'));
            const size = product?.sizes?.find((s: any) => s.id === pli.productSizeId && s.name.toLowerCase().includes('4x5'));
            return product && size;
          });
          return pli ? { productId: pli.productId, productSizeId: pli.productSizeId, quantity: 2 } : null;
        })(),
        (() => {
          const pli = priceListItems.find((pli: PriceListItem) => {
            const product = products.find((p: Product) => p.id === pli.productId && p.name.toLowerCase().includes('button'));
            const size = product?.sizes?.find((s: any) => s.id === pli.productSizeId && s.name.toLowerCase().includes('button'));
            return product && size;
          });
          return pli ? { productId: pli.productId, productSizeId: pli.productSizeId, quantity: 1 } : null;
        })(),
        (() => {
          const pli = priceListItems.find((pli: PriceListItem) => {
            const product = products.find((p: Product) => p.id === pli.productId && p.name.toLowerCase().includes('magnet'));
            const size = product?.sizes?.find((s: any) => s.id === pli.productSizeId && s.name.toLowerCase().includes('magnet'));
            return product && size;
          });
          return pli ? { productId: pli.productId, productSizeId: pli.productSizeId, quantity: 1 } : null;
        })(),
      ].filter((i): i is PackageItem => !!i && !!i.productId && !!i.productSizeId),
    },
  ];
}
