
import React, { useState, useMemo, useEffect, ChangeEvent } from 'react';
import { whccService } from '../services/whccService';


type Product = {
  Id?: number;
  Name?: string;
  Price?: number;
  // ...other WHCC fields
  [key: string]: any;
};

type SelectedMap = Record<string, boolean>;
type ExpandedMap = Record<string, boolean>;


function formatLabel(product: Product): string {
  // Use WHCC API fields
  const name = product.Name || '';
  const sizeMatch = name.match(/\d+x\d+(x\d+)?|\d+oz/);
  const size = sizeMatch ? sizeMatch[0] : '';
  let base = name.replace(size, '').replace(/\(.*\)/, '').trim();
  base = base.replace(/[-()]+$/, '').trim();
  const price = product.Price;
  return `${base}${size ? ' (' + size + ')' : ''}${price ? ` ($${price.toFixed(2)})` : ''}`;
}

const WhccProductImport: React.FC = () => {

  const [search, setSearch] = useState<string>('');
  const [selected, setSelected] = useState<SelectedMap>({});
  const [expanded, setExpanded] = useState<ExpandedMap>({});
  const [groupedProducts, setGroupedProducts] = useState<Record<string, Product[]>>({});

  useEffect(() => {
    whccService.getProductCatalog().then((data) => {
      // Parse new WHCC catalog structure: flatten all products from all categories
      if (data && Array.isArray(data.Categories)) {
        const allProducts: any[] = [];
        data.Categories.forEach((cat: any) => {
          if (Array.isArray(cat.ProductList)) {
            cat.ProductList.forEach((prod: any) => {
              allProducts.push({ ...prod, CategoryName: cat.Name });
            });
          }
        });
        // Group by category for UI
        const grouped: { [cat: string]: any[] } = {};
        allProducts.forEach((prod) => {
          if (!grouped[prod.CategoryName]) grouped[prod.CategoryName] = [];
          grouped[prod.CategoryName].push(prod);
        });
        setGroupedProducts(grouped);
      } else {
        setGroupedProducts({});
      }
    });
  }, []);

  const filtered = useMemo(() => {
    const result: Record<string, Product[]> = {};
    for (const [cat, prods] of Object.entries(groupedProducts)) {
      const filteredProds = (prods as Product[]).filter((p: Product) =>
        formatLabel(p).toLowerCase().includes(search.toLowerCase())
      );
      if (filteredProds.length) result[cat] = filteredProds;
    }
    return result;
  }, [search, groupedProducts]);

  const toggleAll = (cat: string, checked: boolean) => {
    setSelected(sel => {
      const copy = { ...sel };
      for (const prod of groupedProducts[cat] as Product[]) {
        const key = prod.Id?.toString() || prod.ProductUID?.toString();
        if (key) copy[key] = checked;
      }
      return copy;
    });
  };

  return (
    <div style={{ maxWidth: 500, margin: '0 auto', background: '#222', color: '#fff', borderRadius: 12, padding: 24 }}>
      <h2 style={{ textAlign: 'center', marginBottom: 16 }}>Import Products from WHCC</h2>
      <input
        type="text"
        placeholder="Search products..."
        value={search}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
        style={{ width: '100%', marginBottom: 16, padding: 8, borderRadius: 6, border: '1px solid #444', background: '#111', color: '#fff' }}
      />
      {Object.entries(filtered).map(([cat, prods]) => (
        <div key={cat} style={{ marginBottom: 16, background: '#181818', borderRadius: 8, padding: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => setExpanded(e => ({ ...e, [cat]: !e[cat] }))}>
            <strong style={{ flex: 1 }}>{cat}</strong>
            <button style={{ marginLeft: 8 }} onClick={e => { e.stopPropagation(); toggleAll(cat, true); }}>Select All</button>
            <button style={{ marginLeft: 4 }} onClick={e => { e.stopPropagation(); toggleAll(cat, false); }}>Deselect All</button>
            <span style={{ marginLeft: 8 }}>{expanded[cat] ? '▼' : '▶'}</span>
          </div>
          {expanded[cat] && (
            <div style={{ marginTop: 8 }}>
              {(prods as Product[]).map((prod: Product) => {
                const key = prod.Id?.toString() || prod.ProductUID?.toString();
                return key ? (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', marginBottom: 4, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!selected[key]}
                      onChange={e => setSelected(sel => ({ ...sel, [key]: e.target.checked }))}
                      style={{ marginRight: 8 }}
                    />
                    <span>{formatLabel(prod)}</span>
                  </label>
                ) : null;
              })}
            </div>
          )}
        </div>
      ))}
      <div style={{ position: 'sticky', bottom: 0, background: '#222', padding: 12, borderRadius: 8, textAlign: 'center', marginTop: 16 }}>
        <button style={{ background: '#a78bfa', color: '#222', border: 'none', borderRadius: 6, padding: '10px 24px', fontWeight: 600, fontSize: 16 }}>
          Review & Import ({Object.values(selected).filter(Boolean).length})
        </button>
      </div>
    </div>
  );
};

export default WhccProductImport;
