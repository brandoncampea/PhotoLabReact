import React, { useEffect, useState, useCallback } from 'react';
import { studioPriceListService } from '../../services/studioPriceListService';
import { packageService } from '../../services/packageService';
import { useAuth } from '../../contexts/AuthContext';

// ── Styles ────────────────────────────────────────────────────────────────────
const card: React.CSSProperties = { background: '#23232a', border: '1px solid #3a3656', borderRadius: 16, padding: '1.5rem', marginBottom: '1.25rem' };
const inp: React.CSSProperties = { width: '100%', background: '#18181f', border: '1px solid #3a3656', borderRadius: 8, color: '#e0e0e0', padding: '8px 12px', fontSize: '0.92rem', boxSizing: 'border-box' };
const lbl: React.CSSProperties = { display: 'block', marginBottom: 5, fontWeight: 600, color: '#bdbdbd', fontSize: '0.82rem' };
const btn = (bg = '#7c5cff', disabled = false): React.CSSProperties => ({ padding: '7px 16px', background: disabled ? '#333' : bg, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.85rem', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 });
const sectionTitle: React.CSSProperties = { fontWeight: 800, fontSize: '1.05rem', color: '#e0e0e0', marginBottom: '0.25rem' };
const subtitleText: React.CSSProperties = { color: '#6b6b80', fontSize: '0.82rem' };

// ── Types ─────────────────────────────────────────────────────────────────────
type ProdVariant = { id: number | null; name: string; price: number; cost: number };
type ProdSize    = { id: number; name: string; price: number; cost: number; variants: ProdVariant[] };
type Product     = { id: number; name: string; category: string; sizes: ProdSize[] };
type FormItem    = { productId: number; productSizeId: number; quantity: number; variantId?: number | null };
type SavedPkg    = { id: number; name: string; description: string | null; packagePrice: number; isActive: boolean; priceListId: number; items: FormItem[] };

// ── Template suggestions ──────────────────────────────────────────────────────
const TEMPLATES = [
  { icon: '💻', name: 'Digital Only',      desc: '1 digital download — great entry-level option',        matchKw: ['digital'],                    suggestedMultiplier: 3.0 },
  { icon: '🖼️', name: 'Classic Prints',    desc: '1 large + 2 wallet prints — the timeless bundle',      matchKw: ['8x10', '4x6', 'wallet'],      suggestedMultiplier: 2.5 },
  { icon: '⭐', name: 'Memory Pack',        desc: 'Prints + digital download — most popular combo',       matchKw: ['8x10', 'digital'],             suggestedMultiplier: 2.5 },
  { icon: '🏆', name: 'Premium Collection', desc: 'Prints + digital + keepsakes — your highest value',   matchKw: ['8x10', '4x6', 'digital', 'button'], suggestedMultiplier: 2.2 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtCurrency = (n: number) => `$${Number(n).toFixed(2)}`;

function resolveItemPrice(item: FormItem, products: Product[]): number {
  const prod = products.find(p => p.id === item.productId);
  const size = prod?.sizes.find(s => s.id === item.productSizeId);
  if (!size) return 0;
  if (size.variants.length > 0) {
    const v = item.variantId != null
      ? (size.variants.find(v => v.id === item.variantId) ?? size.variants[0])
      : size.variants[0];
    return (v?.price ?? size.price) * item.quantity;
  }
  return size.price * item.quantity;
}

function calcRetailTotal(items: FormItem[], products: Product[]): number {
  return items.reduce((sum, item) => sum + resolveItemPrice(item, products), 0);
}

function resolveItemCost(item: FormItem, products: Product[]): number {
  const prod = products.find(p => p.id === item.productId);
  const size = prod?.sizes.find(s => s.id === item.productSizeId);
  if (!size) return 0;
  if (size.variants.length > 0) {
    const v = item.variantId != null
      ? (size.variants.find(v => v.id === item.variantId) ?? size.variants[0])
      : size.variants[0];
    return (v?.cost ?? size.cost) * item.quantity;
  }
  return size.cost * item.quantity;
}

// ── Main Component ────────────────────────────────────────────────────────────
const AdminPackagesPage: React.FC = () => {
  const { user } = useAuth();
  const token = localStorage.getItem('authToken');
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const effectiveStudioId = Number(localStorage.getItem('viewAsStudioId') || user?.studioId || 0);

  const [priceLists, setPriceLists]       = useState<any[]>([]);
  const [selectedPLId, setSelectedPLId]   = useState<number | null>(null);
  const [products, setProducts]           = useState<Product[]>([]);
  const [packages, setPackages]           = useState<SavedPkg[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState('');
  const [success, setSuccess]             = useState('');

  // Form state
  const [showForm, setShowForm]           = useState(false);
  const [editingId, setEditingId]         = useState<number | null>(null);
  const [formName, setFormName]           = useState('');
  const [formDesc, setFormDesc]           = useState('');
  const [formPrice, setFormPrice]         = useState('');
  const [formItems, setFormItems]         = useState<FormItem[]>([]);
  const [itemSearch, setItemSearch]       = useState('');
  const [saving, setSaving]               = useState(false);

  // ── Load price lists ──
  useEffect(() => {
    if (!effectiveStudioId) return;
    studioPriceListService.getLists(effectiveStudioId)
      .then((data: any[]) => {
        const lists = Array.isArray(data) ? data : [];
        setPriceLists(lists);
        if (lists.length > 0) setSelectedPLId(lists[0].id);
      })
      .catch(() => setError('Failed to load price lists'))
      .finally(() => setLoading(false));
  }, [effectiveStudioId]);

  // ── Load products + packages when price list changes ──
  const loadData = useCallback(async () => {
    if (!selectedPLId) return;
    setLoading(true);
    try {
      const [items, pkgs] = await Promise.all([
        studioPriceListService.getItems(selectedPLId),
        packageService.getAll(selectedPLId),
      ]);
      const offered = (items || []).filter((i: any) => !!i.is_offered);
const grouped: Record<number, Product> = {};
      offered.forEach((item: any) => {
        if (!grouped[item.product_id]) grouped[item.product_id] = { id: item.product_id, name: item.product_name, category: item.product_category || 'Uncategorized', sizes: [] };
        const itemFlatPrice = Number(item.price) || 0;
        const flatBaseCost  = Number(item.base_cost) || 0;
        // For percentage-priced digital items the cost is a % of the studio's price
        const itemBaseCost = flatBaseCost > 0
          ? flatBaseCost
          : (item.digital_pricing_mode === 'percentage' && Number(item.super_admin_percentage) > 0 && itemFlatPrice > 0
              ? Number((itemFlatPrice * Number(item.super_admin_percentage) / 100).toFixed(2))
              : 0);
        const activeRawVariants = (item.studioWhccVariants || []).filter((v: any) => !!v.isActive);
        const variantFallbackPrice = activeRawVariants
          .map((v: any) => Number(v.studioPrice))
          .find((p: number) => p > 0) ?? 0;
        const studioPrice = itemFlatPrice > 0 ? itemFlatPrice : variantFallbackPrice;
        const activeVariants: ProdVariant[] = activeRawVariants
          .map((v: any) => ({
            id: v.id ?? null,
            name: String(v.displayName || ''),
            price: Number(v.studioPrice ?? v.baseCost ?? studioPrice) || studioPrice,
            cost: Number(v.price ?? v.baseCost) || itemBaseCost,
          }));
        grouped[item.product_id].sizes.push({
          id: item.product_size_id,
          name: item.size_name,
          price: studioPrice,
          cost: itemBaseCost,
          variants: activeVariants,
        });
      });
      setProducts(Object.values(grouped));
      setPackages(Array.isArray(pkgs) ? pkgs : []);
    } catch { setError('Failed to load data'); }
    finally { setLoading(false); }
  }, [selectedPLId]);

  useEffect(() => { loadData(); }, [loadData]);

  const flash = (msg: string, isErr = false) => {
    if (isErr) setError(msg); else setSuccess(msg);
    setTimeout(() => { setError(''); setSuccess(''); }, 4000);
  };

  // ── Form helpers ──
  const openNew = (prefill?: { name: string; price: string }) => {
    setEditingId(null);
    setFormName(prefill?.name ?? '');
    setFormDesc('');
    setFormPrice(prefill?.price ?? '');
    setFormItems([]);
    setItemSearch('');
    setShowForm(true);
    setTimeout(() => document.getElementById('pkg-name-input')?.focus(), 50);
  };

  const openEdit = (pkg: SavedPkg) => {
    setEditingId(pkg.id);
    setFormName(pkg.name);
    setFormDesc(pkg.description ?? '');
    setFormPrice(String(pkg.packagePrice));
    setFormItems(pkg.items.map(i => ({ productId: i.productId, productSizeId: i.productSizeId, quantity: i.quantity, variantId: i.variantId ?? null })));
    setItemSearch('');
    setShowForm(true);
  };

  const cancelForm = () => { setShowForm(false); setEditingId(null); };

  const applyTemplate = (tmpl: typeof TEMPLATES[number]) => {
    // Try to match items from available products by keyword
    const kw = tmpl.matchKw;
    const matched: FormItem[] = [];
    kw.forEach(k => {
      for (const p of products) {
        if (p.name.toLowerCase().includes(k)) {
          const size = p.sizes[0];
          if (size && !matched.some(m => m.productId === p.id)) {
            const defVariant = size.variants.length > 0 ? (size.variants.find(v => v.id != null) ?? size.variants[0]) : null;
            matched.push({ productId: p.id, productSizeId: size.id, quantity: 1, variantId: defVariant?.id ?? null });
            break;
          }
        }
      }
    });
    const cost = calcRetailTotal(matched, products);
    const suggested = cost > 0 ? (cost * tmpl.suggestedMultiplier).toFixed(2) : '';
    setEditingId(null);
    setFormName(tmpl.name);
    setFormDesc(tmpl.desc);
    setFormPrice(suggested);
    setFormItems(matched);
    setItemSearch('');
    setShowForm(true);
  };

  const toggleItem = (productId: number, productSizeId: number, size: ProdSize) => {
    setFormItems(prev => {
      const exists = prev.find(i => i.productId === productId && i.productSizeId === productSizeId);
      if (exists) return prev.filter(i => !(i.productId === productId && i.productSizeId === productSizeId));
      const defaultVariant = size.variants.length === 1 ? size.variants[0] : size.variants.find(v => v.id != null);
      return [...prev, { productId, productSizeId, quantity: 1, variantId: defaultVariant?.id ?? null }];
    });
  };

  const setQty = (productId: number, productSizeId: number, qty: number) => {
    setFormItems(prev => prev.map(i => i.productId === productId && i.productSizeId === productSizeId ? { ...i, quantity: Math.max(1, qty) } : i));
  };

  const setVariant = (productId: number, productSizeId: number, variantId: number | null) => {
    setFormItems(prev => prev.map(i => i.productId === productId && i.productSizeId === productSizeId ? { ...i, variantId } : i));
  };

  const savePackage = async () => {
    if (!formName.trim()) { flash('Package name is required', true); return; }
    if (formItems.length === 0) { flash('Add at least one item', true); return; }
    if (!selectedPLId) return;
    setSaving(true);
    try {
      const payload = { priceListId: selectedPLId, name: formName.trim(), description: formDesc || null, packagePrice: Number(formPrice) || 0, items: formItems, isActive: true };
      if (editingId) await packageService.update(editingId, payload);
      else await packageService.create(payload);
      flash(editingId ? 'Package updated' : 'Package created');
      cancelForm();
      loadData();
    } catch (e: any) {
      flash(e?.response?.data?.error || 'Failed to save package', true);
    } finally { setSaving(false); }
  };

  const deletePackage = async (id: number) => {
    if (!confirm('Delete this package?')) return;
    try { await packageService.delete(id); flash('Package deleted'); loadData(); }
    catch { flash('Failed to delete', true); }
  };

  // ── Derived ──
  const retailTotal    = formItems.reduce((sum, item) => sum + resolveItemPrice(item, products), 0);
  const studioCostTotal = formItems.reduce((sum, item) => sum + resolveItemCost(item, products), 0);
  const priceNum       = Number(formPrice) || 0;
  const studioProfit   = priceNum > 0 ? priceNum - studioCostTotal : 0;
  const profitPct      = priceNum > 0 ? (studioProfit / priceNum) * 100 : 0;
  const customerSavings = retailTotal > 0 && priceNum > 0 ? retailTotal - priceNum : 0;
  const savingsPct      = retailTotal > 0 && customerSavings > 0 ? (customerSavings / retailTotal) * 100 : 0;
  // Suggest 85% of retail — customer saves 15%
  const suggestedPrice = retailTotal > 0 ? (retailTotal * 0.85).toFixed(2) : '';

  const allSizes = products.flatMap(p => p.sizes.map(s => ({ ...s, productId: p.id, productName: p.name, category: p.category })));
  const filteredSizes = itemSearch.trim()
    ? allSizes.filter(s => s.productName.toLowerCase().includes(itemSearch.toLowerCase()) || s.name.toLowerCase().includes(itemSearch.toLowerCase()) || s.category.toLowerCase().includes(itemSearch.toLowerCase()))
    : allSizes;

  // Group filtered sizes by category
  const grouped = filteredSizes.reduce<Record<string, typeof filteredSizes>>((acc, s) => {
    (acc[s.category] = acc[s.category] || []).push(s);
    return acc;
  }, {});

  if (loading && !priceLists.length) return <div style={{ padding: 40, color: '#a1a1aa' }}>Loading…</div>;

  return (
    <div style={{ minHeight: '100vh', background: '#181a1b', padding: '2.5rem 1.5rem 4rem' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontWeight: 800, fontSize: '1.6rem', background: 'linear-gradient(90deg,#a78bfa,#6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Packages</h1>
            <p style={{ margin: '0.2rem 0 0', color: '#6b6b80', fontSize: '0.88rem' }}>Bundle products into ready-to-buy packages for your customers</p>
          </div>
          {!showForm && (
            <button style={btn()} onClick={() => openNew()}>+ New Package</button>
          )}
        </div>

        {error   && <div style={{ background: '#2d1a1a', color: '#ffb3b3', borderRadius: 10, padding: '10px 16px', marginBottom: 14 }}>{error}</div>}
        {success && <div style={{ background: '#1a2d1e', color: '#a3ffb3', borderRadius: 10, padding: '10px 16px', marginBottom: 14 }}>{success}</div>}

        {/* Price list selector */}
        {priceLists.length > 1 && (
          <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ ...lbl, marginBottom: 0 }}>Price List:</label>
            <select style={{ ...inp, width: 'auto' }} value={selectedPLId ?? ''} onChange={e => setSelectedPLId(Number(e.target.value))}>
              {priceLists.map(pl => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
            </select>
          </div>
        )}
        {priceLists.length === 0 && !loading && (
          <div style={{ ...card, color: '#6b6b80' }}>No price lists found. Create a price list first before adding packages.</div>
        )}

        {selectedPLId && (
          <>
            {/* ── Template suggestions ── */}
            {!showForm && (
              <div style={{ ...card, marginBottom: '1.75rem' }}>
                <div style={sectionTitle}>Start from a template</div>
                <div style={{ ...subtitleText, marginBottom: '1rem' }}>Click a template to pre-fill the form — items are matched from your price list</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '0.75rem' }}>
                  {TEMPLATES.map(t => (
                    <button key={t.name} onClick={() => applyTemplate(t)} style={{ background: 'rgba(124,92,255,0.07)', border: '1px solid rgba(124,92,255,0.2)', borderRadius: 12, padding: '1rem', textAlign: 'left', cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#7c5cff'; (e.currentTarget as HTMLElement).style.background = 'rgba(124,92,255,0.14)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(124,92,255,0.2)'; (e.currentTarget as HTMLElement).style.background = 'rgba(124,92,255,0.07)'; }}>
                      <div style={{ fontSize: '1.5rem', marginBottom: '0.4rem' }}>{t.icon}</div>
                      <div style={{ fontWeight: 700, color: '#e0e0e0', fontSize: '0.9rem', marginBottom: '0.3rem' }}>{t.name}</div>
                      <div style={{ color: '#6b6b80', fontSize: '0.78rem', lineHeight: 1.4 }}>{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Create / Edit form ── */}
            {showForm && (
              <div style={{ ...card, border: '1px solid rgba(124,92,255,0.3)', marginBottom: '1.75rem' }}>
                <div style={{ fontWeight: 800, color: '#a78bfa', marginBottom: '1.25rem', fontSize: '1.05rem' }}>
                  {editingId ? '✏️ Edit Package' : '✨ New Package'}
                </div>

                {/* Name + description */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={lbl}>Package Name *</label>
                    <input id="pkg-name-input" style={inp} value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Classic Print Package" />
                  </div>
                  <div>
                    <label style={lbl}>Description (shown to customers)</label>
                    <input style={inp} value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Optional short description" />
                  </div>
                </div>

                {/* Two-column layout: item picker + cost panel */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1.25rem', alignItems: 'start' }}>

                  {/* Item picker */}
                  <div>
                    <label style={lbl}>Add Items</label>
                    <input style={{ ...inp, marginBottom: '0.6rem' }} value={itemSearch} onChange={e => setItemSearch(e.target.value)} placeholder="Search products or sizes…" />
                    {products.length === 0
                      ? <div style={{ color: '#6b6b80', fontSize: '0.85rem' }}>No offered products in this price list.</div>
                      : (
                        <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid #3a3656', borderRadius: 10 }}>
                          {Object.entries(grouped).map(([cat, sizes]) => (
                            <div key={cat}>
                              <div style={{ background: '#1a1a28', padding: '6px 12px', fontSize: '0.72rem', fontWeight: 800, color: '#6b6b80', textTransform: 'uppercase', letterSpacing: '0.07em', position: 'sticky', top: 0 }}>{cat}</div>
                              {sizes.map(s => {
                                const formEntry = formItems.find(i => i.productId === s.productId && i.productSizeId === s.id);
                                const checked = !!formEntry;
                                const qty = formEntry?.quantity ?? 1;
                                const selectedVariantId = formEntry?.variantId ?? null;
                                const hasVariants = s.variants.length > 1;
                                const displayPrice = hasVariants
                                  ? (s.variants.find(v => v.id === selectedVariantId) ?? s.variants[0])?.price ?? s.price
                                  : s.variants.length === 1 ? s.variants[0].price : s.price;
                                return (
                                  <div key={`${s.productId}-${s.id}`} style={{ borderBottom: '1px solid #23232a', background: checked ? 'rgba(124,92,255,0.08)' : 'transparent', transition: 'background 0.1s' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '7px 12px', cursor: 'pointer' }}>
                                      <input type="checkbox" checked={checked} onChange={() => toggleItem(s.productId, s.id, s)} style={{ width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }} />
                                      <span style={{ flex: 1, color: checked ? '#e0e0e0' : '#bdbdbd', fontSize: '0.85rem' }}>{s.productName} <span style={{ color: '#6b6b80' }}>· {s.name}</span></span>
                                      <span style={{ color: '#a78bfa', fontSize: '0.8rem', flexShrink: 0 }}>{fmtCurrency(displayPrice)}</span>
                                      {checked && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                          <button type="button" onClick={e => { e.preventDefault(); setQty(s.productId, s.id, qty - 1); }} style={{ width: 22, height: 22, borderRadius: 4, background: '#3a3656', border: 'none', color: '#e0e0e0', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                                          <span style={{ color: '#a78bfa', fontWeight: 700, fontSize: '0.85rem', minWidth: 16, textAlign: 'center' }}>{qty}</span>
                                          <button type="button" onClick={e => { e.preventDefault(); setQty(s.productId, s.id, qty + 1); }} style={{ width: 22, height: 22, borderRadius: 4, background: '#3a3656', border: 'none', color: '#e0e0e0', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                                        </div>
                                      )}
                                    </label>
                                    {checked && hasVariants && (
                                      <div style={{ padding: '0 12px 8px 34px' }}>
                                        <select
                                          value={selectedVariantId ?? s.variants[0]?.id ?? ''}
                                          onChange={e => setVariant(s.productId, s.id, Number(e.target.value) || null)}
                                          style={{ background: '#23232a', border: '1px solid #3a3656', borderRadius: 6, color: '#e0e0e0', padding: '4px 8px', fontSize: '0.8rem', width: '100%' }}
                                          onClick={e => e.stopPropagation()}
                                        >
                                          {s.variants.map(v => (
                                            <option key={v.id ?? v.name} value={v.id ?? ''}>
                                              {v.name} — {fmtCurrency(v.price)}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      )
                    }
                  </div>

                  {/* Cost / price panel */}
                  <div style={{ background: '#13131c', border: '1px solid #3a3656', borderRadius: 12, padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ fontWeight: 700, color: '#a78bfa', fontSize: '0.88rem', marginBottom: '0.25rem' }}>Package Summary</div>

                    {/* Selected items — show retail price per line */}
                    {formItems.length === 0
                      ? <div style={{ color: '#4a4a6a', fontSize: '0.82rem', fontStyle: 'italic' }}>No items selected yet</div>
                      : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          {formItems.map(item => {
                            const p = products.find(p => p.id === item.productId);
                            const s = p?.sizes.find(s => s.id === item.productSizeId);
                            const variant = s && s.variants.length > 1
                              ? (s.variants.find(v => v.id === item.variantId) ?? s.variants[0])
                              : null;
                            const linePrice = resolveItemPrice(item, products);
                            return (
                              <div key={`${item.productId}-${item.productSizeId}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#bdbdbd', gap: 8 }}>
                                <span style={{ minWidth: 0 }}>
                                  {item.quantity}× {p?.name} <span style={{ color: '#6b6b80' }}>{s?.name}</span>
                                  {variant && <span style={{ color: '#6b6b80' }}> · {variant.name}</span>}
                                </span>
                                <span style={{ color: '#e0e0e0', flexShrink: 0 }}>{fmtCurrency(linePrice)}</span>
                              </div>
                            );
                          })}
                        </div>
                      )
                    }

                    {/* Retail + cost totals */}
                    {formItems.length > 0 && (
                      <div style={{ borderTop: '1px solid #3a3656', paddingTop: '0.55rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                          <span style={{ color: '#6b6b80' }}>Retail value</span>
                          <span style={{ color: '#bdbdbd' }}>{fmtCurrency(retailTotal)}</span>
                        </div>
                        {studioCostTotal > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                            <span style={{ color: '#6b6b80' }}>Your cost</span>
                            <span style={{ color: '#bdbdbd' }}>{fmtCurrency(studioCostTotal)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Price input */}
                    <div>
                      <label style={lbl}>Package price *</label>
                      <input style={{ ...inp, fontSize: '1.1rem', fontWeight: 700, color: '#a78bfa', textAlign: 'right' }} type="number" min="0" step="0.01" value={formPrice} onChange={e => setFormPrice(e.target.value)} placeholder="0.00" />
                      {suggestedPrice && (
                        <button type="button" onClick={() => setFormPrice(suggestedPrice)} style={{ marginTop: 5, background: 'none', border: 'none', color: '#7c5cff', fontSize: '0.75rem', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                          Suggest {fmtCurrency(Number(suggestedPrice))} — customer saves {fmtCurrency(retailTotal - Number(suggestedPrice))} (15%)
                        </button>
                      )}
                    </div>

                    {/* Customer savings + studio profit */}
                    {priceNum > 0 && retailTotal > 0 && (
                      <div style={{ background: studioProfit >= 0 ? 'rgba(124,92,255,0.07)' : 'rgba(239,68,68,0.08)', border: `1px solid ${studioProfit >= 0 ? 'rgba(124,92,255,0.2)' : 'rgba(239,68,68,0.2)'}`, borderRadius: 8, padding: '0.6rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        {customerSavings > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                            <span style={{ color: '#6b6b80' }}>Customer saves</span>
                            <span style={{ color: '#22c55e', fontWeight: 600 }}>{fmtCurrency(customerSavings)} ({savingsPct.toFixed(0)}%)</span>
                          </div>
                        )}
                        {customerSavings <= 0 && (
                          <div style={{ color: '#f59e0b', fontSize: '0.75rem' }}>⚠️ Package price ≥ retail — no customer savings</div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                          <span style={{ color: '#6b6b80' }}>Studio profit</span>
                          <span style={{ color: studioProfit >= 0 ? '#a78bfa' : '#ef4444', fontWeight: 700 }}>{fmtCurrency(studioProfit)} ({profitPct.toFixed(0)}%)</span>
                        </div>
                        {studioProfit < 0 && (
                          <div style={{ color: '#ef4444', fontSize: '0.72rem' }}>⚠️ Package price is below your cost</div>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
                      <button style={btn('#22c55e', saving || formItems.length === 0 || !formName.trim())} onClick={savePackage} disabled={saving || formItems.length === 0 || !formName.trim()}>
                        {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Package'}
                      </button>
                      <button style={btn('#3a3656')} onClick={cancelForm}>Cancel</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Saved packages ── */}
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <div style={sectionTitle}>Your Packages</div>
                  <div style={subtitleText}>{packages.length} package{packages.length !== 1 ? 's' : ''} in this price list</div>
                </div>
                {showForm && <button style={btn()} onClick={() => openNew()}>+ New Package</button>}
              </div>

              {loading
                ? <div style={{ color: '#6b6b80' }}>Loading…</div>
                : packages.length === 0
                ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: '#4a4a6a', fontSize: '0.9rem' }}>
                    No packages yet. Use a template above or click "+ New Package" to get started.
                  </div>
                )
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {packages.map(pkg => {
                      const pkgRetail = calcRetailTotal(pkg.items, products);
                      const pkgCost   = pkg.items.reduce((sum, item) => sum + resolveItemCost(item, products), 0);
                      const pkgProfit = pkg.packagePrice - pkgCost;
                      const pkgProfitPct = pkg.packagePrice > 0 ? (pkgProfit / pkg.packagePrice) * 100 : 0;
                      const pkgSavings = pkgRetail > 0 ? pkgRetail - pkg.packagePrice : 0;
                      return (
                        <div key={pkg.id} style={{ background: '#1e1e28', border: '1px solid #3a3656', borderRadius: 12, padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                              <span style={{ fontWeight: 800, color: '#e0e0e0' }}>{pkg.name}</span>
                              {!pkg.isActive && <span style={{ background: 'rgba(107,107,128,0.2)', color: '#6b6b80', borderRadius: 20, padding: '1px 8px', fontSize: '0.72rem', fontWeight: 700 }}>Inactive</span>}
                            </div>
                            {pkg.description && <div style={{ color: '#6b6b80', fontSize: '0.8rem', marginBottom: '0.4rem' }}>{pkg.description}</div>}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem' }}>
                              {pkg.items.map((item, i) => {
                                const p = products.find(p => p.id === item.productId);
                                const s = p?.sizes.find(s => s.id === item.productSizeId);
                                return (
                                  <span key={i} style={{ background: 'rgba(124,92,255,0.1)', border: '1px solid rgba(124,92,255,0.2)', borderRadius: 20, padding: '2px 9px', fontSize: '0.75rem', color: '#a78bfa' }}>
                                    {item.quantity}× {p?.name ?? 'Unknown'} {s?.name ? `(${s.name})` : ''}
                                  </span>
                                );
                              })}
                              {pkg.items.length === 0 && <span style={{ color: '#4a4a6a', fontSize: '0.8rem' }}>No items</span>}
                            </div>
                            <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.8rem', flexWrap: 'wrap' }}>
                              {pkgCost > 0 && <span style={{ color: '#6b6b80' }}>Your cost: <span style={{ color: '#bdbdbd' }}>{fmtCurrency(pkgCost)}</span></span>}
                              <span style={{ color: '#6b6b80' }}>Price: <span style={{ color: '#a78bfa', fontWeight: 700 }}>{fmtCurrency(pkg.packagePrice)}</span></span>
                              {pkgRetail > 0 && pkgSavings > 0 && <span style={{ color: '#22c55e' }}>Customer saves: {fmtCurrency(pkgSavings)}</span>}
                              {pkgCost > 0 && <span style={{ color: pkgProfit >= 0 ? '#6b6b80' : '#ef4444' }}>Profit: <span style={{ color: pkgProfit >= 0 ? '#a78bfa' : '#ef4444', fontWeight: 700 }}>{fmtCurrency(pkgProfit)} ({pkgProfitPct.toFixed(0)}%)</span></span>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                            <button style={btn('#3a3656')} onClick={() => openEdit(pkg)}>Edit</button>
                            <button style={{ ...btn(), background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }} onClick={() => deletePackage(pkg.id)}>Delete</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              }
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminPackagesPage;
