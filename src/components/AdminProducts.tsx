import React, { useEffect, useState } from 'react';
import { PriceList, Package } from '../types';
import { priceListAdminService } from '../services/priceListAdminService';
import { packageService } from '../services/packageService';

const AdminProducts = () => {
  // Markup percentage for all active products/sizes
  const [markupPercent, setMarkupPercent] = useState('');
  const [applyingMarkup, setApplyingMarkup] = useState(false);
  const handleMarkupPercentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMarkupPercent(e.target.value);
  };

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [packages, setPackages] = useState<Package[]>([]);
  const [packageLoading, setPackageLoading] = useState(false);
  const [packageError, setPackageError] = useState<string | null>(null);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [editingMarkup, setEditingMarkup] = useState<string>('');
  // ...rest of the component logic...

  const handleApplyMarkup = async () => {
    if (!selectedPriceListId || !markupPercent || isNaN(Number(markupPercent))) return;
    setApplyingMarkup(true);
    try {
      const selectedPriceList = priceLists.find(pl => pl.id === selectedPriceListId);
      if (!selectedPriceList || !Array.isArray(selectedPriceList.products)) return;
      const percent = Number(markupPercent) / 100;
      // Prepare batch update for all active products and sizes
      const productsToUpdate = selectedPriceList.products
        .filter(p => p.isActive)
        .map(product => ({
          id: product.id,
          sizes: (product.sizes || [])
            .filter(size => size.isOffered !== false)
            .map(size => ({
              id: size.id,
              price: parseFloat((size.price * (1 + percent)).toFixed(2)),
            })),
        }));
      await priceListAdminService.update(selectedPriceListId, { products: productsToUpdate });
      const lists = await priceListAdminService.getAll();
      setPriceLists(lists);
      setMarkupPercent('');
    } catch {
      setError('Failed to apply markup');
    } finally {
      setApplyingMarkup(false);
    }
  };
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [selectedPriceListId, setSelectedPriceListId] = useState<number | null>(null);
  const [savingProductId, setSavingProductId] = useState<number | null>(null);
  const [packageForm, setPackageForm] = useState<Partial<Package> | null>(null);
  const [savingPackage, setSavingPackage] = useState(false);

  // Fetch price list by ID if products are missing
  useEffect(() => {
    if (!selectedPriceListId) return;
    const selected = priceLists.find(pl => pl.id === selectedPriceListId);
    if (selected && (!Array.isArray(selected.products) || selected.products.length === 0)) {
      setLoading(true);
      priceListAdminService.getById(selectedPriceListId)
        .then((pl) => {
          if (!pl) return;
          setPriceLists((prev) => prev.map(p => p.id === pl.id ? pl : p));
        })
        .finally(() => setLoading(false));
    }
  }, [selectedPriceListId, priceLists]);

  // Load packages for selected price list
  useEffect(() => {
    if (!selectedPriceListId) return;
    setPackageLoading(true);
    setPackageError(null);
    packageService.getAll(selectedPriceListId)
      .then(setPackages)
      .catch(() => setPackageError('Failed to load packages'))
      .finally(() => setPackageLoading(false));
  }, [selectedPriceListId]);

  useEffect(() => {
    setLoading(true);
    priceListAdminService.getAll()
      .then((lists) => {
        setPriceLists(lists);
        if (lists.length > 0) {
          setSelectedPriceListId(lists.find(l => l.isDefault)?.id ?? lists[0].id);
        }
      })
      .catch((err) => {
        setError('Failed to load price lists');
      })
      .finally(() => setLoading(false));
  }, []);


  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedPriceListId(Number(e.target.value));
  };


  // Product activation toggle
  const handleToggleProductActive = async (productId: number, checked: boolean) => {
    if (!selectedPriceListId) return;
    setSavingProductId(productId);
    try {
      await priceListAdminService.update(selectedPriceListId, {
        products: [
          { id: productId, isActive: checked },
        ],
      });
      const lists = await priceListAdminService.getAll();
      setPriceLists(lists);
    } catch {
      setError('Failed to update product');
    } finally {
      setSavingProductId(null);
    }
  };

  // Size activation toggle
  const handleToggleSizeActive = async (productId: number, sizeId: number, checked: boolean) => {
    if (!selectedPriceListId) return;
    setSavingProductId(productId * 10000 + sizeId); // Unique key for size
    try {
      await priceListAdminService.update(selectedPriceListId, {
        products: [
          {
            id: productId,
            sizes: [
              { id: sizeId, isOffered: checked },
            ],
          },
        ],
      });
      const lists = await priceListAdminService.getAll();
      setPriceLists(lists);
    } catch {
      setError('Failed to update size');
    } finally {
      setSavingProductId(null);
    }
  };

  // Size price editing
  const [editingSize, setEditingSize] = useState<{ productId: number; sizeId: number } | null>(null);
  const [editingSizePrice, setEditingSizePrice] = useState<string>('');
  const handleStartEditSizePrice = (productId: number, sizeId: number, currentPrice: number) => {
    setEditingSize({ productId, sizeId });
    setEditingSizePrice(currentPrice.toString());
  };
  const handleSizePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingSizePrice(e.target.value);
  };
  const handleSaveSizePrice = async (productId: number, sizeId: number) => {
    if (!selectedPriceListId) return;
    setSavingProductId(productId * 10000 + sizeId);
    try {
      await priceListAdminService.update(selectedPriceListId, {
        products: [
          {
            id: productId,
            sizes: [
              { id: sizeId, price: parseFloat(editingSizePrice) },
            ],
          },
        ],
      });
      const lists = await priceListAdminService.getAll();
      setPriceLists(lists);
      setEditingSize(null);
    } catch {
      setError('Failed to update size price');
    } finally {
      setSavingProductId(null);
    }
  };
  const handleCancelEditSizePrice = () => {
    setEditingSize(null);
    setEditingSizePrice('');
  };

  // Package CRUD
  const handleEditPackage = (pkg: Package) => {
    setPackageForm({ ...pkg });
  };
  const handleNewPackage = () => {
    setPackageForm({
      name: '',
      description: '',
      packagePrice: 0,
      items: [],
      isActive: true,
      priceListId: selectedPriceListId!,
      createdDate: new Date().toISOString(),
    });
  };
  const handlePackageFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!packageForm) return;
    setPackageForm({ ...packageForm, [e.target.name]: e.target.value });
  };
  const handleSavePackage = async () => {
    if (!packageForm || !selectedPriceListId) return;
    setSavingPackage(true);
    try {
      if (packageForm.id) {
        await packageService.update(packageForm.id, packageForm);
      } else {
        await packageService.create({ ...packageForm, priceListId: selectedPriceListId });
      }
      setPackageForm(null);
      // Refresh packages
      const pkgs = await packageService.getAll(selectedPriceListId);
      setPackages(pkgs);
    } catch {
      setPackageError('Failed to save package');
    } finally {
      setSavingPackage(false);
    }
  };
  const handleDeletePackage = async (id: number) => {
    if (!selectedPriceListId) return;
    setSavingPackage(true);
    try {
      await packageService.delete(id);
      const pkgs = await packageService.getAll(selectedPriceListId);
      setPackages(pkgs);
    } catch {
      setPackageError('Failed to delete package');
    } finally {
      setSavingPackage(false);
    }
  };
  const handleCancelPackageForm = () => setPackageForm(null);

  return (
    <>
      <h2>Products</h2>
      <div className="admin-products-content">
        {/* Removed Upload Watermark button */}
        <div style={{ margin: '16px 0' }}>
          {loading ? (
            <span>Loading price lists...</span>
          ) : error ? (
            <span style={{ color: 'red' }}>{error}</span>
          ) : (
            <label>
              Price List:{' '}
              <select value={selectedPriceListId ?? ''} onChange={handleSelectChange}>
                {priceLists.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.name} {pl.isDefault ? '(Default)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {/* Product management UI */}
        {selectedPriceListId && (() => {
          const selectedPriceList = priceLists.find(pl => pl.id === selectedPriceListId);
          if (!selectedPriceList) return <div>No products found for this price list.</div>;
          // Fix: Sometimes products may not be loaded in the priceList object, so check for undefined/null only
          if (!Array.isArray(selectedPriceList.products)) {
            if (loading) return <div>Loading products...</div>;
            return <div>No products in this price list.</div>;
          }
          if (selectedPriceList.products.length === 0) {
            if (loading) return <div>Loading products...</div>;
            return <div>No products in this price list.</div>;
          }
          return (
            <>
              {/* Markup percentage for all active products/sizes */}
              <div style={{
                margin: '16px 0',
                padding: '16px',
                background: '#f7f7f7',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
              }}>
                <label style={{ color: '#aaa', fontWeight: 500, fontSize: 15, marginRight: 12 }}>
                  Markup % for all active products/sizes:
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={markupPercent}
                  onChange={handleMarkupPercentChange}
                  disabled={applyingMarkup}
                  style={{
                    width: 100,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #333',
                    background: '#23232b',
                    color: '#fff',
                    fontSize: 16,
                    outline: 'none',
                    marginRight: 12
                  }}
                />
                <button
                  onClick={handleApplyMarkup}
                  disabled={applyingMarkup || !markupPercent}
                  style={{
                    background: '#7c5cff',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 12,
                    padding: '10px 28px',
                    fontWeight: 700,
                    fontSize: 16,
                    cursor: applyingMarkup || !markupPercent ? 'not-allowed' : 'pointer',
                    opacity: applyingMarkup || !markupPercent ? 0.6 : 1,
                    transition: 'background 0.2s',
                  }}
                >
                  Apply Markup
                </button>
              </div>
              <table className="admin-products-table" style={{ width: '100%', marginTop: 16 }}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Active</th>
                    <th>Popularity</th>
                    <th>Sizes</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPriceList.products.map(product => (
                    <tr key={product.id}>
                      <td>{product.name}</td>
                      <td>{product.category || '-'}</td>
                      <td>
                        <input
                          type="checkbox"
                          checked={!!product.isActive}
                          disabled={savingProductId === product.id}
                          onChange={e => handleToggleProductActive(product.id, e.target.checked)}
                        />
                      </td>
                      <td>{product.popularity ?? '-'}</td>
                      <td>
                        {product.sizes && product.sizes.length > 0 ? (
                          <table style={{ width: '100%' }}>
                            <thead>
                              <tr>
                                <th>Size</th>
                                <th>Active</th>
                                <th>Price</th>
                              </tr>
                            </thead>
                            <tbody>
                              {product.sizes.map(size => (
                                <tr key={size.id}>
                                  <td>{size.name}</td>
                                  <td>
                                    <input
                                      type="checkbox"
                                      checked={size.isOffered !== false}
                                      disabled={savingProductId === product.id * 10000 + size.id}
                                      onChange={e => handleToggleSizeActive(product.id, size.id, e.target.checked)}
                                    />
                                  </td>
                                  <td>
                                    {editingSize && editingSize.productId === product.id && editingSize.sizeId === size.id ? (
                                      <>
                                        <input
                                          type="number"
                                          min={0}
                                          step={0.01}
                                          value={editingSizePrice}
                                          onChange={handleSizePriceChange}
                                          style={{ width: 70 }}
                                          disabled={savingProductId === product.id * 10000 + size.id}
                                        />
                                        <button onClick={() => handleSaveSizePrice(product.id, size.id)} disabled={savingProductId === product.id * 10000 + size.id}>Save</button>
                                        <button onClick={handleCancelEditSizePrice} disabled={savingProductId === product.id * 10000 + size.id}>Cancel</button>
                                      </>
                                    ) : (
                                      <>
                                        <input
                                          type="number"
                                          min={0}
                                          step={0.01}
                                          value={size.price ?? ''}
                                          readOnly
                                          style={{ width: 70 }}
                                        />
                                        <button onClick={() => handleStartEditSizePrice(product.id, size.id, size.price)} disabled={savingProductId === product.id * 10000 + size.id}>Edit</button>
                                      </>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <span>No sizes</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Package Management UI */}
              <div style={{ marginTop: 32 }}>
                <h3>Packages</h3>
                {packageLoading ? (
                  <span>Loading packages...</span>
                ) : packageError ? (
                  <span style={{ color: 'red' }}>{packageError}</span>
                ) : (
                  <>
                    <button onClick={handleNewPackage} style={{ marginBottom: 12 }}>New Package</button>
                    <table className="admin-packages-table" style={{ width: '100%' }}>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Description</th>
                          <th>Price</th>
                          <th>Active</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {packages.map(pkg => (
                          <tr key={pkg.id}>
                            <td>{pkg.name}</td>
                            <td>{pkg.description}</td>
                            <td>${pkg.packagePrice.toFixed(2)}</td>
                            <td>{pkg.isActive ? 'Yes' : 'No'}</td>
                            <td>
                              <button onClick={() => handleEditPackage(pkg)} disabled={savingPackage}>Edit</button>
                              <button onClick={() => handleDeletePackage(pkg.id)} disabled={savingPackage}>Delete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
                {/* Package Form Modal (simple inline for now) */}
                {packageForm && (
                  <div style={{ border: '1px solid #ccc', padding: 16, marginTop: 16, background: '#fafafa' }}>
                    <h4>{packageForm.id ? 'Edit Package' : 'New Package'}</h4>
                    <label>
                      Name:
                      <input
                        name="name"
                        value={packageForm.name || ''}
                        onChange={handlePackageFormChange}
                        disabled={savingPackage}
                      />
                    </label>
                    <br />
                    <label>
                      Description:
                      <textarea
                        name="description"
                        value={packageForm.description || ''}
                        onChange={handlePackageFormChange}
                        disabled={savingPackage}
                      />
                    </label>
                    <br />
                    <label>
                      Price:
                      <input
                        name="packagePrice"
                        type="number"
                        min={0}
                        step={0.01}
                        value={packageForm.packagePrice ?? ''}
                        onChange={handlePackageFormChange}
                        disabled={savingPackage}
                      />
                    </label>
                    <br />
                    <label>
                      Active:
                      <input
                        name="isActive"
                        type="checkbox"
                        checked={!!packageForm.isActive}
                        onChange={e => setPackageForm({ ...packageForm, isActive: e.target.checked })}
                        disabled={savingPackage}
                      />
                    </label>
                    <br />
                    {/* TODO: Add package items editing UI */}
                    <button onClick={handleSavePackage} disabled={savingPackage}>Save</button>
                    <button onClick={handleCancelPackageForm} disabled={savingPackage}>Cancel</button>
                  </div>
                )}
              </div>
            </>
          );
        })()}
      </div>
    </>
  );
};

export default AdminProducts;
