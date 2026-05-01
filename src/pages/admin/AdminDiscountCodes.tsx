import React from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../services/api';
import { discountCodeService } from '../../services/discountCodeService';
import { productService } from '../../services/productService';
import { Album, DiscountCode, Product } from '../../types';

type DiscountFormState = {
  code: string;
  description: string;
  discountType: DiscountCode['discountType'];
  discountValue: string;
  applicationType: DiscountCode['applicationType'];
  bundleQuantity: string;
  bundlePrice: string;
  startDate: string;
  expirationDate: string;
  minSubtotal: string;
  isOneTimeUse: boolean;
  maxUsages: string;
  perCustomerLimit: string;
  firstOrderOnly: boolean;
  isActive: boolean;
  validationMessage: string;
  applicableProductIds: number[];
  applicableCategoryNames: string[];
  applicableAlbumIds: number[];
};

const defaultFormState: DiscountFormState = {
  code: '',
  description: '',
  discountType: 'percentage',
  discountValue: '10',
  applicationType: 'entire-order',
  bundleQuantity: '5',
  bundlePrice: '40',
  startDate: '',
  expirationDate: '',
  minSubtotal: '',
  isOneTimeUse: false,
  maxUsages: '',
  perCustomerLimit: '',
  firstOrderOnly: false,
  isActive: true,
  validationMessage: '',
  applicableProductIds: [],
  applicableCategoryNames: [],
  applicableAlbumIds: [],
};

const toFormState = (code?: DiscountCode | null): DiscountFormState => ({
  code: code?.code || '',
  description: code?.description || '',
  discountType: code?.discountType || 'percentage',
  discountValue: code?.discountType === 'free-shipping' || code?.discountType === 'bundle-price' ? '0' : String(code?.discountValue ?? 10),
  applicationType: code?.applicationType || 'entire-order',
  bundleQuantity: code?.bundleQuantity != null ? String(code.bundleQuantity) : '5',
  bundlePrice: code?.bundlePrice != null ? String(code.bundlePrice) : '40',
  startDate: code?.startDate ? String(code.startDate).slice(0, 16) : '',
  expirationDate: code?.expirationDate ? String(code.expirationDate).slice(0, 16) : '',
  minSubtotal: code?.minSubtotal != null ? String(code.minSubtotal) : '',
  isOneTimeUse: !!code?.isOneTimeUse,
  maxUsages: code?.maxUsages != null ? String(code.maxUsages) : '',
  perCustomerLimit: code?.perCustomerLimit != null ? String(code.perCustomerLimit) : '',
  firstOrderOnly: !!code?.firstOrderOnly,
  isActive: code?.isActive ?? true,
  validationMessage: code?.validationMessage || '',
  applicableProductIds: code?.applicableProductIds || [],
  applicableCategoryNames: code?.applicableCategoryNames || [],
  applicableAlbumIds: code?.applicableAlbumIds || [],
});

const isExpired = (expirationDate?: string) => !!expirationDate && new Date(expirationDate).getTime() < Date.now();
const isMaxedOut = (code: DiscountCode) => !!code.maxUsages && (code.couponStats?.useCount ?? code.usageCount) >= code.maxUsages;

const formatDiscount = (code: DiscountCode) => {
  if (code.discountType === 'free-shipping') return 'Free shipping';
  if (code.discountType === 'bundle-price') return `Bundle applied: ${code.bundleQuantity || 0} for $${Number(code.bundlePrice || 0).toFixed(2)}`;
  if (code.discountType === 'percentage') return `${code.discountValue}% off`;
  return `$${Number(code.discountValue || 0).toFixed(2)} off`;
};

const formatScope = (code: DiscountCode) => {
  if (code.applicationType === 'entire-order') return 'Entire order';
  if (code.applicationType === 'shipping') return 'Shipping';
  if (code.applicationType === 'specific-products') return `${code.applicableProductIds.length} selected products`;
  if (code.applicationType === 'specific-categories') return `${code.applicableCategoryNames?.length || 0} categories`;
  return `${code.applicableAlbumIds?.length || 0} albums`;
};

const AdminDiscountCodes: React.FC = () => {
  const [discountCodes, setDiscountCodes] = React.useState<DiscountCode[]>([]);
  const [products, setProducts] = React.useState<Product[]>([]);
  const [albums, setAlbums] = React.useState<Album[]>([]);
  const [productSearch, setProductSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [showModal, setShowModal] = React.useState(false);
  const [editingCode, setEditingCode] = React.useState<DiscountCode | null>(null);
  const [form, setForm] = React.useState<DiscountFormState>(defaultFormState);
  const [error, setError] = React.useState<string | null>(null);

  const categories = React.useMemo(() => Array.from(new Set(products.map((product) => String(product.category || '').trim()).filter(Boolean))).sort(), [products]);

  const offeredProductSizeOptions = React.useMemo(() => {
    const options: Array<{ key: string; productId: number; label: string; searchText: string }> = [];
    for (const product of products) {
      const baseName = String(product.name || '').trim();
      const category = String(product.category || '').trim();
      const sizes = Array.isArray(product.sizes) ? product.sizes : [];

      if (sizes.length > 0) {
        for (const size of sizes) {
          const sizeLabel = `${size.name || 'Size'}${size.width && size.height ? ` (${size.width}x${size.height})` : ''}`;
          const priceLabel = Number.isFinite(Number(size.price)) ? ` - $${Number(size.price).toFixed(2)}` : '';
          const label = `${baseName} • ${sizeLabel}${priceLabel}`;
          options.push({
            key: `${product.id}:${size.id}`,
            productId: Number(product.id),
            label,
            searchText: `${baseName} ${size.name || ''} ${category}`.toLowerCase(),
          });
        }
      } else {
        const priceLabel = Number.isFinite(Number(product.price)) ? ` - $${Number(product.price).toFixed(2)}` : '';
        const label = `${baseName}${priceLabel}`;
        options.push({
          key: `${product.id}:base`,
          productId: Number(product.id),
          label,
          searchText: `${baseName} ${category}`.toLowerCase(),
        });
      }
    }
    return options;
  }, [products]);

  const filteredProductSizeOptions = React.useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const selectedSet = new Set(form.applicableProductIds.map(Number));
    const seenProductIds = new Set<number>();

    const matches = offeredProductSizeOptions.filter((option) => {
      if (selectedSet.has(option.productId)) return false;
      if (!q) return true;
      return option.searchText.includes(q) || option.label.toLowerCase().includes(q);
    });

    // Show at most one row per product in dropdown, but keep size-rich labels.
    const deduped = [] as typeof matches;
    for (const match of matches) {
      if (seenProductIds.has(match.productId)) continue;
      seenProductIds.add(match.productId);
      deduped.push(match);
      if (deduped.length >= 12) break;
    }
    return deduped;
  }, [offeredProductSizeOptions, productSearch, form.applicableProductIds]);

  const selectedProducts = React.useMemo(() => {
    const selectedSet = new Set(form.applicableProductIds.map(Number));
    return products.filter((product) => selectedSet.has(Number(product.id)));
  }, [products, form.applicableProductIds]);

  const addApplicableProduct = (productId: number) => {
    setForm((prev) => {
      if (prev.applicableProductIds.includes(productId)) return prev;
      return { ...prev, applicableProductIds: [...prev.applicableProductIds, productId] };
    });
  };

  const removeApplicableProduct = (productId: number) => {
    setForm((prev) => ({
      ...prev,
      applicableProductIds: prev.applicableProductIds.filter((entry) => entry !== productId),
    }));
  };

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [codes, albumsResponse] = await Promise.all([
        discountCodeService.getAll(),
        api.get<Album[]>('/albums'),
      ]);

      const albumsData = Array.isArray(albumsResponse.data) ? albumsResponse.data : [];
      const albumIds = albumsData
        .map((album) => Number(album.id))
        .filter((id) => Number.isInteger(id) && id > 0);

      let allProducts: Product[] = [];
      if (albumIds.length > 0) {
        const productsByAlbum = await Promise.all(
          albumIds.map(async (albumId) => {
            try {
              return await productService.getActiveProducts(albumId);
            } catch {
              return [] as Product[];
            }
          })
        );

        const merged = new Map<number, Product>();
        for (const product of productsByAlbum.flat()) {
          const pid = Number(product.id);
          if (!merged.has(pid)) {
            merged.set(pid, { ...product, sizes: Array.isArray(product.sizes) ? [...product.sizes] : [] });
            continue;
          }

          const existing = merged.get(pid)!;
          const sizeMap = new Map<number, any>();
          [...(existing.sizes || []), ...(product.sizes || [])].forEach((size) => sizeMap.set(Number(size.id), size));
          existing.sizes = Array.from(sizeMap.values());
        }

        allProducts = Array.from(merged.values());
      }

      if (!allProducts.length) {
        allProducts = await productService.getActiveProducts();
      }

      setDiscountCodes(codes);
      setProducts(allProducts);
      setAlbums(albumsData);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load discount codes.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreate = () => {
    setEditingCode(null);
    setForm(defaultFormState);
    setShowModal(true);
  };

  const openEdit = (code: DiscountCode) => {
    setEditingCode(code);
    setForm(toFormState(code));
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingCode(null);
    setForm(defaultFormState);
  };

  const setField = <K extends keyof DiscountFormState>(key: K, value: DiscountFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleNumber = (key: 'applicableProductIds' | 'applicableAlbumIds', value: number) => {
    setForm((prev) => ({
      ...prev,
      [key]: prev[key].includes(value) ? prev[key].filter((entry) => entry !== value) : [...prev[key], value],
    }));
  };

  const toggleCategory = (value: string) => {
    setForm((prev) => ({
      ...prev,
      applicableCategoryNames: prev.applicableCategoryNames.includes(value)
        ? prev.applicableCategoryNames.filter((entry) => entry !== value)
        : [...prev.applicableCategoryNames, value],
    }));
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this discount code?')) return;
    try {
      await discountCodeService.delete(id);
      await loadData();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to delete discount code.');
    }
  };

  const handleDuplicate = async (id: number) => {
    try {
      await discountCodeService.duplicate(id);
      await loadData();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to duplicate discount code.');
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        description: form.description.trim(),
        discountType: form.discountType,
        discountValue: form.discountType === 'free-shipping' || form.discountType === 'bundle-price' ? 0 : Number(form.discountValue || 0),
        applicationType: form.discountType === 'free-shipping' ? 'shipping' : form.discountType === 'bundle-price' ? 'specific-products' : form.applicationType,
        bundleQuantity: form.discountType === 'bundle-price' ? Number(form.bundleQuantity || 0) : undefined,
        bundlePrice: form.discountType === 'bundle-price' ? Number(form.bundlePrice || 0) : undefined,
        startDate: form.startDate || undefined,
        expirationDate: form.expirationDate || undefined,
        minSubtotal: form.minSubtotal === '' ? undefined : Number(form.minSubtotal),
        isOneTimeUse: form.isOneTimeUse,
        maxUsages: form.maxUsages === '' ? undefined : Number(form.maxUsages),
        perCustomerLimit: form.perCustomerLimit === '' ? undefined : Number(form.perCustomerLimit),
        firstOrderOnly: form.firstOrderOnly,
        isActive: form.isActive,
        validationMessage: form.validationMessage.trim() || undefined,
        applicableProductIds: form.applicationType === 'specific-products' || form.discountType === 'bundle-price' ? form.applicableProductIds : [],
        applicableCategoryNames: form.applicationType === 'specific-categories' ? form.applicableCategoryNames : [],
        applicableAlbumIds: form.applicationType === 'specific-albums' ? form.applicableAlbumIds : [],
      };

      if (!payload.code) {
        throw new Error('Code is required.');
      }
      if (form.discountType === 'bundle-price') {
        if (!payload.bundleQuantity || payload.bundleQuantity < 2) throw new Error('Bundle quantity must be at least 2.');
        if (payload.bundlePrice == null || payload.bundlePrice < 0) throw new Error('Bundle price is required.');
        if (!form.applicableProductIds.length) throw new Error('Select at least one applicable product for a bundle deal.');
      }

      if (editingCode) {
        await discountCodeService.update(editingCode.id, payload);
      } else {
        await discountCodeService.create(payload);
      }

      closeModal();
      await loadData();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to save discount code.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="page-header">
        <h1>Manage Discount Codes</h1>
        <button onClick={openCreate} className="btn btn-primary">+ Create Discount Code</button>
      </div>

      {error && <div className="error-message" style={{ marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div className="card">Loading discounts…</div>
      ) : (
        <div className="table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Offer</th>
                <th>Scope</th>
                <th>Rules</th>
                <th>Usage</th>
                <th>Impact</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {discountCodes.map((code) => {
                const inactive = !code.isActive || isExpired(code.expirationDate) || isMaxedOut(code);
                return (
                  <tr key={code.id} style={{ opacity: inactive ? 0.65 : 1 }}>
                    <td>
                      <strong>{code.code}</strong>
                      <div className="muted-text" style={{ fontSize: 12 }}>{new Date(code.createdDate).toLocaleDateString()}</div>
                    </td>
                    <td>
                      <div>{formatDiscount(code)}</div>
                      <div className="muted-text" style={{ fontSize: 12 }}>{code.description || 'No description'}</div>
                    </td>
                    <td>{formatScope(code)}</td>
                    <td style={{ maxWidth: 220 }}>
                      <div className="muted-text" style={{ fontSize: 12 }}>
                        {code.minSubtotal ? `Min $${Number(code.minSubtotal).toFixed(2)}` : 'No minimum'}
                        {code.firstOrderOnly ? ' • First order' : ''}
                        {code.isOneTimeUse ? ' • One time' : ''}
                        {code.perCustomerLimit ? ` • ${code.perCustomerLimit}/customer` : ''}
                      </div>
                      <div className="muted-text" style={{ fontSize: 12 }}>
                        {code.startDate ? `Starts ${new Date(code.startDate).toLocaleDateString()}` : 'Starts immediately'}
                        {code.expirationDate ? ` • Ends ${new Date(code.expirationDate).toLocaleDateString()}` : ''}
                      </div>
                    </td>
                    <td>
                      <div>{code.couponStats?.useCount ?? code.usageCount}{code.maxUsages ? ` / ${code.maxUsages}` : ''}</div>
                      <div className="muted-text" style={{ fontSize: 12 }}>{code.couponStats?.customerCount ?? 0} customers</div>
                    </td>
                    <td>
                      <div>${Number(code.couponStats?.totalCostToStudio || 0).toFixed(2)}</div>
                      <div className="muted-text" style={{ fontSize: 12 }}>{code.couponStats?.orderCount ?? 0} orders</div>
                    </td>
                    <td>
                      <span className={`status-badge ${inactive ? 'status-inactive' : 'status-active'}`}>{inactive ? 'Inactive' : 'Active'}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => openEdit(code)} className="btn-icon" title="Edit">✏️</button>
                        <button onClick={() => handleDuplicate(code.id)} className="btn-icon" title="Duplicate">📄</button>
                        <button onClick={() => handleDelete(code.id)} className="btn-icon" title="Delete">🗑️</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {discountCodes.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>No discount codes created yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 860, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2>{editingCode ? 'Edit Discount Code' : 'Create Discount Code'}</h2>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label>Code</label>
                  <input className="form-input" value={form.code} onChange={(e) => setField('code', e.target.value.toUpperCase())} disabled={!!editingCode} />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <input className="form-input" value={form.description} onChange={(e) => setField('description', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Discount Type</label>
                  <select
                    className="form-input"
                    value={form.discountType}
                    onChange={(e) => {
                      const nextType = e.target.value as DiscountCode['discountType'];
                      setField('discountType', nextType);
                      if (nextType === 'free-shipping') {
                        setField('applicationType', 'shipping');
                      } else if (nextType === 'bundle-price') {
                        setField('applicationType', 'specific-products');
                      }
                    }}
                  >
                    <option value="percentage">Percentage</option>
                    <option value="fixed">Fixed amount</option>
                    <option value="bundle-price">Buy X for Y price</option>
                    <option value="free-shipping">Free shipping</option>
                  </select>
                </div>
                {form.discountType !== 'free-shipping' && form.discountType !== 'bundle-price' && (
                  <div className="form-group">
                    <label>Discount Value</label>
                    <input className="form-input" type="number" min="0" step="0.01" value={form.discountValue} onChange={(e) => setField('discountValue', e.target.value)} />
                  </div>
                )}
                {form.discountType === 'bundle-price' && (
                  <>
                    <div className="form-group">
                      <label>Bundle Quantity</label>
                      <input className="form-input" type="number" min="2" step="1" value={form.bundleQuantity} onChange={(e) => setField('bundleQuantity', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Bundle Price</label>
                      <input className="form-input" type="number" min="0" step="0.01" value={form.bundlePrice} onChange={(e) => setField('bundlePrice', e.target.value)} />
                    </div>
                  </>
                )}
                <div className="form-group">
                  <label>Application Scope</label>
                  <select className="form-input" value={form.discountType === 'free-shipping' ? 'shipping' : form.discountType === 'bundle-price' ? 'specific-products' : form.applicationType} onChange={(e) => setField('applicationType', e.target.value as DiscountCode['applicationType'])} disabled={form.discountType === 'free-shipping'}>
                    {form.discountType === 'bundle-price' ? (
                      <option value="specific-products">Specific products</option>
                    ) : (
                      <>
                        <option value="entire-order">Entire order</option>
                        <option value="specific-products">Specific products</option>
                        <option value="specific-categories">Specific categories</option>
                        <option value="specific-albums">Specific albums</option>
                        <option value="shipping">Shipping</option>
                      </>
                    )}
                  </select>
                  {form.discountType === 'bundle-price' && (
                    <div className="muted-text" style={{ marginTop: 6, fontSize: 12 }}>
                      Bundle pricing currently applies to selected products only.
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label>Minimum Subtotal</label>
                  <input className="form-input" type="number" min="0" step="0.01" value={form.minSubtotal} onChange={(e) => setField('minSubtotal', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Start Date</label>
                  <input className="form-input" type="datetime-local" value={form.startDate} onChange={(e) => setField('startDate', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Expiration Date</label>
                  <input className="form-input" type="datetime-local" value={form.expirationDate} onChange={(e) => setField('expirationDate', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Max Uses</label>
                  <input className="form-input" type="number" min="0" step="1" value={form.maxUsages} onChange={(e) => setField('maxUsages', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Per-Customer Limit</label>
                  <input className="form-input" type="number" min="0" step="1" value={form.perCustomerLimit} onChange={(e) => setField('perCustomerLimit', e.target.value)} />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Custom Validation Message</label>
                  <input className="form-input" value={form.validationMessage} onChange={(e) => setField('validationMessage', e.target.value)} placeholder="Optional message when the code doesn't apply" />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
                <label><input type="checkbox" checked={form.isOneTimeUse} onChange={(e) => setField('isOneTimeUse', e.target.checked)} /> One-time use</label>
                <label><input type="checkbox" checked={form.firstOrderOnly} onChange={(e) => setField('firstOrderOnly', e.target.checked)} /> First order only</label>
                <label><input type="checkbox" checked={form.isActive} onChange={(e) => setField('isActive', e.target.checked)} /> Active</label>
              </div>

              {form.discountType !== 'free-shipping' && (form.applicationType === 'specific-products' || form.discountType === 'bundle-price') && (
                <div className="form-group" style={{ marginTop: 20 }}>
                  <label>Applicable Products</label>
                  <input
                    className="form-input"
                    placeholder="Type to search offered products/sizes..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                  />
                  {filteredProductSizeOptions.length > 0 && (
                    <div style={{ marginTop: 8, maxHeight: 180, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10 }}>
                      {filteredProductSizeOptions.map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => {
                            addApplicableProduct(option.productId);
                            setProductSearch('');
                          }}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            background: 'transparent',
                            color: '#fff',
                            border: 'none',
                            borderBottom: '1px solid rgba(255,255,255,0.08)',
                            padding: '10px 12px',
                            cursor: 'pointer',
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {!!productSearch.trim() && filteredProductSizeOptions.length === 0 && (
                    <div className="muted-text" style={{ marginTop: 8, fontSize: 12 }}>
                      No matching offered products for this studio.
                    </div>
                  )}

                  <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {selectedProducts.map((product) => (
                      <span key={product.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 999, padding: '4px 10px' }}>
                        <span>{product.name}</span>
                        <button type="button" className="btn-icon" onClick={() => removeApplicableProduct(product.id)} title="Remove product">✕</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {form.discountType !== 'free-shipping' && form.applicationType === 'specific-categories' && (
                <div className="form-group" style={{ marginTop: 20 }}>
                  <label>Applicable Categories</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, maxHeight: 180, overflowY: 'auto', padding: 12, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10 }}>
                    {categories.map((category) => (
                      <label key={category} style={{ display: 'flex', gap: 8 }}>
                        <input type="checkbox" checked={form.applicableCategoryNames.includes(category)} onChange={() => toggleCategory(category)} />
                        <span>{category}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {form.discountType !== 'free-shipping' && form.applicationType === 'specific-albums' && (
                <div className="form-group" style={{ marginTop: 20 }}>
                  <label>Applicable Albums</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, maxHeight: 220, overflowY: 'auto', padding: 12, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10 }}>
                    {albums.map((album) => (
                      <label key={album.id} style={{ display: 'flex', gap: 8 }}>
                        <input type="checkbox" checked={form.applicableAlbumIds.includes(album.id)} onChange={() => toggleNumber('applicableAlbumIds', album.id)} />
                        <span>{album.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="card" style={{ marginTop: 20 }}>
                <strong>Preview</strong>
                <div className="muted-text" style={{ marginTop: 8 }}>
                  {form.discountType === 'free-shipping' ? 'Free shipping' : form.discountType === 'percentage' ? `${form.discountValue || 0}% off` : form.discountType === 'bundle-price' ? `Bundle applied: ${form.bundleQuantity || 0} for $${Number(form.bundlePrice || 0).toFixed(2)}` : `$${Number(form.discountValue || 0).toFixed(2)} off`} • {form.discountType === 'free-shipping' ? 'Shipping' : form.discountType === 'bundle-price' ? 'specific products' : form.applicationType.replace(/-/g, ' ')}
                  {form.minSubtotal ? ` • Min $${Number(form.minSubtotal).toFixed(2)}` : ''}
                  {form.firstOrderOnly ? ' • First order only' : ''}
                  {form.isOneTimeUse ? ' • One-time use' : ''}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editingCode ? 'Save Changes' : 'Create Discount'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminDiscountCodes;
