
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import AdminLayout from '../../components/AdminLayout';
import AdminWhccImport from '../../components/AdminWhccImport';
import AdminMpixImport from '../../components/AdminMpixImport';
import Modal from '../../components/Modal/Modal';
import { PriceList } from '../../types/index';
import { superPriceListService } from '../../services/superPriceListService';

// Indeterminate checkbox helper
const IndeterminateCheckbox: React.FC<{
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}> = ({ checked, indeterminate, onChange, disabled }) => {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate; }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={e => onChange(e.target.checked)}
      disabled={disabled}
      onClick={e => e.stopPropagation()}
    />
  );
};

// Strip trailing dimension tokens so "Photo Print 4x6" and "Photo Print 5x7"
// both group under "Photo Print", with size kept from size_name or extracted.
function baseProductName(name: string): string {
  return (name || 'Unknown')
    .replace(/\s+\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)?\s*$/i, '')
    .replace(/\s*[-–]\s*\d+(?:\.\d+)?x\d+(?:\.\d+)?\s*$/i, '')
    .replace(/\s*\(\d+(?:\.\d+)?x\d+(?:\.\d+)?\)\s*$/i, '')
    .trim() || (name || 'Unknown');
}

function sizeLabel(item: any): string {
  if (item.size_name && item.size_name.trim()) return item.size_name.trim();
  const m = (item.product_name || '').match(/(\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)?)/i);
  return m ? m[1] : (item.product_name || '');
}

function groupItems(items: any[]): Record<string, Record<string, any[]>> {
  const grouped: Record<string, Record<string, any[]>> = {};
  items.forEach(item => {
    const cat = item.product_category || 'Uncategorized';
    const prod = baseProductName(item.product_name || 'Unknown');
    if (!grouped[cat]) grouped[cat] = {};
    if (!grouped[cat][prod]) grouped[cat][prod] = [];
    item._sizeLabel = sizeLabel(item);
    grouped[cat][prod].push(item);
  });
  // sort sizes naturally within each product group
  Object.values(grouped).forEach(prods =>
    Object.values(prods).forEach(sizes =>
      sizes.sort((a, b) =>
        a._sizeLabel.localeCompare(b._sizeLabel, undefined, { numeric: true })
      )
    )
  );
  return grouped;
}

const SuperAdminPricing: React.FC = () => {
  const [importType, setImportType] = useState<null | 'whcc' | 'csv' | 'mpix'>(null);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');
  const [creating, setCreating] = useState(false);

  // ── View/Edit modal state ──────────────────────────────────────────────────
  const [viewList, setViewList] = useState<PriceList | null>(null);
  const [viewItems, setViewItems] = useState<any[]>([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState('');
  const [viewSearch, setViewSearch] = useState('');
  // item drafts: local editable values (auto-saved on blur)
  const [itemDrafts, setItemDrafts] = useState<Record<number, { base_cost: string; markup_percent: string }>>({});
  const [autoSaving, setAutoSaving] = useState<Record<number, boolean>>({});
  const [togglingActive, setTogglingActive] = useState(false);
  // collapse state
  const [catCollapsed, setCatCollapsed] = useState<Record<string, boolean>>({});
  const [prodCollapsed, setProdCollapsed] = useState<Record<string, boolean>>({});
  // global markup
  const [globalMarkup, setGlobalMarkup] = useState('');
  const [applyingMarkup, setApplyingMarkup] = useState(false);
  // category images
  const [categoryImages, setCategoryImages] = useState<Record<string, string>>({});
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);
  const catImgInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // manual add inputs
  const [manualProductName, setManualProductName] = useState('');
  const [manualSizeName, setManualSizeName] = useState('');
  const [manualCategory, setManualCategory] = useState('Digital');
  const [manualBaseCost, setManualBaseCost] = useState('');
  const [manualMarkup, setManualMarkup] = useState('');
  const [addingManual, setAddingManual] = useState(false);

  // derive grouped structure from viewItems
  const viewGrouped = useMemo(() => groupItems(viewItems), [viewItems]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const itemIdsForCat = useCallback((cat: string) =>
    Object.values(viewGrouped[cat] || {}).flat().map((i: any) => i.id as number),
    [viewGrouped]);

  const itemIdsForProd = useCallback((cat: string, prod: string) =>
    (viewGrouped[cat]?.[prod] || []).map((i: any) => i.id as number),
    [viewGrouped]);

  const allActiveInGroup = (ids: number[]) => ids.length > 0 && ids.every(id => viewItems.find(i => i.id === id)?.is_active);
  const someActiveInGroup = (ids: number[]) => ids.some(id => viewItems.find(i => i.id === id)?.is_active);

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadPriceLists = async () => {
    setLoading(true);
    try {
      const response = await superPriceListService.getLists();
      setPriceLists(response || []);
      setError('');
    } catch {
      setError('Failed to load price lists');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPriceLists(); }, []);

  const openViewEdit = async (list: PriceList) => {
    setViewList(list);
    setViewItems([]);
    setViewError('');
    setViewLoading(true);
    setViewSearch('');
    setItemDrafts({});
    setGlobalMarkup('');
    setCategoryImages({});
    setCatCollapsed({});
    setProdCollapsed({});
    try {
      const [items, images] = await Promise.all([
        superPriceListService.getItems(list.id),
        superPriceListService.getCategoryImages(list.id).catch(() => []),
      ]);
      const arr: any[] = Array.isArray(items) ? items : [];
      setViewItems(arr);
      // init drafts
      const drafts: Record<number, { base_cost: string; markup_percent: string }> = {};
      arr.forEach(i => { drafts[i.id] = { base_cost: String(i.base_cost ?? ''), markup_percent: String(i.markup_percent ?? '') }; });
      setItemDrafts(drafts);
      // init category images
      const imgMap: Record<string, string> = {};
      if (Array.isArray(images)) images.forEach((img: any) => { imgMap[img.category_name] = img.image_url; });
      setCategoryImages(imgMap);
      // collapse all categories by default
      const cats: Record<string, boolean> = {};
      groupItems(arr) && Object.keys(groupItems(arr)).forEach(cat => { cats[cat] = true; });
      setCatCollapsed(cats);
    } catch {
      setViewError('Failed to load items for this price list.');
    } finally {
      setViewLoading(false);
    }
  };

  const closeViewEdit = () => { setViewList(null); setViewItems([]); setItemDrafts({}); };

  const handleManualAdd = async () => {
    if (!viewList) return;
    if (!manualProductName.trim() || !manualSizeName.trim()) {
      setViewError('Manual add requires product name and size name.');
      return;
    }
    setAddingManual(true);
    setViewError('');
    try {
      await superPriceListService.addItem(
        viewList.id,
        undefined,
        manualBaseCost !== '' ? Number(manualBaseCost) : undefined,
        manualMarkup !== '' ? Number(manualMarkup) : undefined,
        {
          product_name: manualProductName.trim(),
          size_name: manualSizeName.trim(),
          category: manualCategory.trim() || 'Digital',
          description: 'Digital download product added manually from Super Admin Pricing',
          is_digital_only: true,
        }
      );

      const items = await superPriceListService.getItems(viewList.id);
      const arr: any[] = Array.isArray(items) ? items : [];
      setViewItems(arr);
      const drafts: Record<number, { base_cost: string; markup_percent: string }> = {};
      arr.forEach(i => { drafts[i.id] = { base_cost: String(i.base_cost ?? ''), markup_percent: String(i.markup_percent ?? '') }; });
      setItemDrafts(drafts);

      setManualProductName('');
      setManualSizeName('');
      setManualCategory('Digital');
      setManualBaseCost('');
      setManualMarkup('');
    } catch (err: any) {
      const details = err?.response?.data?.error || err?.message || 'Failed to manually add item';
      setViewError(String(details));
    } finally {
      setAddingManual(false);
    }
  };

  // ── Auto-save on blur ──────────────────────────────────────────────────────
  const autoSaveItem = async (itemId: number) => {
    const draft = itemDrafts[itemId];
    const original = viewItems.find(i => i.id === itemId);
    if (!draft || !original) return;
    const newCost = draft.base_cost !== '' ? Number(draft.base_cost) : null;
    const newMarkup = draft.markup_percent !== '' ? Number(draft.markup_percent) : null;
    if (newCost === original.base_cost && newMarkup === original.markup_percent) return;
    setAutoSaving(prev => ({ ...prev, [itemId]: true }));
    try {
      await superPriceListService.updateItem(viewList!.id, itemId, { base_cost: newCost, markup_percent: newMarkup });
      setViewItems(prev => prev.map(i => i.id === itemId ? { ...i, base_cost: newCost, markup_percent: newMarkup } : i));
    } catch {
      setViewError('Failed to save item.');
    } finally {
      setAutoSaving(prev => { const n = { ...prev }; delete n[itemId]; return n; });
    }
  };

  // ── Active toggles ─────────────────────────────────────────────────────────
  const toggleItemActive = async (item: any, active: boolean) => {
    setTogglingActive(true);
    try {
      await superPriceListService.updateItem(viewList!.id, item.id, { is_active: active });
      setViewItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: active } : i));
    } catch { setViewError('Failed to update active status.'); }
    finally { setTogglingActive(false); }
  };

  const toggleGroupActive = async (ids: number[], active: boolean) => {
    if (!ids.length) return;
    setTogglingActive(true);
    try {
      await superPriceListService.bulkSetActive(viewList!.id, ids, active);
      setViewItems(prev => prev.map(i => ids.includes(i.id) ? { ...i, is_active: active } : i));
    } catch { setViewError('Failed to update active status.'); }
    finally { setTogglingActive(false); }
  };

  // ── Global markup ──────────────────────────────────────────────────────────
  const handleApplyGlobalMarkup = async () => {
    if (globalMarkup === '' || !viewList) return;
    setApplyingMarkup(true);
    try {
      await superPriceListService.bulkSetMarkup(viewList.id, Number(globalMarkup));
      const val = Number(globalMarkup);
      setViewItems(prev => prev.map(i => i.is_active ? { ...i, markup_percent: val } : i));
      setItemDrafts(prev => {
        const n = { ...prev };
        viewItems.forEach(i => { if (i.is_active) n[i.id] = { ...n[i.id], markup_percent: globalMarkup }; });
        return n;
      });
    } catch { setViewError('Failed to apply markup.'); }
    finally { setApplyingMarkup(false); }
  };

  // ── Category image upload ──────────────────────────────────────────────────
  const handleCategoryImageUpload = async (cat: string, file: File) => {
    setUploadingCategory(cat);
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('category_name', cat);
      const url = await superPriceListService.uploadCategoryImage(viewList!.id, formData);
      setCategoryImages(prev => ({ ...prev, [cat]: url }));
    } catch { setViewError('Failed to upload category image.'); }
    finally { setUploadingCategory(null); }
  };

  // ── Create list ────────────────────────────────────────────────────────────
  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    setCreating(true);
    try {
      await superPriceListService.createList(newListName, newListDescription);
      setShowCreateForm(false);
      setNewListName('');
      setNewListDescription('');
      await loadPriceLists();
    } catch { setError('Failed to create price list'); }
    finally { setCreating(false); }
  };

  // ── Search filter helpers ──────────────────────────────────────────────────
  const q = viewSearch.toLowerCase().trim();
  const catVisible = (cat: string) => !q || cat.toLowerCase().includes(q) ||
    Object.keys(viewGrouped[cat] || {}).some(prod =>
      prod.toLowerCase().includes(q) ||
      (viewGrouped[cat][prod] || []).some((i: any) => (i.size_name || '').toLowerCase().includes(q))
    );
  const prodVisible = (cat: string, prod: string) => !q || prod.toLowerCase().includes(q) ||
    (viewGrouped[cat]?.[prod] || []).some((i: any) => (i.size_name || '').toLowerCase().includes(q));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AdminLayout>
      <div className="admin-page">
        <div className="page-header">
          <h1>💸 Super Admin Pricing</h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            Manage and review all lab price lists, product pricing, and global pricing analytics.
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button className="btn btn-secondary" onClick={() => setImportType('whcc')}>Import from WHCC</button>
            <button className="btn btn-secondary" onClick={() => setImportType('csv')}>Import from CSV</button>
            <button className="btn btn-secondary" onClick={() => setImportType('mpix')}>Import from Mpix</button>
          </div>
        </div>

        {/* ── Import Modals ── */}
        <Modal isOpen={!!importType} onClose={() => setImportType(null)} hideDefaultClose
          contentClassName={importType === 'whcc' ? 'admin-whcc-modal-container' : ''}>
          {importType === 'whcc' && (
            <AdminWhccImport onClose={() => setImportType(null)} onImportComplete={() => { setImportType(null); loadPriceLists(); }} />
          )}
          {importType === 'mpix' && (
            <AdminMpixImport onClose={() => setImportType(null)} onImportComplete={() => { setImportType(null); loadPriceLists(); }} />
          )}
          {importType === 'csv' && (
            <div style={{ padding: 32, color: '#fff', textAlign: 'center' }}>
              <h3>CSV Import Coming Soon</h3>
              <button className="btn btn-secondary" onClick={() => setImportType(null)}>Close</button>
            </div>
          )}
        </Modal>

        {/* ── Price lists table ── */}
        {loading ? (
          <div className="loading">Loading price lists...</div>
        ) : error ? (
          <div className="error-message">{error}</div>
        ) : (
          <div className="dashboard-widget">
            <h2><span>🏷️</span> Lab Price Lists</h2>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              {showCreateForm ? (
                <form onSubmit={handleCreateList} style={{ maxWidth: 400, margin: '2rem auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <input type="text" placeholder="Price List Name" value={newListName} onChange={e => setNewListName(e.target.value)} required style={{ padding: 8, fontSize: 16 }} />
                  <textarea placeholder="Description (optional)" value={newListDescription} onChange={e => setNewListDescription(e.target.value)} style={{ padding: 8, fontSize: 16 }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary" type="submit" disabled={creating}>{creating ? 'Creating...' : 'Create Price List'}</button>
                    <button className="btn btn-secondary" type="button" onClick={() => setShowCreateForm(false)} disabled={creating}>Cancel</button>
                  </div>
                </form>
              ) : (
                <button className="btn btn-primary" onClick={() => setShowCreateForm(true)}>+ Create New Price List</button>
              )}
            </div>
            {priceLists.length === 0 && !showCreateForm && (
              <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', padding: '2rem' }}>
                No price lists found. Create a new price list to get started.
              </p>
            )}
            {priceLists.length > 0 && (
              <table className="data-table">
                <thead><tr><th>Price List</th><th>Products</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {priceLists.map(list => (
                    <tr key={list.id}>
                      <td>{list.name}</td>
                      <td>{list.productCount}</td>
                      <td>{list.isActive
                        ? <span style={{ color: '#10b981', fontWeight: 600 }}>Active</span>
                        : <span style={{ color: 'var(--error-color)', fontWeight: 600 }}>Inactive</span>}
                      </td>
                      <td>
                        <button className="btn btn-secondary btn-sm" onClick={() => openViewEdit(list)}>View/Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ── View/Edit Price List Modal ── */}
      <Modal isOpen={!!viewList} onClose={closeViewEdit} hideDefaultClose contentClassName="admin-price-list-edit-modal">
        <div style={{ display: 'flex', flexDirection: 'column', height: '85vh' }}>
          {/* Header */}
          <div className="spl-modal-header">
            <h3>{viewList?.name}</h3>
            <button className="btn btn-secondary btn-sm" onClick={closeViewEdit}>✕ Close</button>
          </div>

          {viewError && <div className="info-box-error" style={{ marginBottom: 10 }}>✗ {viewError}</div>}

          {viewLoading ? (
            <div style={{ textAlign: 'center', padding: 48 }}>Loading items...</div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="spl-toolbar">
                <input className="spl-search" type="text" placeholder="Search category, product, or size…"
                  value={viewSearch} onChange={e => setViewSearch(e.target.value)} />
                <div className="spl-markup-group">
                  <label>Markup % for all active:</label>
                  <input className="spl-markup-input" type="number" min={0} step={1} value={globalMarkup}
                    onChange={e => setGlobalMarkup(e.target.value)} placeholder="e.g. 40" />
                  <button className="btn btn-primary btn-sm" disabled={globalMarkup === '' || applyingMarkup}
                    onClick={handleApplyGlobalMarkup}>
                    {applyingMarkup ? 'Applying…' : 'Apply to Active'}
                  </button>
                </div>
                <span className="spl-item-count">{viewItems.length} sizes total</span>
              </div>

              <div className="spl-toolbar" style={{ marginTop: -6 }}>
                <input
                  className="spl-search"
                  style={{ maxWidth: 220 }}
                  type="text"
                  placeholder="Product name"
                  value={manualProductName}
                  onChange={e => setManualProductName(e.target.value)}
                />
                <input
                  className="spl-search"
                  style={{ maxWidth: 150 }}
                  type="text"
                  placeholder="Size (e.g. 5x7)"
                  value={manualSizeName}
                  onChange={e => setManualSizeName(e.target.value)}
                />
                <input
                  className="spl-search"
                  style={{ maxWidth: 150 }}
                  type="text"
                  placeholder="Category"
                  value={manualCategory}
                  onChange={e => setManualCategory(e.target.value)}
                />
                <input
                  className="spl-markup-input"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Cost"
                  value={manualBaseCost}
                  onChange={e => setManualBaseCost(e.target.value)}
                />
                <input
                  className="spl-markup-input"
                  type="number"
                  min={0}
                  step="1"
                  placeholder="Markup %"
                  value={manualMarkup}
                  onChange={e => setManualMarkup(e.target.value)}
                />
                <button className="btn btn-success btn-sm" disabled={addingManual} onClick={handleManualAdd}>
                  {addingManual ? 'Adding…' : '+ Add Manually'}
                </button>
              </div>

              {/* Tree body */}
              <div className="spl-body">
                {viewItems.length === 0 && (
                  <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>No items in this price list.</p>
                )}
                {Object.keys(viewGrouped).filter(catVisible).map(cat => {
                  const catIds = itemIdsForCat(cat);
                  const catAllActive = allActiveInGroup(catIds);
                  const catSomeActive = !catAllActive && someActiveInGroup(catIds);
                  return (
                    <div key={cat} className="spl-category-block">
                      <div className="spl-category-header" onClick={() => setCatCollapsed(p => ({ ...p, [cat]: !p[cat] }))}>
                        <button className="spl-collapse-btn">{catCollapsed[cat] ? '▶' : '▼'}</button>
                        {/* Category image */}
                        <div className="spl-cat-img-wrap" title="Click to upload category image"
                          onClick={e => { e.stopPropagation(); catImgInputRefs.current[cat]?.click(); }}>
                          {categoryImages[cat]
                            ? <img src={categoryImages[cat]} className="spl-cat-img" alt={cat} />
                            : <span>🖼</span>}
                          <div className="spl-cat-img-overlay">
                            {uploadingCategory === cat ? '⏳' : '📷'}
                          </div>
                          <input type="file" accept="image/*" style={{ display: 'none' }}
                            ref={el => { catImgInputRefs.current[cat] = el; }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleCategoryImageUpload(cat, f); e.target.value = ''; }}
                          />
                        </div>
                        <strong>{cat}</strong>
                        <label className="spl-toggle-label" onClick={e => e.stopPropagation()}>
                          <IndeterminateCheckbox
                            checked={catAllActive}
                            indeterminate={catSomeActive}
                            onChange={checked => toggleGroupActive(catIds, checked)}
                            disabled={togglingActive}
                          />
                          Active
                        </label>
                        <span className="spl-item-count">{catIds.length} sizes</span>
                      </div>

                      {!catCollapsed[cat] && (
                        <div className="spl-category-body">
                          {Object.keys(viewGrouped[cat]).filter(prod => prodVisible(cat, prod)).map(prod => {
                            const prodIds = itemIdsForProd(cat, prod);
                            const prodAllActive = allActiveInGroup(prodIds);
                            const prodSomeActive = !prodAllActive && someActiveInGroup(prodIds);
                            const prodKey = `${cat}||${prod}`;
                            return (
                              <div key={prod} className="spl-product-block">
                                <div className="spl-product-header" onClick={() => setProdCollapsed(p => ({ ...p, [prodKey]: !p[prodKey] }))}>
                                  <button className="spl-collapse-btn">{prodCollapsed[prodKey] ? '▶' : '▼'}</button>
                                  <span>{prod}</span>
                                  <label className="spl-toggle-label" onClick={e => e.stopPropagation()}>
                                    <IndeterminateCheckbox
                                      checked={prodAllActive}
                                      indeterminate={prodSomeActive}
                                      onChange={checked => toggleGroupActive(prodIds, checked)}
                                      disabled={togglingActive}
                                    />
                                    Active
                                  </label>
                                  <span className="spl-item-count" style={{ marginLeft: 8 }}>{prodIds.length} sizes</span>
                                </div>

                                {!prodCollapsed[prodKey] && (
                                  <div className="spl-size-list">
                                    {viewGrouped[cat][prod].map(item => (
                                      <div key={item.id} className={`spl-size-row${item.is_active ? '' : ' spl-inactive-row'}`}>
                                        <span className="spl-size-name">{item._sizeLabel || item.size_name || '—'}</span>
                                        <label className="spl-toggle-label">
                                          <input type="checkbox" checked={!!item.is_active} disabled={togglingActive}
                                            onChange={e => toggleItemActive(item, e.target.checked)} />
                                          Active
                                        </label>
                                        <div className="spl-field-group">
                                          <label>Cost $</label>
                                          <input
                                            className={`spl-num-input${autoSaving[item.id] ? ' spl-saving' : ''}`}
                                            type="number" min={0} step="0.01"
                                            value={itemDrafts[item.id]?.base_cost ?? ''}
                                            onChange={e => setItemDrafts(p => ({ ...p, [item.id]: { ...p[item.id], base_cost: e.target.value } }))}
                                            onBlur={() => autoSaveItem(item.id)}
                                          />
                                        </div>
                                        <div className="spl-field-group">
                                          <label>Markup %</label>
                                          <input
                                            className={`spl-num-input${autoSaving[item.id] ? ' spl-saving' : ''}`}
                                            type="number" min={0} step="1"
                                            value={itemDrafts[item.id]?.markup_percent ?? ''}
                                            onChange={e => setItemDrafts(p => ({ ...p, [item.id]: { ...p[item.id], markup_percent: e.target.value } }))}
                                            onBlur={() => autoSaveItem(item.id)}
                                          />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </Modal>
    </AdminLayout>
  );
};

export default SuperAdminPricing;
