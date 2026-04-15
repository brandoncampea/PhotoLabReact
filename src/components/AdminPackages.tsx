
// Utility to normalize product names for grouping
const baseProductName = (name: string) => {
  return String(name || 'Unknown Product')
    .replace(/\s+\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)?\s*$/i, '')
    .replace(/\s*[-–]\s*\d+(?:\.\d+)?x\d+(?:\.\d+)?\s*$/i, '')
    .replace(/\s*\(\d+(?:\.\d+)?x\d+(?:\.\d+)?\)\s*$/i, '')
    .trim() || String(name || 'Unknown Product');
};

import React, { useState, useEffect } from 'react';

import { getRetailPrice } from '../utils/priceList';

interface Product {
  id: any;
  name: string;
  sizes: any[];
}
// ...other interfaces...

const AdminPackages: React.FC<AdminPackagesProps> = ({ products, priceListId, priceListItems }) => {
    // Helper to calculate cost, retail, profit, and savings for a package
    function getPackageFinancials(pkg: Package | { name: string; price: number; items: PackageItem[] }) {
      let totalCost = 0;
      let totalRetail = 0;
      pkg.items.forEach((item: PackageItem) => {
        const product = products.find(p => p.id === item.productId);
        const size = product?.sizes?.find((s: any) => s.id === item.sizeId);
        const cost = size?.cost ?? 0;
        // Use centralized price lookup for retail
        const retail = getRetailPrice(item.productId, item.sizeId, priceListItems);
        const quantity = item.quantity || 1;
        totalCost += cost * quantity;
        totalRetail += retail * quantity;
      });
      // Studio profit = package price - total cost
      const profit = pkg.price - totalCost;
      // Customer savings = total retail - package price
      const savings = totalRetail - pkg.price;
      return { totalCost, totalRetail, profit, savings };
    }
  const [packages, setPackages] = useState<Package[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingPackages, setLoadingPackages] = useState(true);
  // Add state for expand/contract
  const [catCollapsed, setCatCollapsed] = useState<Record<string, boolean>>({});
  const [prodCollapsed, setProdCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const fetchPackages = async () => {
      setLoadingPackages(true);
      try {
        const pkgs = await packageService.getAll(priceListId);
        setPackages(Array.isArray(pkgs) ? pkgs : []);
      } catch {
        setPackages([]);
      } finally {
        setLoadingPackages(false);
      }
    };
    if (priceListId) fetchPackages();
  }, [priceListId]);

  // Sports packages: only prints (8x10, 4x5), digital images, buttons, magnets, keychains
  // Filter out fine art, framed, metal, and wood prints from suggestions
  const nonSpecialtyProducts = products.filter(p => {
    const name = p.name?.toLowerCase() || '';
    return !(
      name.includes('fine art') ||
      name.includes('framed') ||
      name.includes('metal') ||
      name.includes('wood')
    );
  });



  // Helper to find valid productId and productSizeId from priceListItems
  function findProductSize(productKeyword: string, sizeKeyword: string) {
    const norm = (str: string) => String(str || '').trim().toLowerCase();
    // Try to find a close match for both product and size, but skip fine art, framed, metal, and wood prints
    let pli = priceListItems.find(item => {
      const product = products.find(p => p.id === item.productId);
      const pname = product?.name?.toLowerCase() || '';
      if (!product || pname.includes('fine art') || pname.includes('framed') || pname.includes('metal') || pname.includes('wood')) return false;
      const size = product.sizes?.find(s => s.id === item.sizeId);
      return (
        size &&
        (norm(product.name).includes(norm(productKeyword)) || norm(productKeyword).includes(norm(product.name))) &&
        (norm(size.name).includes(norm(sizeKeyword)) || norm(sizeKeyword).includes(norm(size.name)))
      );
    });
    // If not found, try to match product only, and pick the first available size
    if (!pli) {
      pli = priceListItems.find(item => {
        const product = products.find(p => p.id === item.productId);
        const pname = product?.name?.toLowerCase() || '';
        if (!product || pname.includes('fine art') || pname.includes('framed') || pname.includes('metal') || pname.includes('wood')) return false;
        return (norm(product.name).includes(norm(productKeyword)) || norm(productKeyword).includes(norm(product.name)));
      });
    }
    // If still not found, try to match size only, and pick the first available product
    if (!pli) {
      pli = priceListItems.find(item => {
        const product = products.find(p => p.id === item.productId);
        const pname = product?.name?.toLowerCase() || '';
        if (!product || pname.includes('fine art') || pname.includes('framed') || pname.includes('metal') || pname.includes('wood')) return false;
        const size = product.sizes?.find(s => s.id === item.sizeId);
        return size && (norm(size.name).includes(norm(sizeKeyword)) || norm(sizeKeyword).includes(norm(size.name)));
      });
    }
    return pli
      ? { productId: pli.productId, sizeId: pli.sizeId }
      : { productId: null, sizeId: null };
  }

  const rawSuggestedPackages: Omit<Package, 'id'>[] = [
    {
      name: 'Print Starter Package',
      price: 19.99,
      items: [
        (() => { const { productId, sizeId } = findProductSize('8x10', '8x10'); return { productId, sizeId, quantity: 1 }; })(),
        (() => { const { productId, sizeId } = findProductSize('4x5', '4x5'); return { productId, sizeId, quantity: 2 }; })(),
      ].filter(i => i.productId && i.sizeId),
    },
    {
      name: 'Digital & Print Combo',
      price: 29.99,
      items: [
        (() => { const { productId, sizeId } = findProductSize('8x10', '8x10'); return { productId, sizeId, quantity: 1 }; })(),
        (() => { const { productId, sizeId } = findProductSize('Digital Image', 'High Resolution'); return { productId, sizeId, quantity: 1 }; })(),
      ].filter(i => i.productId && i.sizeId),
    },
    {
      name: 'Button & Magnet Pack',
      price: 17.99,
      items: [
        (() => { const { productId, sizeId } = findProductSize('Button', '3" Button'); return { productId, sizeId, quantity: 1 }; })(),
        (() => { const { productId, sizeId } = findProductSize('Acrylic Magnet', 'Acrylic Magnet'); return { productId, sizeId, quantity: 1 }; })(),
      ].filter(i => i.productId && i.sizeId),
    },
    {
      name: 'Keychain & Print Combo',
      price: 21.99,
      items: [
        (() => { const { productId, sizeId } = findProductSize('Keychain', 'Keychain'); return { productId, sizeId, quantity: 1 }; })(),
        (() => { const { productId, sizeId } = findProductSize('4x5', '4x5'); return { productId, sizeId, quantity: 2 }; })(),
      ].filter(i => i.productId && i.sizeId),
    },
    {
      name: 'Digital Deluxe',
      price: 34.99,
      items: [
        (() => { const { productId, sizeId } = findProductSize('Digital Image', 'High Resolution'); return { productId, sizeId, quantity: 2 }; })(),
      ].filter(i => i.productId && i.sizeId),
    },
  ];

  // DEBUG: Print all available product and size names
  const debugProductSizeList = products.map(p => ({
    product: p.name,
    sizes: p.sizes.map(s => s.name)
  }));

  // DEBUG: Print which product/size combos are matched for each suggested package
  const debugSuggestedMatches = rawSuggestedPackages.map(pkg => ({
    name: pkg.name,
    items: pkg.items.map(item => {
      const prod = products.find(p => p.id === item.productId);
      const size = prod?.sizes?.find(s => s.id === item.sizeId);
      return {
        productId: item.productId,
        sizeId: item.sizeId,
        product: prod?.name,
        size: size?.name
      };
    })
  }));

  // Adjust suggested package prices so customer savings is never negative
  // Only show packages with at least one item
  const suggestedPackages = rawSuggestedPackages
    .map(pkg => {
      const fin = getPackageFinancials(pkg);
      // 25% off total retail price, but never below total cost
      let targetPrice = fin.totalRetail * 0.75;
      targetPrice = Math.max(targetPrice, fin.totalCost + 0.01); // ensure profit > 0
      // Make price end in .95
      targetPrice = Math.floor(targetPrice) + 0.95;
      // If that would make it less than cost, bump to next .95 above cost
      if (targetPrice < fin.totalCost + 0.01) {
        targetPrice = Math.ceil(fin.totalCost) + 0.95;
      }
      targetPrice = Math.round(targetPrice * 100) / 100;
      return {
        ...pkg,
        price: targetPrice
      };
    })
    .filter(pkg => pkg.items && pkg.items.length > 0);

  // Show suggestions if there are products and no saved packages
  // Always allow showing suggestions, with a toggle
  useEffect(() => {
    if (products.length > 0) {
      setShowSuggestions(true);
    }
  }, [products]);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Helper to get cost for a package
  const getPackageCost = (pkg: Package | { name: string; price: number; items: PackageItem[] }) => {
    return pkg.items.reduce((sum, item) => {
      const product = products.find(p => p.id === item.productId);
      const size = product?.sizes.find((s: any) => s.id === item.sizeId);
      return sum + ((size?.cost || 0) * item.quantity);
    }, 0);
  };

  const getPackageProfit = (pkg: Package | { name: string; price: number; items: PackageItem[] }) => pkg.price - getPackageCost(pkg);

  const [form, setForm] = useState<{ name: string; price: number; items: PackageItem[] }>({ name: '', price: 0, items: [] });
  // Calculate cost and profit for the current form (create/edit package)
  const cost = form.items.length > 0 ? getPackageCost(form) : 0;
  const profit = form.items.length > 0 ? getPackageProfit(form) : 0;
  const [productFilter, setProductFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');

  // Form handlers
  const handleSelectItem = (productId: any, sizeId: any, checked: boolean) => {
    setForm(prev => {
      if (checked) {
        if (!prev.items.some(item => item.productId === productId && item.sizeId === sizeId)) {
          return { ...prev, items: [...prev.items, { productId, sizeId, quantity: 1 }] };
        }
        return prev;
      } else {
        return { ...prev, items: prev.items.filter(item => !(item.productId === productId && item.sizeId === sizeId)) };
      }
    });
  };

  const handleQuantityChange = (productId: any, sizeId: any, quantity: number) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.map(item =>
        item.productId === productId && item.sizeId === sizeId
          ? { ...item, quantity }
          : item
      ),
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try {
      const payload = {
        priceListId,
        name: form.name,
        description: '',
        packagePrice: form.price,
        items: form.items.map(item => ({
          productId: item.productId,
          productSizeId: item.sizeId,
          quantity: item.quantity
        })),
        isActive: true
      };
      if (editingId) {
        await packageService.update(Number(editingId), payload);
        const pkgs = await packageService.getAll(priceListId);
        setPackages(Array.isArray(pkgs) ? pkgs : []);
        setEditingId(null);
      } else {
        await packageService.create(payload);
        const pkgs = await packageService.getAll(priceListId);
        setPackages(Array.isArray(pkgs) ? pkgs : []);
      }
      setForm({ name: '', price: 0, items: [] });
    } catch {
      // handle error (optional)
    }
  };

  const handleEdit = (pkg: Package) => {
    setEditingId(pkg.id);
    setForm({ name: pkg.name, price: pkg.price, items: pkg.items });
  };

  const handleDelete = async (id: string) => {
    try {
      await packageService.delete(Number(id));
      const pkgs = await packageService.getAll(priceListId);
      setPackages(Array.isArray(pkgs) ? pkgs : []);
      if (editingId === id) setEditingId(null);
    } catch {
      // handle error (optional)
    }
  };

  const handleAcceptSuggestion = (pkg: Omit<Package, 'id'>) => {
    // Persist to backend and reload packages
    (async () => {
      try {
        await packageService.create({
          priceListId,
          name: pkg.name,
          description: '',
          packagePrice: pkg.price,
          items: pkg.items.map(item => ({
            productId: item.productId,
            productSizeId: item.sizeId,
            quantity: item.quantity
          })),
          isActive: true
        });
        const pkgs = await packageService.getAll(priceListId);
        setPackages(Array.isArray(pkgs) ? pkgs : []);
        setShowSuggestions(false);
      } catch {
        // Optionally show error
      }
    })();
  };

  const handleIgnoreSuggestions = () => setShowSuggestions(false);

  if (loadingPackages) {
    return <div>Loading packages...</div>;
  }
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
      {showSuggestions && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginBottom: 24 }}>
          {suggestedPackages.map((pkg, idx) => {
            const { profit, savings } = getPackageFinancials(pkg);
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
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 19, color: '#fff', marginBottom: 6 }}>{pkg.name}</div>
                <div style={{ margin: '6px 0 10px 0', fontSize: 16, color: '#e0e0e0' }}>Price: <b>${pkg.price.toFixed(2)}</b></div>
                <ul style={{ margin: 0, paddingLeft: 18, color: '#b0b0b0', fontSize: 15, marginBottom: 8 }}>
                  {pkg.items.map((item, i) => {
                    const product = products.find(p => p.id === item.productId);
                    const size = product?.sizes?.find(s => s.id === item.sizeId);
                    return (
                      <li key={i}>
                        {item.quantity}x {product?.name} {size?.name ? `(${size.name})` : ''}
                      </li>
                    );
                  })}
                </ul>
                <div style={{ fontSize: 14, margin: '8px 0 0 0', color: '#7be495', fontWeight: 500 }}>
                  Profit: <b>${profit.toFixed(2)}</b>
                  <span style={{ color: '#aaa', margin: '0 8px' }}>|</span>
                  <span style={{ color: '#4fc3f7' }}>Customer Savings: <b>${savings.toFixed(2)}</b></span>
                </div>
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
                  onClick={() => handleAcceptSuggestion(pkg)}
                >
                  Add Package
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
        {/* Show profit and savings for create/edit package */}
        {form.items.length > 0 && (() => {
          const { profit, savings } = getPackageFinancials(form);
          return (
            <div style={{ fontSize: 15, margin: '8px 0', color: '#1565c0' }}>
              Profit: <b>${profit.toFixed(2)}</b> &nbsp;|&nbsp; Customer Savings: <b>${savings.toFixed(2)}</b>
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
                          const checked = form.items.some(item => item.productId === size.productId && item.sizeId === size.id);
                          const quantity = form.items.find(item => item.productId === size.productId && item.sizeId === size.id)?.quantity || 1;
                          const baseCost = (size.cost || 0) * quantity;
                          // Use centralized price lookup for retail
                          const retailPrice = getRetailPrice(size.productId, size.id, priceListItems) * quantity;
                          return (
                            <tr key={size.productId + '-' + size.id} className="admin-whcc-row">
                              <td>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={e => handleSelectItem(size.productId, size.id, e.target.checked)}
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
                                  onChange={e => handleQuantityChange(size.productId, size.id, Math.max(1, Number(e.target.value)))}
                                  style={{ width: 60 }}
                                />
                              </td>
                              <td>{baseCost.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
                              <td>{retailPrice.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
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
        {form.items.length > 0 && (
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
                const size = product?.sizes?.find(s => s.id === item.sizeId);
                return (
                  <li key={idx} style={{ display: 'flex', alignItems: 'center', marginBottom: 4, color: '#e0e0e0' }}>
                    {/* Quantity controls */}
                    <div style={{ display: 'flex', alignItems: 'center', minWidth: 90 }}>
                      <button
                        aria-label="Decrease quantity"
                        onClick={() => {
                          if (item.quantity > 1) handleQuantityChange(item.productId, item.sizeId, item.quantity - 1);
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
                        onChange={e => {
                          const val = Math.max(1, parseInt(e.target.value) || 1);
                          handleQuantityChange(item.productId, item.sizeId, val);
                        }}
                        style={{ width: 40, textAlign: 'center', margin: '0 4px' }}
                      />
                      <button
                        aria-label="Increase quantity"
                        onClick={() => handleQuantityChange(item.productId, item.sizeId, item.quantity + 1)}
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
            {/* Package Cost/Profit display */}
            <div style={{ display: 'flex', alignItems: 'center', margin: '16px 0 0 0', fontSize: 20, fontWeight: 700 }}>
              <span style={{ color: '#fff', marginRight: 24 }}>Package Cost: ${cost.toFixed(2)}</span>
              <span style={{ color: profit < 0 ? 'red' : '#009900' }}>Package Profit: {profit < 0 ? '-' : ''}${Math.abs(profit).toFixed(2)}</span>
            </div>
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
        )}
      </div>
    </div>
  );

}

export default AdminPackages;

