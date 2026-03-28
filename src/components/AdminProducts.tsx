import React, { useEffect, useState } from 'react';
import AdminPackages from './AdminPackages';

import axios from 'axios';




// Helper to format currency
export const formatCurrency = (value: number) => {
  return value?.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
};



function AdminProducts() {
  const [tab, setTab] = useState<'products' | 'packages'>('products');
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [selectedPriceListId, setSelectedPriceListId] = useState<number | null>(null);
  const [percentMarkup, setPercentMarkup] = useState<number>(0);
  const [priceLists, setPriceLists] = useState<any[]>([]);

  // Fetch all price lists on mount
  useEffect(() => {
    const fetchPriceLists = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get('/api/price-lists');
        let lists = res.data || [];
        // Always show WHCC price list first if present
        lists = lists.sort((a: any, b: any) => {
          if (a.name && a.name.toLowerCase().includes('whcc')) return -1;
          if (b.name && b.name.toLowerCase().includes('whcc')) return 1;
          return a.name.localeCompare(b.name);
        });
        setPriceLists(lists);
        // Auto-select WHCC price list if present, else first
        const whcc = lists.find((pl: any) => pl.name && pl.name.toLowerCase().includes('whcc'));
        if (whcc) {
          setSelectedPriceListId(whcc.id);
        } else if (lists.length > 0) {
          setSelectedPriceListId(lists[0].id);
        }
      } catch (err) {
        setError('Failed to load price lists');
      } finally {
        setLoading(false);
      }
    };
    fetchPriceLists();
  }, []);

  // Fetch products for selected price list
  useEffect(() => {
    if (!selectedPriceListId) return;
    const fetchProducts = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get(`/api/price-lists/${selectedPriceListId}`);
        const products = res.data.products || [];
        // Debug log all product names and IDs
        console.log('[AdminProducts] Products from backend:', products.map((p: any) => ({ id: p.id, name: p.name })));
        setProducts(products);
      } catch (err: any) {
        setError('Failed to load products');
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, [selectedPriceListId]);

  const handleApplyMarkup = () => {
    if (!percentMarkup) return;
    setProducts((prev) =>
      prev.map((product) => ({
        ...product,
        sizes: product.sizes.map((size: any) =>
          size.isOffered !== false
            ? { ...size, basePrice: Math.round((size.cost * (1 + percentMarkup / 100)) * 100) / 100 }
            : size
        ),
      }))
    );
  };

  const filteredProducts = products.filter((product) => {
    const search = filter.toLowerCase();
    return (
      product.name?.toLowerCase().includes(search) ||
      product.category?.toLowerCase().includes(search) ||
      product.description?.toLowerCase().includes(search) ||
      (product.sizes || []).some((size: any) => size.name?.toLowerCase().includes(search))
    );
  });

  return (
    <div className="admin-products-page">
      <div className="tabs" style={{ marginBottom: 24 }}>
        <button
          className={tab === 'products' ? 'tab-active' : ''}
          onClick={() => setTab('products')}
        >
          Products
        </button>
        <button
          className={tab === 'packages' ? 'tab-active' : ''}
          onClick={() => setTab('packages')}
        >
          Packages
        </button>
      </div>

      {/* Price List Selector */}
      <div style={{ marginBottom: 16 }}>
        <label htmlFor="price-list-select" style={{ marginRight: 8 }}>Price List:</label>
        <select
          id="price-list-select"
          value={selectedPriceListId ?? ''}
          onChange={e => setSelectedPriceListId(Number(e.target.value))}
          style={{ minWidth: 200 }}
        >
          {priceLists.map((pl) => (
            <option key={pl.id} value={pl.id}>{pl.name}</option>
          ))}
        </select>
      </div>

      {tab === 'products' && (
        <div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            <input
              type="text"
              placeholder="Filter by product, category, description, or size"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{ flex: 1, minWidth: 200 }}
            />
            <input
              type="number"
              placeholder="% Markup"
              value={percentMarkup}
              onChange={e => setPercentMarkup(Number(e.target.value))}
              style={{ width: 100 }}
            />
            <button onClick={handleApplyMarkup} style={{ minWidth: 120 }}>Apply Markup</button>
          </div>
          {loading ? (
            <div>Loading...</div>
          ) : error ? (
            <div className="error-message">{error}</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Active</th>
                    <th>Size</th>
                    <th>Base Price</th>
                    <th>Cost</th>
                    <th>Profit</th>
                    <th>Offered</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', color: '#aaa' }}>No products found.</td>
                    </tr>
                  ) : (
                    filteredProducts.map((product) => (
                      <React.Fragment key={product.id}>
                          <tr key={product.id + '-main'}>
                            <td>{product.name}</td>
                            <td>{product.category}</td>
                            <td>{product.description}</td>
                            <td>
                              <input
                                type="checkbox"
                                checked={!!product.offered}
                                onChange={async (e) => {
                                  const newOffered = e.target.checked;
                                  try {
                                    if (selectedPriceListId) {
                                      await axios.post(`/api/price-lists/${selectedPriceListId}/products`, { productId: product.id });
                                    }
                                    setProducts((prev) => prev.map((p) =>
                                      p.id === product.id ? { ...p, offered: newOffered } : p
                                    ));
                                  } catch (err) {
                                    setError('Failed to update offered status');
                                  }
                                }}
                              />
                            </td>
                            {/* Optionally, display size info or a message if no sizes */}
                            <td colSpan={5} style={{ color: '#888', fontStyle: 'italic' }}>
                              {product.sizes && product.sizes.length > 0
                                ? product.sizes.map((size: any) => size.name).join(', ')
                                : 'No sizes'}
                            </td>
                            <td>{(() => {
                              const size = product.sizes[0];
                              const dim = `${size.width}x${size.height}`;
                              if (size.name && size.width && size.height && !size.name.includes(dim)) {
                                return `${size.name} (${dim})`;
                              }
                              return size.name;
                            })()}</td>
                            <td>
                              <input
                                type="number"
                                value={product.sizes[0].basePrice ?? product.sizes[0].price}
                                min={0}
                                step={0.01}
                                style={{ width: 80 }}
                                onChange={async (e) => {
                                  const newBasePrice = Number(e.target.value);
                                  try {
                                    if (selectedPriceListId) {
                                      await axios.post(`/api/price-lists/${selectedPriceListId}/products`, { productId: product.id });
                                    }
                                  } catch (err) {/* ignore if already exists */}
                                  try {
                                    await axios.put(`/api/price-lists/${selectedPriceListId}/products/${product.id}/sizes/${product.sizes[0].id}`, { basePrice: newBasePrice });
                                    setProducts((prev) => prev.map((p) =>
                                      p.id === product.id
                                        ? {
                                            ...p,
                                            sizes: p.sizes.map((s: any, idx: number) =>
                                              idx === 0 ? { ...s, basePrice: newBasePrice } : s
                                            ),
                                          }
                                        : p
                                    ));
                                  } catch (err) {
                                    setError('Failed to update base price');
                                  }
                                }}
                              />
                            </td>
                            <td>{formatCurrency(product.sizes[0].cost)}</td>
                            <td style={{ color: 'green', fontWeight: 500 }}>
                              {formatCurrency((product.sizes[0].basePrice ?? product.sizes[0].price) - product.sizes[0].cost)}
                            </td>
                            <td>
                              {product.sizes[0].isOffered !== undefined ? (
                                <input
                                  type="checkbox"
                                  checked={!!product.sizes[0].isOffered}
                                  onChange={async (e) => {
                                    const newIsOffered = e.target.checked;
                                    try {
                                      if (selectedPriceListId) {
                                        await axios.post(`/api/price-lists/${selectedPriceListId}/products`, { productId: product.id });
                                      }
                                    } catch (err) {/* ignore if already exists */}
                                    try {
                                      await axios.put(`/api/price-lists/${selectedPriceListId}/products/${product.id}/sizes/${product.sizes[0].id}/active`, { isOffered: newIsOffered });
                                      setProducts((prev) => prev.map((p) =>
                                        p.id === product.id
                                          ? {
                                              ...p,
                                              sizes: p.sizes.map((s: any, idx: number) =>
                                                idx === 0 ? { ...s, isOffered: newIsOffered } : s
                                              ),
                                            }
                                          : p
                                      ));
                                    } catch (err) {
                                      setError('Failed to update size active status');
                                    }
                                  }}
                                />
                              ) : null}
                            </td>
                          </tr>
                          {product.sizes.slice(1).map((size: any) => (
                            <tr key={product.id + '-' + size.id}>
                              <td>{(() => {
                                const dim = `${size.width}x${size.height}`;
                                if (size.name && size.width && size.height && !size.name.includes(dim)) {
                                  return `${size.name} (${dim})`;
                                }
                                return size.name;
                              })()}</td>
                              <td>
                                <input
                                  type="number"
                                  value={size.basePrice ?? size.price}
                                  min={0}
                                  step={0.01}
                                  style={{ width: 80 }}
                                  onChange={async (e) => {
                                    const newBasePrice = Number(e.target.value);
                                    try {
                                      if (selectedPriceListId) {
                                        await axios.post(`/api/price-lists/${selectedPriceListId}/products`, { productId: product.id });
                                      }
                                    } catch (err) {/* ignore if already exists */}
                                    try {
                                      await axios.put(`/api/price-lists/${selectedPriceListId}/products/${product.id}/sizes/${size.id}`, { basePrice: newBasePrice });
                                      setProducts((prev) => prev.map((p) =>
                                        p.id === product.id
                                          ? {
                                              ...p,
                                              sizes: p.sizes.map((s: any) =>
                                                s.id === size.id ? { ...s, basePrice: newBasePrice } : s
                                              ),
                                            }
                                          : p
                                      ));
                                    } catch (err) {
                                      setError('Failed to update base price');
                                    }
                                  }}
                                />
                              </td>
                              <td>{formatCurrency(size.cost)}</td>
                              <td style={{ color: 'green', fontWeight: 500 }}>
                                {formatCurrency((size.basePrice ?? size.price) - size.cost)}
                              </td>
                              <td>
                                {size.isOffered !== undefined ? (
                                  <input
                                    type="checkbox"
                                    checked={!!size.isOffered}
                                    onChange={async (e) => {
                                      const newIsOffered = e.target.checked;
                                      try {
                                        if (selectedPriceListId) {
                                          await axios.post(`/api/price-lists/${selectedPriceListId}/products`, { productId: product.id });
                                        }
                                      } catch (err) {/* ignore if already exists */}
                                      try {
                                        await axios.put(`/api/price-lists/${selectedPriceListId}/products/${product.id}/sizes/${size.id}/active`, { isOffered: newIsOffered });
                                        setProducts((prev) => prev.map((p) =>
                                          p.id === product.id
                                            ? {
                                                ...p,
                                                sizes: p.sizes.map((s: any) =>
                                                  s.id === size.id ? { ...s, isOffered: newIsOffered } : s
                                                ),
                                              }
                                            : p
                                        ));
                                      } catch (err) {
                                        setError('Failed to update size active status');
                                      }
                                    }}
                                  />
                                ) : null}
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'packages' && (
        <AdminPackages products={products} />
      )}
    </div>
  );
}

export default AdminProducts;
