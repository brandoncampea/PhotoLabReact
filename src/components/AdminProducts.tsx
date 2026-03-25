import React, { useEffect, useState } from 'react';
import AdminPackages from './AdminPackages';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import axios from 'axios';
import { PriceList, Package } from '../types';
import { priceListAdminService } from '../services/priceListAdminService';
import { packageService } from '../services/packageService';

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
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);

  // Fetch all price lists on mount
  useEffect(() => {
    const fetchPriceLists = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get('/api/price-lists');
        setPriceLists(res.data || []);
        // Auto-select first price list if available
        if (res.data && res.data.length > 0) {
          setSelectedPriceListId(res.data[0].id);
        }
      } catch (err: any) {
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
        setProducts(res.data.products || []);
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
                      product.sizes && product.sizes.length > 0 ? (
                        <React.Fragment key={product.id}>
                          <tr key={product.id + '-main'}>
                            <td rowSpan={product.sizes.length}>{product.name}</td>
                            <td rowSpan={product.sizes.length}>{product.category}</td>
                            <td rowSpan={product.sizes.length}>{product.description}</td>
                            <td rowSpan={product.sizes.length}>
                              <input
                                type="checkbox"
                                checked={!!product.isActive}
                                onChange={async (e) => {
                                  const newIsActive = e.target.checked;
                                  try {
                                    await axios.put(`/api/products/${product.id}/active`, { isActive: newIsActive });
                                    setProducts((prev) => prev.map((p) => {
                                      if (p.id === product.id) {
                                        return {
                                          ...p,
                                          isActive: newIsActive,
                                          sizes: Array.isArray(p.sizes)
                                            ? p.sizes.map((s: any) => ({ ...s, isOffered: newIsActive }))
                                            : p.sizes
                                        };
                                      }
                                      return p;
                                    }));
                                  } catch (err) {
                                    setError('Failed to update product active status');
                                  }
                                }}
                              />
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
                      ) : null
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
