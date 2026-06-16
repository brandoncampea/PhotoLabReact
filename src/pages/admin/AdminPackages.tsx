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
type ProdSize = { id: number; name: string; cost: number };
type Product  = { id: number; name: string; category: string; sizes: ProdSize[] };
type FormItem = { productId: number; productSizeId: number; quantity: number };
type SavedPkg = { id: number; name: string; description: string | null; packagePrice: number; isActive: boolean; priceListId: number; items: FormItem[] };

// ── Template suggestions ──────────────────────────────────────────────────────
const TEMPLATES = [
  { icon: '💻', name: 'Digital Only',      desc: '1 digital download — great entry-level option',        matchKw: ['digital'],                    suggestedMultiplier: 3.0 },
  { icon: '🖼️', name: 'Classic Prints',    desc: '1 large + 2 wallet prints — the timeless bundle',      matchKw: ['8x10', '4x6', 'wallet'],      suggestedMultiplier: 2.5 },
  { icon: '⭐', name: 'Memory Pack',        desc: 'Prints + digital download — most popular combo',       matchKw: ['8x10', 'digital'],             suggestedMultiplier: 2.5 },
  { icon: '🏆', name: 'Premium Collection', desc: 'Prints + digital + keepsakes — your highest value',   matchKw: ['8x10', '4x6', 'digital', 'button'], suggestedMultiplier: 2.2 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtCurrency = (n: number) => `$${Number(n).toFixed(2)}`;

function calcTotalCost(items: FormItem[], products: Product[]): number {
  return items.reduce((sum, item) => {
    const size = products.flatMap(p => p.sizes.map(s => ({ ...s, productId: p.id }))).find(s => s.productId === item.productId && s.id === item.productSizeId);
    return sum + (size?.cost ?? 0) * item.quantity;
  }, 0);
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
        grouped[item.product_id].sizes.push({ id: item.product_size_id, name: item.size_name, cost: Number(item.base_cost) || 0 });
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
    setFormItems(pkg.items.map(i => ({ productId: i.productId, productSizeId: i.productSizeId, quantity: i.quantity })));
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
            matched.push({ productId: p.id, productSizeId: size.id, quantity: 1 });
            break;
          }
        }
      }
    });
    const cost = calcTotalCost(matched, products);
    const suggested = cost > 0 ? (cost * tmpl.suggestedMultiplier).toFixed(2) : '';
    setEditingId(null);
    setFormName(tmpl.name);
    setFormDesc(tmpl.desc);
    setFormPrice(suggested);
    setFormItems(matched);
    setItemSearch('');
    setShowForm(true);
  };

  const toggleItem = (productId: number, productSizeId: number) => {
    setFormItems(prev => {
      const exists = prev.find(i => i.productId === productId && i.productSizeId === productSizeId);
      if (exists) return prev.filter(i => !(i.productId === productId && i.productSizeId === productSizeId));
      return [...prev, { productId, productSizeId, quantity: 1 }];
    });
  };

  const setQty = (productId: number, productSizeId: number, qty: number) => {
    setFormItems(prev => prev.map(i => i.productId === productId && i.productSizeId === productSizeId ? { ...i, quantity: Math.max(1, qty) } : i));
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
  const totalCost = calcTotalCost(formItems, products);
  const priceNum  = Number(formPrice) || 0;
  const margin    = priceNum - totalCost;
  const marginPct = priceNum > 0 ? (margin / priceNum) * 100 : 0;
  const suggestedPrice = totalCost > 0 ? (totalCost * 2.5).toFixed(2) : '';

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
                                const checked = formItems.some(i => i.productId === s.productId && i.productSizeId === s.id);
                                const qty = formItems.find(i => i.productId === s.productId && i.productSizeId === s.id)?.quantity ?? 1;
                                return (
                                  <label key={`${s.productId}-${s.id}`} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '7px 12px', cursor: 'pointer', background: checked ? 'rgba(124,92,255,0.1)' : 'transparent', borderBottom: '1px solid #23232a', transition: 'background 0.1s' }}>
                                    <input type="checkbox" checked={checked} onChange={() => toggleItem(s.productId, s.id)} style={{ width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }} />
                                    <span style={{ flex: 1, color: checked ? '#e0e0e0' : '#bdbdbd', fontSize: '0.85rem' }}>{s.productName} <span style={{ color: '#6b6b80' }}>· {s.name}</span></span>
                                    <span style={{ color: '#6b6b80', fontSize: '0.8rem', flexShrink: 0 }}>{fmtCurrency(s.cost)}</span>
                                    {checked && (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                        <button type="button" onClick={e => { e.preventDefault(); setQty(s.productId, s.id, qty - 1); }} style={{ width: 22, height: 22, borderRadius: 4, background: '#3a3656', border: 'none', color: '#e0e0e0', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                                        <span style={{ color: '#a78bfa', fontWeight: 700, fontSize: '0.85rem', minWidth: 16, textAlign: 'center' }}>{qty}</span>
                                        <button type="button" onClick={e => { e.preventDefault(); setQty(s.productId, s.id, qty + 1); }} style={{ width: 22, height: 22, borderRadius: 4, background: '#3a3656', border: 'none', color: '#e0e0e0', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                                      </div>
                                    )}
                                  </label>
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

                    {/* Selected items */}
                    {formItems.length === 0
                      ? <div style={{ color: '#4a4a6a', fontSize: '0.82rem', fontStyle: 'italic' }}>No items selected yet</div>
                      : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          {formItems.map(item => {
                            const p = products.find(p => p.id === item.productId);
                            const s = p?.sizes.find(s => s.id === item.productSizeId);
                            return (
                              <div key={`${item.productId}-${item.productSizeId}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#bdbdbd' }}>
                                <span>{item.quantity}× {p?.name} <span style={{ color: '#6b6b80' }}>{s?.name}</span></span>
                                <span style={{ color: '#e0e0e0' }}>{fmtCurrency((s?.cost ?? 0) * item.quantity)}</span>
                              </div>
                            );
                          })}
                        </div>
                      )
                    }

                    {/* Cost total */}
                    <div style={{ borderTop: '1px solid #3a3656', paddingTop: '0.6rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.25rem' }}>
                        <span style={{ color: '#6b6b80' }}>Your cost</span>
                        <span style={{ color: '#e0e0e0', fontWeight: 700 }}>{fmtCurrency(totalCost)}</span>
                      </div>
                    </div>

                    {/* Price input */}
                    <div>
                      <label style={lbl}>Your price *</label>
                      <input style={{ ...inp, fontSize: '1.1rem', fontWeight: 700, color: '#a78bfa', textAlign: 'right' }} type="number" min="0" step="0.01" value={formPrice} onChange={e => setFormPrice(e.target.value)} placeholder="0.00" />
                      {suggestedPrice && (
                        <button type="button" onClick={() => setFormPrice(suggestedPrice)} style={{ marginTop: 5, background: 'none', border: 'none', color: '#6b6b80', fontSize: '0.75rem', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                          Use suggested {fmtCurrency(Number(suggestedPrice))} (2.5× cost)
                        </button>
                      )}
                    </div>

                    {/* Margin */}
                    {priceNum > 0 && totalCost > 0 && (
                      <div style={{ background: margin >= 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${margin >= 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, borderRadius: 8, padding: '0.6rem 0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                          <span style={{ color: '#6b6b80' }}>Margin</span>
                          <span style={{ color: margin >= 0 ? '#22c55e' : '#ef4444', fontWeight: 700 }}>{fmtCurrency(margin)} ({marginPct.toFixed(0)}%)</span>
                        </div>
                        <div style={{ color: '#4a4a6a', fontSize: '0.72rem', marginTop: 3 }}>
                          {margin < 0 ? '⚠️ Price is below cost' : margin < totalCost * 0.5 ? 'Low margin — consider a higher price' : 'Healthy margin'}
                        </div>
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
                      const cost = calcTotalCost(pkg.items, products);
                      const pkgMargin = pkg.packagePrice - cost;
                      const pkgMarginPct = pkg.packagePrice > 0 ? (pkgMargin / pkg.packagePrice) * 100 : 0;
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
                              <span style={{ color: '#6b6b80' }}>Your cost: <span style={{ color: '#bdbdbd' }}>{cost > 0 ? fmtCurrency(cost) : '—'}</span></span>
                              <span style={{ color: '#6b6b80' }}>Price: <span style={{ color: '#a78bfa', fontWeight: 700 }}>{fmtCurrency(pkg.packagePrice)}</span></span>
                              {cost > 0 && <span style={{ color: pkgMargin >= 0 ? '#22c55e' : '#ef4444' }}>Margin: {fmtCurrency(pkgMargin)} ({pkgMarginPct.toFixed(0)}%)</span>}
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
