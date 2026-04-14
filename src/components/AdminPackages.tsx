// Helper to extract base product name (removes trailing size info)
const baseProductName = (name: string) => {
  return String(name || 'Unknown Product')
    .replace(/\s+\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)?\s*$/i, '')
    .replace(/\s*[-–]\s*\d+(?:\.\d+)?x\d+(?:\.\d+)?\s*$/i, '')
    .replace(/\s*\(\d+(?:\.\d+)?x\d+(?:\.\d+)?\)\s*$/i, '')
    .trim() || String(name || 'Unknown Product');
};
import React, { useState, useEffect } from 'react';


interface Product {
  id: any;
  name: string;
  sizes: any[];
}

interface PackageItem {
  productId: any;
  sizeId: any;
  quantity: number;
}

interface Package {
  id: string;
  name: string;
  price: number;
  items: PackageItem[];
}

interface AdminPackagesProps {
  products: Product[];
  priceListId: number;
}

import { packageService } from '../services/packageService';

const AdminPackages: React.FC<AdminPackagesProps> = ({ products, priceListId }) => {
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



  const suggestedPackages: Omit<Package, 'id'>[] = [
    {
      name: 'Print Starter Package',
      price: 19.99,
      items: [
        { productId: nonSpecialtyProducts.find(p => p.name?.toLowerCase().includes('8x10'))?.id, sizeId: nonSpecialtyProducts.find(p => p.name?.toLowerCase().includes('8x10'))?.sizes[0]?.id, quantity: 1 }, // 8x10 Print
        { productId: nonSpecialtyProducts.find(p => p.name?.toLowerCase().includes('4x5'))?.id, sizeId: nonSpecialtyProducts.find(p => p.name?.toLowerCase().includes('4x5'))?.sizes[0]?.id, quantity: 2 }, // 4x5 Prints
      ].filter(i => i.productId && i.sizeId),
    },
    {
      name: 'Digital & Print Combo',
      price: 29.99,
      items: [
        { productId: nonSpecialtyProducts.find(p => p.name?.toLowerCase().includes('8x10'))?.id, sizeId: nonSpecialtyProducts.find(p => p.name?.toLowerCase().includes('8x10'))?.sizes[0]?.id, quantity: 1 }, // 8x10 Print
        { productId: nonSpecialtyProducts.find(p => p.name?.toLowerCase().includes('digital'))?.id, sizeId: nonSpecialtyProducts.find(p => p.name?.toLowerCase().includes('digital'))?.sizes[0]?.id, quantity: 1 }, // Digital Image
      ].filter(i => i.productId && i.sizeId),
    },
    {
      name: 'Button & Magnet Pack',
      price: 17.99,
      items: [
        { productId: nonSpecialtyProducts.find(p => p.name?.toLowerCase().includes('button'))?.id, sizeId: nonSpecialtyProducts.find(p => p.name?.toLowerCase().includes('button'))?.sizes[0]?.id, quantity: 1 }, // Button
        { productId: nonSpecialtyProducts.find(p => p.name?.toLowerCase().includes('magnet'))?.id, sizeId: nonSpecialtyProducts.find(p => p.name?.toLowerCase().includes('magnet'))?.sizes[0]?.id, quantity: 1 }, // Magnet
      ].filter(i => i.productId && i.sizeId),
    },
    {
      name: 'Keychain & Print Combo',
      price: 21.99,
      items: [
        { productId: nonSpecialtyProducts.find(p => p.name?.toLowerCase().includes('keychain'))?.id, sizeId: nonSpecialtyProducts.find(p => p.name?.toLowerCase().includes('keychain'))?.sizes[0]?.id, quantity: 1 }, // Keychain
        { productId: nonSpecialtyProducts.find(p => p.name?.toLowerCase().includes('4x5'))?.id, sizeId: nonSpecialtyProducts.find(p => p.name?.toLowerCase().includes('4x5'))?.sizes[0]?.id, quantity: 2 }, // 4x5 Prints
      ].filter(i => i.productId && i.sizeId),
    },
    {
      name: 'Digital Deluxe',
      price: 34.99,
      items: [
        { productId: nonSpecialtyProducts.find(p => p.name?.toLowerCase().includes('digital'))?.id, sizeId: nonSpecialtyProducts.find(p => p.name?.toLowerCase().includes('digital'))?.sizes[0]?.id, quantity: 2 }, // Digital Images
      ].filter(i => i.productId && i.sizeId),
    },
  ];

  // Show suggestions if there are products and no saved packages
  useEffect(() => {
    if (products.length > 0 && packages.length === 0) {
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  }, [products, packages]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<{ name: string; price: number; items: PackageItem[] }>({ name: '', price: 0, items: [] });
  const [productFilter, setProductFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');

  // Helper to get cost for a package
  const getPackageCost = (pkg: Package | typeof form) => {
    return pkg.items.reduce((sum, item) => {
      const product = products.find(p => p.id === item.productId);
      const size = product?.sizes.find((s: any) => s.id === item.sizeId);
      return sum + ((size?.cost || 0) * item.quantity);
    }, 0);
  };

  const getPackageProfit = (pkg: Package | typeof form) => pkg.price - getPackageCost(pkg);

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
      if (editingId) {
        await packageService.update(Number(editingId), { ...form, priceListId });
        const pkgs = await packageService.getAll(priceListId);
        setPackages(Array.isArray(pkgs) ? pkgs : []);
        setEditingId(null);
      } else {
        await packageService.create({ ...form, priceListId });
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
    setPackages(pkgs => [...pkgs, { ...pkg, id: Date.now().toString() }]);
    setShowSuggestions(false);
  };

  const handleIgnoreSuggestions = () => setShowSuggestions(false);

  if (loadingPackages) {
    return <div>Loading packages...</div>;
  }
  return (
    <div>
      <h2>Suggested Packages</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {suggestedPackages.map((pkg, idx) => (
          <div key={idx} style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16, minWidth: 260 }}>
            <div style={{ fontWeight: 600, fontSize: 18 }}>{pkg.name}</div>
            <div style={{ margin: '8px 0' }}>Price: ${pkg.price.toFixed(2)}</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
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
            <button style={{ marginTop: 12 }} onClick={() => handleAcceptSuggestion(pkg)}>Add Package</button>
          </div>
        ))}
      </div>
      <h2 style={{ marginTop: 32 }}>{editingId ? 'Edit Package' : 'Create Package'}</h2>
      <div className="admin-orders-card" style={{ marginBottom: 24 }}>
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
                <th>Cost</th>
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
                              <td>{((size.cost || 0) * quantity).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
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
        <div style={{ marginTop: 8 }}>
          <strong>Package Cost:</strong> {getPackageCost(form).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
          <span style={{ marginLeft: 24, color: getPackageProfit(form) >= 0 ? 'green' : 'red' }}>
            <strong>Package Profit:</strong> {getPackageProfit(form).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
          </span>
        </div>
        <button onClick={handleSave} style={{ marginTop: 12 }}>{editingId ? 'Update Package' : 'Save Package'}</button>
        {editingId && <button onClick={() => { setEditingId(null); setForm({ name: '', price: 0, items: [] }); }} style={{ marginLeft: 12 }}>Cancel</button>}
      </div>
      <h3>Saved Packages</h3>
      <table style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Products & Sizes</th>
            <th>Price</th>
            <th>Cost</th>
            <th>Profit</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {packages.map(pkg => (
            <tr key={pkg.id}>
              <td>{pkg.name}</td>
              <td>
                {pkg.items.length === 0 ? (
                  <span style={{ color: '#aaa' }}>No items</span>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {pkg.items.map(item => {
                      const product = products.find(p => p.id === item.productId);
                      const size = product?.sizes.find((s: any) => s.id === item.sizeId);
                      return (
                        <li key={item.productId + '-' + item.sizeId}>
                          {product?.name || 'Unknown Product'}
                          {size ? ` - ${size.name}` : ''}
                          {item.quantity > 1 ? ` (x${item.quantity})` : ''}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </td>
              <td>{pkg.price.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
              <td>{getPackageCost(pkg).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
              <td style={{ color: getPackageProfit(pkg) >= 0 ? 'green' : 'red' }}>{getPackageProfit(pkg).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
              <td>
                <button onClick={() => handleEdit(pkg)}>Edit</button>
                <button onClick={() => handleDelete(pkg.id)} style={{ marginLeft: 8 }}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AdminPackages;
