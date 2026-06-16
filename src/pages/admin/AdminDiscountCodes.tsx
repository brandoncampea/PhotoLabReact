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
  if (code.discountType === 'bundle-price') return `${code.bundleQuantity || 0} for $${Number(code.bundlePrice || 0).toFixed(2)}`;
  if (code.discountType === 'percentage') return `${code.discountValue}% off`;
  return `$${Number(code.discountValue || 0).toFixed(2)} off`;
};

const formatScope = (code: DiscountCode) => {
  if (code.applicationType === 'entire-order') return 'Entire order';
  if (code.applicationType === 'shipping') return 'Shipping';
  if (code.applicationType === 'specific-products') return `${code.applicableProductIds.length} product${code.applicableProductIds.length !== 1 ? 's' : ''}`;
  if (code.applicationType === 'specific-categories') return `${code.applicableCategoryNames?.length || 0} categories`;
  return `${code.applicableAlbumIds?.length || 0} albums`;
};

// --- Shared style helpers ---
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1.5px solid rgba(124,92,255,0.25)',
  background: 'rgba(0,0,0,0.3)',
  color: '#e0e0f0',
  fontSize: '0.85rem',
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.72rem',
  fontWeight: 700,
  color: '#6b6b80',
  marginBottom: 5,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const formGroup = (span?: '2'): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  gridColumn: span === '2' ? '1 / -1' : undefined,
});

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
          options.push({ key: `${product.id}:${size.id}`, productId: Number(product.id), label, searchText: `${baseName} ${size.name || ''} ${category}`.toLowerCase() });
        }
      } else {
        const priceLabel = Number.isFinite(Number(product.price)) ? ` - $${Number(product.price).toFixed(2)}` : '';
        options.push({ key: `${product.id}:base`, productId: Number(product.id), label: `${baseName}${priceLabel}`, searchText: `${baseName} ${category}`.toLowerCase() });
      }
    }
    return options;
  }, [products]);

  const filteredProductSizeOptions = React.useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const selectedSet = new Set(form.applicableProductIds.map(Number));
    const seenProductIds = new Set<number>();
    const matches = offeredProductSizeOptions.filter((o) => !selectedSet.has(o.productId) && (!q || o.searchText.includes(q) || o.label.toLowerCase().includes(q)));
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
    setForm((prev) => prev.applicableProductIds.includes(productId) ? prev : { ...prev, applicableProductIds: [...prev.applicableProductIds, productId] });
  };
  const removeApplicableProduct = (productId: number) => {
    setForm((prev) => ({ ...prev, applicableProductIds: prev.applicableProductIds.filter((e) => e !== productId) }));
  };

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [codes, albumsResponse] = await Promise.all([discountCodeService.getAll(), api.get<Album[]>('/albums')]);
      const albumsData = Array.isArray(albumsResponse.data) ? albumsResponse.data : [];
      const albumIds = albumsData.map((a) => Number(a.id)).filter((id) => Number.isInteger(id) && id > 0);
      let allProducts: Product[] = [];
      if (albumIds.length > 0) {
        const productsByAlbum = await Promise.all(albumIds.map(async (albumId) => { try { return await productService.getActiveProducts(albumId); } catch { return [] as Product[]; } }));
        const merged = new Map<number, Product>();
        for (const product of productsByAlbum.flat()) {
          const pid = Number(product.id);
          if (!merged.has(pid)) { merged.set(pid, { ...product, sizes: Array.isArray(product.sizes) ? [...product.sizes] : [] }); continue; }
          const existing = merged.get(pid)!;
          const sizeMap = new Map<number, any>();
          [...(existing.sizes || []), ...(product.sizes || [])].forEach((size) => sizeMap.set(Number(size.id), size));
          existing.sizes = Array.from(sizeMap.values());
        }
        allProducts = Array.from(merged.values());
      }
      if (!allProducts.length) allProducts = await productService.getActiveProducts();
      setDiscountCodes(codes);
      setProducts(allProducts);
      setAlbums(albumsData);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load discount codes.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { loadData(); }, [loadData]);

  const openCreate = () => { setEditingCode(null); setForm(defaultFormState); setShowModal(true); };
  const openEdit = (code: DiscountCode) => { setEditingCode(code); setForm(toFormState(code)); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditingCode(null); setForm(defaultFormState); };
  const setField = <K extends keyof DiscountFormState>(key: K, value: DiscountFormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  const toggleNumber = (key: 'applicableProductIds' | 'applicableAlbumIds', value: number) => setForm((prev) => ({ ...prev, [key]: prev[key].includes(value) ? prev[key].filter((e) => e !== value) : [...prev[key], value] }));
  const toggleCategory = (value: string) => setForm((prev) => ({ ...prev, applicableCategoryNames: prev.applicableCategoryNames.includes(value) ? prev.applicableCategoryNames.filter((e) => e !== value) : [...prev.applicableCategoryNames, value] }));

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this discount code?')) return;
    try { await discountCodeService.delete(id); await loadData(); }
    catch (err: any) { setError(err?.response?.data?.error || err?.message || 'Failed to delete discount code.'); }
  };

  const handleDuplicate = async (id: number) => {
    try { await discountCodeService.duplicate(id); await loadData(); }
    catch (err: any) { setError(err?.response?.data?.error || err?.message || 'Failed to duplicate discount code.'); }
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
      if (!payload.code) throw new Error('Code is required.');
      if (form.discountType === 'bundle-price') {
        if (!payload.bundleQuantity || payload.bundleQuantity < 2) throw new Error('Bundle quantity must be at least 2.');
        if (payload.bundlePrice == null || payload.bundlePrice < 0) throw new Error('Bundle price is required.');
        if (!form.applicableProductIds.length) throw new Error('Select at least one applicable product for a bundle deal.');
      }
      if (editingCode) { await discountCodeService.update(editingCode.id, payload); } else { await discountCodeService.create(payload); }
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
      <div style={{ padding: '0 1rem 2rem' }}>

        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#fff', margin: '0 0 0.25rem', letterSpacing: '-0.01em' }}>Discount Codes</h1>
            <p style={{ color: '#6b6b80', fontSize: '0.9rem', margin: 0 }}>
              {discountCodes.length} code{discountCodes.length !== 1 ? 's' : ''} · Create and manage promotional discount codes
            </p>
          </div>
          <button
            onClick={openCreate}
            style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#7c5cff,#6366f1)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', flexShrink: 0 }}
          >
            + Create Discount Code
          </button>
        </div>

        {/* Error bar */}
        {error && (
          <div style={{ padding: '9px 14px', borderRadius: 8, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#fca5a5', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            {error}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div style={{ color: '#5a5a72', padding: '3rem', textAlign: 'center' }}>Loading discount codes…</div>
        ) : discountCodes.length === 0 ? (
          <div style={{ color: '#4a4a6a', textAlign: 'center', padding: '3rem', fontSize: '0.95rem' }}>
            No discount codes yet. Create one to get started.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {discountCodes.map((code) => {
              const inactive = !code.isActive || isExpired(code.expirationDate) || isMaxedOut(code);
              const useCount = code.couponStats?.useCount ?? code.usageCount ?? 0;
              const usePct = code.maxUsages ? Math.min(100, Math.round((useCount / code.maxUsages) * 100)) : null;

              return (
                <div
                  key={code.id}
                  style={{
                    background: 'rgba(22,22,35,0.95)',
                    border: `1px solid ${inactive ? 'rgba(255,255,255,0.06)' : 'rgba(124,92,255,0.18)'}`,
                    borderRadius: 12,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    opacity: inactive ? 0.7 : 1,
                    transition: 'border-color 0.2s',
                  }}
                >
                  {/* Card header */}
                  <div style={{ padding: '0.9rem 1rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.1rem', color: '#fff', letterSpacing: '0.04em' }}>
                        {code.code}
                      </span>
                      <span style={{
                        fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', borderRadius: 999,
                        background: inactive ? 'rgba(90,90,110,0.4)' : 'rgba(34,197,94,0.15)',
                        color: inactive ? '#5a5a72' : '#7ee787',
                        border: `1px solid ${inactive ? 'rgba(90,90,110,0.3)' : 'rgba(34,197,94,0.3)'}`,
                      }}>
                        {inactive ? (isExpired(code.expirationDate) ? 'Expired' : isMaxedOut(code) ? 'Maxed out' : 'Inactive') : 'Active'}
                      </span>
                    </div>
                    {code.description && (
                      <div style={{ fontSize: '0.78rem', color: '#5a5a72', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{code.description}</div>
                    )}
                  </div>

                  {/* Stats body */}
                  <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>

                    {/* Offer + scope */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'rgba(124,92,255,0.15)', color: '#a78bfa', border: '1px solid rgba(124,92,255,0.25)' }}>
                        {formatDiscount(code)}
                      </span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: 'rgba(121,192,255,0.1)', color: '#79c0ff', border: '1px solid rgba(121,192,255,0.2)' }}>
                        {formatScope(code)}
                      </span>
                    </div>

                    {/* Usage */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#6b6b80', marginBottom: usePct !== null ? 4 : 0 }}>
                        <span>{useCount} use{useCount !== 1 ? 's' : ''}{code.maxUsages ? ` / ${code.maxUsages} max` : ''}</span>
                        <span>{code.couponStats?.customerCount ?? 0} customer{(code.couponStats?.customerCount ?? 0) !== 1 ? 's' : ''}</span>
                      </div>
                      {usePct !== null && (
                        <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${usePct}%`, height: '100%', background: usePct >= 90 ? '#f87171' : '#a78bfa', transition: 'width 0.3s' }} />
                        </div>
                      )}
                    </div>

                    {/* Impact */}
                    <div style={{ fontSize: '0.75rem', color: '#5a5a72', display: 'flex', gap: 12 }}>
                      <span style={{ color: '#ffa657' }}>${Number(code.couponStats?.totalCostToStudio || 0).toFixed(2)} cost</span>
                      <span>{code.couponStats?.orderCount ?? 0} order{(code.couponStats?.orderCount ?? 0) !== 1 ? 's' : ''}</span>
                    </div>

                    {/* Rules */}
                    <div style={{ fontSize: '0.72rem', color: '#4a4a6a', display: 'flex', flexWrap: 'wrap', gap: '3px 10px' }}>
                      {code.minSubtotal ? <span>Min ${Number(code.minSubtotal).toFixed(2)}</span> : null}
                      {code.firstOrderOnly ? <span>First order</span> : null}
                      {code.isOneTimeUse ? <span>One-time use</span> : null}
                      {code.perCustomerLimit ? <span>{code.perCustomerLimit}/customer</span> : null}
                      {code.expirationDate ? <span>Ends {new Date(code.expirationDate).toLocaleDateString()}</span> : null}
                      {code.startDate && !code.expirationDate ? <span>Starts {new Date(code.startDate).toLocaleDateString()}</span> : null}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ padding: '0.6rem 1rem 0.75rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 6 }}>
                    {[
                      { label: 'Edit', color: '#a78bfa', onClick: () => openEdit(code) },
                      { label: 'Duplicate', color: '#79c0ff', onClick: () => handleDuplicate(code.id) },
                      { label: 'Delete', color: '#f87171', onClick: () => handleDelete(code.id) },
                    ].map(({ label, color, onClick }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={onClick}
                        style={{ flex: 1, padding: '5px 0', fontSize: '0.72rem', fontWeight: 700, borderRadius: 6, border: `1.5px solid ${color}33`, background: `${color}12`, color, cursor: 'pointer' }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Create / Edit modal */}
        {showModal && (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
            onClick={closeModal}
          >
            <div
              style={{ background: 'rgba(18,18,28,0.99)', border: '1px solid rgba(124,92,255,0.25)', color: '#fff', borderRadius: 14, padding: '1.75rem', width: 'min(860px,96vw)', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>{editingCode ? 'Edit Discount Code' : 'Create Discount Code'}</h2>
                <button onClick={closeModal} style={{ background: 'none', border: 'none', color: '#5a5a72', fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1 }}>&times;</button>
              </div>

              {error && (
                <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#fca5a5', fontSize: '0.82rem', marginBottom: '1rem' }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

                  <div style={formGroup()}>
                    <label style={labelStyle}>Code</label>
                    <input style={inputStyle} value={form.code} onChange={(e) => setField('code', e.target.value.toUpperCase())} disabled={!!editingCode} placeholder="e.g. SUMMER10" />
                  </div>

                  <div style={formGroup()}>
                    <label style={labelStyle}>Description</label>
                    <input style={inputStyle} value={form.description} onChange={(e) => setField('description', e.target.value)} placeholder="Optional internal note" />
                  </div>

                  <div style={formGroup()}>
                    <label style={labelStyle}>Discount Type</label>
                    <select
                      style={inputStyle}
                      value={form.discountType}
                      onChange={(e) => {
                        const nextType = e.target.value as DiscountCode['discountType'];
                        setField('discountType', nextType);
                        if (nextType === 'free-shipping') setField('applicationType', 'shipping');
                        else if (nextType === 'bundle-price') setField('applicationType', 'specific-products');
                      }}
                    >
                      <option value="percentage">Percentage</option>
                      <option value="fixed">Fixed amount</option>
                      <option value="bundle-price">Buy X for Y price</option>
                      <option value="free-shipping">Free shipping</option>
                    </select>
                  </div>

                  {form.discountType !== 'free-shipping' && form.discountType !== 'bundle-price' && (
                    <div style={formGroup()}>
                      <label style={labelStyle}>Discount Value</label>
                      <input style={inputStyle} type="number" min="0" step="0.01" value={form.discountValue} onChange={(e) => setField('discountValue', e.target.value)} />
                    </div>
                  )}

                  {form.discountType === 'bundle-price' && (
                    <>
                      <div style={formGroup()}>
                        <label style={labelStyle}>Bundle Quantity</label>
                        <input style={inputStyle} type="number" min="2" step="1" value={form.bundleQuantity} onChange={(e) => setField('bundleQuantity', e.target.value)} />
                      </div>
                      <div style={formGroup()}>
                        <label style={labelStyle}>Bundle Price ($)</label>
                        <input style={inputStyle} type="number" min="0" step="0.01" value={form.bundlePrice} onChange={(e) => setField('bundlePrice', e.target.value)} />
                      </div>
                    </>
                  )}

                  <div style={formGroup()}>
                    <label style={labelStyle}>Application Scope</label>
                    <select
                      style={inputStyle}
                      value={form.discountType === 'free-shipping' ? 'shipping' : form.discountType === 'bundle-price' ? 'specific-products' : form.applicationType}
                      onChange={(e) => setField('applicationType', e.target.value as DiscountCode['applicationType'])}
                      disabled={form.discountType === 'free-shipping'}
                    >
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
                      <div style={{ marginTop: 5, fontSize: '0.72rem', color: '#5a5a72' }}>Bundle pricing applies to selected products only.</div>
                    )}
                  </div>

                  <div style={formGroup()}>
                    <label style={labelStyle}>Minimum Subtotal ($)</label>
                    <input style={inputStyle} type="number" min="0" step="0.01" value={form.minSubtotal} onChange={(e) => setField('minSubtotal', e.target.value)} placeholder="No minimum" />
                  </div>

                  <div style={formGroup()}>
                    <label style={labelStyle}>Start Date</label>
                    <input style={inputStyle} type="datetime-local" value={form.startDate} onChange={(e) => setField('startDate', e.target.value)} />
                  </div>

                  <div style={formGroup()}>
                    <label style={labelStyle}>Expiration Date</label>
                    <input style={inputStyle} type="datetime-local" value={form.expirationDate} onChange={(e) => setField('expirationDate', e.target.value)} />
                  </div>

                  <div style={formGroup()}>
                    <label style={labelStyle}>Max Uses</label>
                    <input style={inputStyle} type="number" min="0" step="1" value={form.maxUsages} onChange={(e) => setField('maxUsages', e.target.value)} placeholder="Unlimited" />
                  </div>

                  <div style={formGroup()}>
                    <label style={labelStyle}>Per-Customer Limit</label>
                    <input style={inputStyle} type="number" min="0" step="1" value={form.perCustomerLimit} onChange={(e) => setField('perCustomerLimit', e.target.value)} placeholder="Unlimited" />
                  </div>

                  <div style={formGroup('2')}>
                    <label style={labelStyle}>Custom Validation Message</label>
                    <input style={inputStyle} value={form.validationMessage} onChange={(e) => setField('validationMessage', e.target.value)} placeholder="Optional message when the code doesn't apply" />
                  </div>
                </div>

                {/* Toggles */}
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 14, padding: '12px 14px', background: 'rgba(124,92,255,0.05)', borderRadius: 8, border: '1px solid rgba(124,92,255,0.12)' }}>
                  {[
                    { key: 'isOneTimeUse' as const, label: 'One-time use' },
                    { key: 'firstOrderOnly' as const, label: 'First order only' },
                    { key: 'isActive' as const, label: 'Active' },
                  ].map(({ key, label }) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem', color: '#c9c9e0', userSelect: 'none' }}>
                      <input type="checkbox" checked={form[key] as boolean} onChange={(e) => setField(key, e.target.checked)} style={{ accentColor: '#7c5cff', width: 15, height: 15 }} />
                      {label}
                    </label>
                  ))}
                </div>

                {/* Product picker */}
                {form.discountType !== 'free-shipping' && (form.applicationType === 'specific-products' || form.discountType === 'bundle-price') && (
                  <div style={{ marginTop: 18 }}>
                    <label style={labelStyle}>Applicable Products</label>
                    <input
                      style={inputStyle}
                      placeholder="Type to search products…"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                    />
                    {filteredProductSizeOptions.length > 0 && (
                      <div style={{ marginTop: 6, maxHeight: 180, overflowY: 'auto', border: '1px solid rgba(124,92,255,0.2)', borderRadius: 8, background: 'rgba(10,10,20,0.9)' }}>
                        {filteredProductSizeOptions.map((option) => (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => { addApplicableProduct(option.productId); setProductSearch(''); }}
                            style={{ width: '100%', textAlign: 'left', background: 'transparent', color: '#d4d4e8', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '9px 12px', cursor: 'pointer', fontSize: '0.82rem' }}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {!!productSearch.trim() && filteredProductSizeOptions.length === 0 && (
                      <div style={{ marginTop: 6, fontSize: '0.75rem', color: '#5a5a72' }}>No matching products found.</div>
                    )}
                    <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                      {selectedProducts.map((product) => (
                        <span key={product.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(124,92,255,0.15)', border: '1px solid rgba(124,92,255,0.3)', color: '#c4b5fd', borderRadius: 999, padding: '4px 10px', fontSize: '0.78rem', fontWeight: 600 }}>
                          {product.name}
                          <button type="button" onClick={() => removeApplicableProduct(product.id)} style={{ background: 'none', border: 'none', color: '#7c5cff', cursor: 'pointer', fontSize: '0.85rem', lineHeight: 1, padding: 0 }}>✕</button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Category picker */}
                {form.discountType !== 'free-shipping' && form.applicationType === 'specific-categories' && (
                  <div style={{ marginTop: 18 }}>
                    <label style={labelStyle}>Applicable Categories</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, maxHeight: 180, overflowY: 'auto', padding: 12, border: '1px solid rgba(124,92,255,0.2)', borderRadius: 8, background: 'rgba(10,10,20,0.5)' }}>
                      {categories.map((category) => (
                        <label key={category} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem', color: '#c9c9e0' }}>
                          <input type="checkbox" checked={form.applicableCategoryNames.includes(category)} onChange={() => toggleCategory(category)} style={{ accentColor: '#7c5cff' }} />
                          {category}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Album picker */}
                {form.discountType !== 'free-shipping' && form.applicationType === 'specific-albums' && (
                  <div style={{ marginTop: 18 }}>
                    <label style={labelStyle}>Applicable Albums</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, maxHeight: 220, overflowY: 'auto', padding: 12, border: '1px solid rgba(124,92,255,0.2)', borderRadius: 8, background: 'rgba(10,10,20,0.5)' }}>
                      {albums.map((album) => (
                        <label key={album.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem', color: '#c9c9e0' }}>
                          <input type="checkbox" checked={form.applicableAlbumIds.includes(album.id)} onChange={() => toggleNumber('applicableAlbumIds', album.id)} style={{ accentColor: '#7c5cff' }} />
                          {album.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preview */}
                <div style={{ marginTop: 18, padding: '12px 14px', background: 'rgba(124,92,255,0.06)', border: '1px solid rgba(124,92,255,0.15)', borderRadius: 8 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b6b80', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Preview</div>
                  <div style={{ fontSize: '0.85rem', color: '#a78bfa', fontWeight: 600 }}>
                    {form.discountType === 'free-shipping' ? 'Free shipping' : form.discountType === 'percentage' ? `${form.discountValue || 0}% off` : form.discountType === 'bundle-price' ? `Bundle: ${form.bundleQuantity || 0} for $${Number(form.bundlePrice || 0).toFixed(2)}` : `$${Number(form.discountValue || 0).toFixed(2)} off`}
                    {' · '}
                    <span style={{ color: '#79c0ff' }}>
                      {form.discountType === 'free-shipping' ? 'Shipping' : form.discountType === 'bundle-price' ? 'specific products' : form.applicationType.replace(/-/g, ' ')}
                    </span>
                    {form.minSubtotal ? <span style={{ color: '#6b6b80' }}> · Min ${Number(form.minSubtotal).toFixed(2)}</span> : ''}
                    {form.firstOrderOnly ? <span style={{ color: '#6b6b80' }}> · First order only</span> : ''}
                    {form.isOneTimeUse ? <span style={{ color: '#6b6b80' }}> · One-time use</span> : ''}
                  </div>
                </div>

                {/* Footer buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                  <button
                    type="button"
                    onClick={closeModal}
                    style={{ padding: '9px 20px', borderRadius: 8, border: '1.5px solid rgba(255,255,255,0.1)', background: 'none', color: '#6b6b80', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#7c5cff,#6366f1)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
                  >
                    {saving ? 'Saving…' : editingCode ? 'Save Changes' : 'Create Discount'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminDiscountCodes;
