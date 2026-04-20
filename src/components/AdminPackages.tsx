
// Utility to normalize product names for grouping
const baseProductName = (name: string) => {
  return String(name || 'Unknown Product')
    .replace(/\s+\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)?\s*$/i, '')
    .replace(/\s*[-–]\s*\d+(?:\.\d+)?x\d+(?:\.\d+)?\s*$/i, '')
    .replace(/\s*\(\d+(?:\.\d+)?x\d+(?:\.\d+)?\)\s*$/i, '')
    .trim() || String(name || 'Unknown Product');
};

import React, { useState } from 'react';



import { Product, PackageItem } from '../types';

interface AdminPackagesProps {
  products: Product[];
}

const AdminPackages: React.FC<AdminPackagesProps> = ({ products }) => {
    // MISSING STATE AND HANDLERS
    const [editingId, setEditingId] = useState<number | null>(null);
    const [productFilter, setProductFilter] = useState('');
    const [sizeFilter, setSizeFilter] = useState('');
    const [catCollapsed, setCatCollapsed] = useState<Record<string, boolean>>({});
    const [prodCollapsed, setProdCollapsed] = useState<Record<string, boolean>>({});

    // Handler stubs
    const handleAcceptSuggestion = () => {};
    const handleQuantityChange = () => {};
    const handleSave = () => {};
    const handleSelectItem = () => {};
  // State for package form
  const [form, setForm] = useState<{ name: string; price: number; items: PackageItem[] }>({ name: '', price: 0, items: [] });
  // Add missing state and handlers for suggestions and acceptingSuggestion
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [acceptingSuggestion] = useState(false);
  const [suggestedPackages] = useState<any[]>([]); // TODO: Use correct type
  // Add getPackageFinancials stub if missing
  // Remove unused getPackageFinancials stub

  return (
    <div>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, marginRight: 16 }}>Suggested Packages</h2>
          <button
            style={{
              background: showSuggestions ? '#7be495' : '#23242a',
              color: showSuggestions ? '#181a20' : '#b0b0b0',
              border: 'none',
              borderRadius: 6,
              padding: '6px 16px',
              fontWeight: 600,
              fontSize: 15,
              cursor: 'pointer',
              marginLeft: 8
            }}
            onClick={() => setShowSuggestions(s => !s)}
          >
            {showSuggestions ? 'Hide' : 'Show'}
          </button>
        </div>
        {showSuggestions && suggestedPackages.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginBottom: 24 }}>
            {suggestedPackages.map((pkg, idx) => {
              // Removed unused profit, savings calculation
              return (
                <div
                  key={idx}
                  style={{
                    border: '1.5px solid #3a3a3a',
                    borderRadius: 12,
                    padding: 20,
                    minWidth: 260,
                    background: '#181a20',
                    boxShadow: '0 2px 8px 0 #0002',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    transition: 'box-shadow 0.2s',
                    opacity: acceptingSuggestion ? 0.5 : 1,
                    pointerEvents: acceptingSuggestion ? 'none' : 'auto',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 19, color: '#fff', marginBottom: 6 }}>{pkg.name}</div>
                  <div style={{ margin: '6px 0 10px 0', fontSize: 16, color: '#e0e0e0' }}>Price: <b>${pkg.packagePrice.toFixed(2)}</b></div>
                  <ul style={{ margin: 0, paddingLeft: 18, color: '#b0b0b0', fontSize: 15, marginBottom: 8 }}>
                    {(pkg.items as PackageItem[]).filter(Boolean).map((item, i) => {
                      const product = products.find(p => p.id === item.productId);
                      const size = product?.sizes?.find(s => s.id === item.productSizeId);
                      return (
                        <li key={i}>
                          {item.quantity}x {product?.name} {size?.name ? `(${size.name})` : ''}
                        </li>
                      );
                    })}
                  </ul>
                  {/* Profit and savings display removed */}
                  <button
                    style={{
                      marginTop: 18,
                      padding: '10px 0',
                      background: 'linear-gradient(90deg, #4fc3f7 0%, #7be495 100%)',
                      color: '#181a20',
                      border: 'none',
                      borderRadius: 8,
                      fontWeight: 700,
                      fontSize: 16,
                      cursor: 'pointer',
                      boxShadow: '0 1px 4px #0002',
                      transition: 'background 0.2s',
                    }}
                    onClick={handleAcceptSuggestion}
                    disabled={acceptingSuggestion}
                  >
                    {acceptingSuggestion ? 'Adding...' : 'Add Package'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Saved Packages section moved above Create Package */}
        <h2 style={{ marginTop: 32, marginBottom: 12 }}>Saved Packages</h2>
        {/* ...existing Saved Packages table rendering... */}

        <h2 style={{ marginTop: 32 }}>{editingId ? 'Edit Package' : 'Create Package'}</h2>
        <div className="admin-orders-card" style={{ marginBottom: 24 }}>
          {/* Cart-like list of selected products, cost/profit display, and Save button */}
          {form.items.length > 0 && (() => {
            // Removed unused cost, profit, savings calculation
            return (
              <div style={{
                background: '#23242a',
                borderRadius: 8,
                padding: '12px 16px',
                margin: '16px 0 0 0',
                boxShadow: '0 1px 4px #0002',
                maxWidth: 600
              }}>
                <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6, color: '#fff' }}>Selected Items</div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {form.items.map((item, idx) => {
                    const product = products.find(p => p.id === item.productId);
                    const size = product?.sizes?.find(s => s.id === item.productSizeId);
                    return (
                      <li key={idx} style={{ display: 'flex', alignItems: 'center', marginBottom: 4, color: '#e0e0e0' }}>
                        {/* Quantity controls */}
                        <div style={{ display: 'flex', alignItems: 'center', minWidth: 90 }}>
                          <button
                            aria-label="Decrease quantity"
                            onClick={() => {
                              if (item.quantity > 1) handleQuantityChange();
                            }}
                            style={{ width: 28, height: 28, fontSize: 18, marginRight: 4 }}
                            type="button"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={handleQuantityChange}
                            style={{ width: 40, textAlign: 'center', margin: '0 4px' }}
                          />
                          <button
                            aria-label="Increase quantity"
                            onClick={handleQuantityChange}
                            style={{ width: 28, height: 28, fontSize: 18, marginLeft: 4 }}
                            type="button"
                          >
                            +
                          </button>
                        </div>
                        <span style={{ flex: 1 }}>{product?.name} {size?.name ? `(${size.name})` : ''}</span>
                      </li>
                    );
                  })}
                </ul>
                {/* Package Cost/Profit display removed */}
                {/* Save Package button below selected items */}
                <button
                  style={{ marginTop: 18, padding: '10px 24px', fontSize: 16, fontWeight: 600, borderRadius: 6, background: '#fff', color: '#181a20', border: 'none', cursor: 'pointer', boxShadow: '0 1px 4px #0002' }}
                  onClick={handleSave}
                  disabled={form.items.length === 0 || !form.name.trim()}
                >
                  {editingId ? 'Update Package' : 'Save Package'}
                </button>
                {editingId && <button onClick={() => { setEditingId(null); setForm({ name: '', price: 0, items: [] }); }} style={{ marginLeft: 12 }}>Cancel</button>}
              </div>
            );
          })()}

        <div style={{ marginBottom: 8 }}>
          <label style={{ marginRight: 8 }}>Package Name:</label>
          <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ width: 200, marginRight: 16 }} />
          <label style={{ marginRight: 8 }}>Package Price:</label>
          <input type="number" value={form.price} min={0} step={0.01} onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))} style={{ width: 100 }} />
        </div>
        {/* Filters */}
        <div className="admin-price-lists-filters-row" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <label style={{ color: '#aaa' }}>Filter:</label>
          <input
            type="text"
            placeholder="Filter by product name"
            value={productFilter}
            onChange={e => setProductFilter(e.target.value)}
            style={{ minWidth: 180 }}
          />
          <input
            type="text"
            placeholder="Filter by size name"
            value={sizeFilter}
            onChange={e => setSizeFilter(e.target.value)}
            style={{ minWidth: 140 }}
          />
        </div>
        {/* Expand/Contract Controls */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
          <button className="btn btn-secondary" onClick={() => { setCatCollapsed({}); setProdCollapsed({}); }}>Expand All</button>
          <button className="btn btn-secondary" onClick={() => {
            // Collapse all using actual categories and products
            const grouped: Record<string, Record<string, any[]>> = {};
            products.forEach(product => {
              const cat = product.category || 'Uncategorized';
              if (!grouped[cat]) grouped[cat] = {};
              if (!grouped[cat][product.name]) grouped[cat][product.name] = [];
            });
            const nextCats: Record<string, boolean> = {};
            const nextProds: Record<string, boolean> = {};
            Object.keys(grouped).forEach(cat => {
              nextCats[cat] = true;
              Object.keys(grouped[cat]).forEach(prod => {
                nextProds[cat + '||' + prod] = true;
              });
            });
            setCatCollapsed(nextCats);
            setProdCollapsed(nextProds);
          }}>Contract All</button>
        </div>
        <div className="admin-whcc-table-container" style={{ marginBottom: 8 }}>
          <table className="admin-whcc-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Select</th>
                <th>Product</th>
                <th>Size</th>
                <th>Quantity</th>
                <th>Base Cost</th>
                <th>Markup Price</th>
              </tr>
            </thead>
            <tbody>
              {/* Group by category, then product, then size */}
              {(() => {
                // Build a grouped structure: { [category]: { [baseProductName]: [sizes...] } }
                const grouped: Record<string, Record<string, any[]>> = {};
                products.forEach(product => {
                  const cat = product.category || 'Uncategorized';
                  const baseName = baseProductName(product.name);
                  if (!grouped[cat]) grouped[cat] = {};
                  if (!grouped[cat][baseName]) grouped[cat][baseName] = [];
                  const productFilterText = productFilter.toLowerCase();
                  product.sizes.forEach((size: any) => {
                    // Match filter against both the full product name and the base product name
                    const matchesProduct = product.name.toLowerCase().includes(productFilterText) || baseName.toLowerCase().includes(productFilterText);
                    const matchesSize = size.name.toLowerCase().includes(sizeFilter.toLowerCase());
                    if (matchesProduct && matchesSize) {
                      grouped[cat][baseName].push({
                        ...size,
                        productId: product.id,
                        productName: product.name,
                      });
                    }
                  });
                });
                // Render grouped rows
                return Object.entries(grouped).map(([cat, productsByName]) => (
                  <React.Fragment key={cat}>
                    <tr className="admin-whcc-category-row" style={{ background: '#171428', color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', borderTop: '2px solid #2a2740' }}
                      onClick={() => setCatCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }))}>
                      <td colSpan={5} style={{ padding: '8px 10px' }}>
                        <span style={{ marginRight: 8 }}>{catCollapsed?.[cat] ? '▶' : '▼'}</span>
                        {cat}
                      </td>
                    </tr>
                    {!catCollapsed?.[cat] && Object.entries(productsByName).map(([prodName, sizes]) => (
                      <React.Fragment key={prodName}>
                        <tr className="admin-whcc-product-header" style={{ background: '#23233a', color: '#cbd5e1', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}
                          onClick={() => setProdCollapsed(prev => ({ ...prev, [cat + '||' + prodName]: !prev[cat + '||' + prodName] }))}>
                          <td colSpan={5} style={{ padding: '6px 18px' }}>
                            <span style={{ marginRight: 8 }}>{prodCollapsed?.[cat + '||' + prodName] ? '▶' : '▼'}</span>
                            {prodName}
                          </td>
                        </tr>
                        {!prodCollapsed?.[cat + '||' + prodName] && sizes.map((size: any) => {
                          const checked = form.items.some(item => item.productId === size.productId && item.productSizeId === size.id);
                          const quantity = form.items.find(item => item.productId === size.productId && item.productSizeId === size.id)?.quantity || 1;
                          // Use cost property for PriceListProductSize, fallback to 0
                          // Removed unused baseCost and retailPrice calculations
                          return (
                            <tr key={size.productId + '-' + size.id} className="admin-whcc-row">
                              <td>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={handleSelectItem}
                                />
                              </td>
                              <td>{size.productName}</td>
                              <td>{size.name}</td>
                              <td>
                                <input
                                  type="number"
                                  min={1}
                                  value={quantity}
                                  disabled={!checked}
                                  onChange={handleQuantityChange}
                                  style={{ width: 60 }}
                                />
                              </td>
                              <td>-</td>
                              <td>-</td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                ));
              })()}
            </tbody>
          </table>
        </div>
        {/* Cart-like list of selected products and cost/profit display */}
        {/* Cart and cost/profit display removed for build cleanup */}
      </div>
    </div>
  );
}

export default AdminPackages;

