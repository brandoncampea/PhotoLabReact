
import React, { useState, useEffect, useMemo } from 'react';
import { studioPriceListService } from '../../services/studioPriceListService';
import { packageService } from '../../services/packageService';
import { superPriceListService } from '../../services/superPriceListService';
import { useAuth } from '../../contexts/AuthContext';

const baseProductName = (name: string) => {
	return String(name || 'Unknown Product')
		.replace(/\s+\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)?\s*$/i, '')
		.replace(/\s*[-–]\s*\d+(?:\.\d+)?x\d+(?:\.\d+)?\s*$/i, '')
		.replace(/\s*\(\d+(?:\.\d+)?x\d+(?:\.\d+)?\)\s*$/i, '')
		.trim() || String(name || 'Unknown Product');
};

const sizeFromRow = (item: any) => {
	if (item?.size_name && String(item.size_name).trim()) return String(item.size_name).trim();
	const m = String(item?.product_name || '').match(/(\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)?)/i);
	return m ? m[1] : '—';
};


const AdminPriceLists: React.FC = () => {
	const { user } = useAuth();
	const effectiveStudioId = Number(localStorage.getItem('viewAsStudioId') || user?.studioId || 0);

	const [priceLists, setPriceLists] = useState<any[]>([]);
	const [superLists, setSuperLists] = useState<any[]>([]);
	const [selectedPriceList, setSelectedPriceList] = useState<any | null>(null);
	const [items, setItems] = useState<any[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showCreateForm, setShowCreateForm] = useState(false);
	const [newListName, setNewListName] = useState('');
	const [newListDesc, setNewListDesc] = useState('');
	const [selectedSuperListId, setSelectedSuperListId] = useState<number | ''>('');
	const [draftPrices, setDraftPrices] = useState<Record<number, string>>({});
	const [markupPercent, setMarkupPercent] = useState('');
	const [applyingMarkup, setApplyingMarkup] = useState(false);
	const [packages, setPackages] = useState<any[]>([]);
	const [packagesLoading, setPackagesLoading] = useState(false);
	const [showPackageForm, setShowPackageForm] = useState(false);
	const [newPackageName, setNewPackageName] = useState('');
	const [newPackageDescription, setNewPackageDescription] = useState('');
	const [newPackagePrice, setNewPackagePrice] = useState('');
	const [packageSelections, setPackageSelections] = useState<Record<number, number>>({});
	const [savingPackage, setSavingPackage] = useState(false);
	const [catCollapsed, setCatCollapsed] = useState<Record<string, boolean>>({});
	const [prodCollapsed, setProdCollapsed] = useState<Record<string, boolean>>({});

	const groupedItems = useMemo(() => {
		const grouped: Record<string, Record<string, any[]>> = {};
		(items || []).forEach((item: any) => {
			const cat = item.product_category || 'Uncategorized';
			const product = baseProductName(item.product_name || 'Unknown Product');
			if (!grouped[cat]) grouped[cat] = {};
			if (!grouped[cat][product]) grouped[cat][product] = [];
			item._sizeLabel = sizeFromRow(item);
			grouped[cat][product].push(item);
		});
		Object.keys(grouped).forEach((cat) => {
			Object.keys(grouped[cat]).forEach((product) => {
				grouped[cat][product].sort((a, b) =>
					String(a._sizeLabel || '').localeCompare(String(b._sizeLabel || ''), undefined, { numeric: true })
				);
			});
		});
		return grouped;
	}, [items]);

	useEffect(() => {
		if (!effectiveStudioId) return;
		setLoading(true);
		Promise.all([
			studioPriceListService.getLists(effectiveStudioId),
			superPriceListService.getLists(),
		])
			.then(([studioLists, supers]) => {
				setPriceLists(studioLists || []);
				setSuperLists((supers || []).filter((s: any) => !!s.isActive));
			})
			.catch(() => setError('Failed to load price lists'))
			.finally(() => setLoading(false));
	}, [effectiveStudioId]);

	useEffect(() => {
		if (selectedPriceList) {
			setPackagesLoading(true);
			setShowPackageForm(false);
			setNewPackageName('');
			setNewPackageDescription('');
			setNewPackagePrice('');
			setPackageSelections({});
			packageService.getAll(selectedPriceList.id)
				.then(setPackages)
				.catch(() => setError('Failed to load packages'))
				.finally(() => setPackagesLoading(false));
		} else {
			setPackages([]);
		}
	}, [selectedPriceList]);

	const handleSelectList = async (list: any) => {
		setSelectedPriceList(list);
		setLoading(true);
		try {
			const items = await studioPriceListService.getItems(list.id);
			setItems(items);
			const nextCats: Record<string, boolean> = {};
			const nextProds: Record<string, boolean> = {};
			(items || []).forEach((it: any) => {
				const cat = it.product_category || 'Uncategorized';
				const product = baseProductName(it.product_name || 'Unknown Product');
				nextCats[cat] = false;
				nextProds[`${cat}||${product}`] = false;
			});
			setCatCollapsed(nextCats);
			setProdCollapsed(nextProds);
			const nextDrafts: Record<number, string> = {};
			(items || []).forEach((it: any) => {
				nextDrafts[it.id] = String(it.price ?? '');
			});
			setDraftPrices(nextDrafts);
		} catch {
			setError('Failed to load items');
		} finally {
			setLoading(false);
		}
	};

	const refreshSelectedItems = async () => {
		if (!selectedPriceList) return;
		const refreshed = await studioPriceListService.getItems(selectedPriceList.id);
		setItems(refreshed || []);
		const nextDrafts: Record<number, string> = {};
		(refreshed || []).forEach((it: any) => {
			nextDrafts[it.id] = String(it.price ?? '');
		});
		setDraftPrices(nextDrafts);
	};

	const handleCreatePriceList = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!effectiveStudioId) {
			setError('No studio context found. Please re-login as a studio admin.');
			return;
		}
		if (!newListName.trim() || !selectedSuperListId) return;
		setLoading(true);
		try {
			await studioPriceListService.createList(effectiveStudioId, newListName, Number(selectedSuperListId), newListDesc);
			const updatedLists = await studioPriceListService.getLists(effectiveStudioId);
			setPriceLists(updatedLists || []);
			setShowCreateForm(false);
			setNewListName('');
			setNewListDesc('');
			setSelectedSuperListId('');
		} catch {
			setError('Failed to create price list');
		} finally {
			setLoading(false);
		}
	};

	const handleToggleOffered = async (item: any, offered: boolean) => {
		if (!selectedPriceList) return;
		try {
			await studioPriceListService.updateItem(selectedPriceList.id, item.id, { is_offered: offered });
			setItems(prev => prev.map((i: any) => i.id === item.id ? { ...i, is_offered: offered ? 1 : 0 } : i));
		} catch {
			setError('Failed to update offering status');
		}
	};

	const getCategoryItemIds = (category: string) => {
		return Object.values(groupedItems[category] || {}).flat().map((i: any) => i.id as number);
	};

	const getProductItemIds = (category: string, product: string) => {
		return (groupedItems[category]?.[product] || []).map((i: any) => i.id as number);
	};

	const isAllOffered = (ids: number[]) => ids.length > 0 && ids.every(id => !!items.find((i: any) => i.id === id)?.is_offered);

	const handleToggleOfferedBulk = async (ids: number[], offered: boolean) => {
		if (!selectedPriceList || ids.length === 0) return;
		try {
			await Promise.all(ids.map(id =>
				studioPriceListService.updateItem(selectedPriceList.id, id, { is_offered: offered })
			));
			setItems(prev => prev.map((i: any) => ids.includes(i.id) ? { ...i, is_offered: offered ? 1 : 0 } : i));
		} catch {
			setError('Failed to update offering status');
		}
	};

	const handleSavePrice = async (item: any) => {
		if (!selectedPriceList) return;
		const value = draftPrices[item.id];
		if (value === undefined) return;
		try {
			await studioPriceListService.updateItem(selectedPriceList.id, item.id, {
				price: value === '' ? null : Number(value),
			});
			setItems(prev => prev.map((i: any) => i.id === item.id ? { ...i, price: value === '' ? null : Number(value) } : i));
		} catch {
			setError('Failed to save price');
		}
	};

	const handleApplyMarkup = async () => {
		if (!selectedPriceList || markupPercent === '') return;
		setApplyingMarkup(true);
		try {
			await studioPriceListService.applyMarkupToOffered(selectedPriceList.id, Number(markupPercent));
			await refreshSelectedItems();
		} catch {
			setError('Failed to apply markup');
		} finally {
			setApplyingMarkup(false);
		}
	};

	const handleExpandAll = () => {
		const nextCats: Record<string, boolean> = {};
		const nextProds: Record<string, boolean> = {};
		Object.keys(groupedItems).forEach((cat) => {
			nextCats[cat] = false;
			Object.keys(groupedItems[cat] || {}).forEach((product) => {
				nextProds[`${cat}||${product}`] = false;
			});
		});
		setCatCollapsed(nextCats);
		setProdCollapsed(nextProds);
	};

	const handleContractAll = () => {
		const nextCats: Record<string, boolean> = {};
		const nextProds: Record<string, boolean> = {};
		Object.keys(groupedItems).forEach((cat) => {
			nextCats[cat] = true;
			Object.keys(groupedItems[cat] || {}).forEach((product) => {
				nextProds[`${cat}||${product}`] = true;
			});
		});
		setCatCollapsed(nextCats);
		setProdCollapsed(nextProds);
	};

	const offeredItems = useMemo(() => (items || []).filter((i: any) => !!i.is_offered), [items]);

	const selectedPackageRows = useMemo(() => {
		return offeredItems
			.filter((item: any) => Number(packageSelections[item.id] || 0) > 0)
			.map((item: any) => ({ ...item, _qty: Number(packageSelections[item.id] || 0) }));
	}, [offeredItems, packageSelections]);

	const packageBaseCostTotal = useMemo(() => {
		return selectedPackageRows.reduce((sum: number, row: any) => sum + (Number(row.base_cost || 0) * Number(row._qty || 0)), 0);
	}, [selectedPackageRows]);

	const packageProfit = useMemo(() => {
		if (newPackagePrice === '') return 0;
		return Number(newPackagePrice) - packageBaseCostTotal;
	}, [newPackagePrice, packageBaseCostTotal]);

	const togglePackageItem = (itemId: number, checked: boolean) => {
		setPackageSelections(prev => {
			if (checked) return { ...prev, [itemId]: Math.max(1, Number(prev[itemId] || 1)) };
			const next = { ...prev };
			delete next[itemId];
			return next;
		});
	};

	const setPackageQty = (itemId: number, qty: number) => {
		setPackageSelections(prev => ({ ...prev, [itemId]: Math.max(1, Math.floor(qty || 1)) }));
	};

	const handleCreatePackage = async () => {
		if (!selectedPriceList) return;
		if (!newPackageName.trim()) {
			setError('Package name is required');
			return;
		}
		if (newPackagePrice === '' || !Number.isFinite(Number(newPackagePrice)) || Number(newPackagePrice) < 0) {
			setError('Package price must be a non-negative number');
			return;
		}
		if (selectedPackageRows.length === 0) {
			setError('Select at least one offered product/size for the package');
			return;
		}

		const payloadItems = selectedPackageRows.map((row: any) => ({
			productId: Number(row.product_id),
			productSizeId: Number(row.product_size_id),
			quantity: Number(row._qty),
		}));

		if (payloadItems.some((r: any) => !Number.isInteger(r.productId) || !Number.isInteger(r.productSizeId) || r.quantity <= 0)) {
			setError('One or more selected package rows is invalid. Refresh list and try again.');
			return;
		}

		setSavingPackage(true);
		setError(null);
		try {
			await packageService.create({
				priceListId: selectedPriceList.id,
				name: newPackageName.trim(),
				description: newPackageDescription.trim() || null,
				packagePrice: Number(newPackagePrice),
				isActive: true,
				items: payloadItems,
			});
			const refreshed = await packageService.getAll(selectedPriceList.id);
			setPackages(refreshed || []);
			setShowPackageForm(false);
			setNewPackageName('');
			setNewPackageDescription('');
			setNewPackagePrice('');
			setPackageSelections({});
		} catch {
			setError('Failed to create package');
		} finally {
			setSavingPackage(false);
		}
	};

	return (
		<div>
			<h2>Studio Price Lists</h2>
			{!effectiveStudioId && <div style={{ color: 'red' }}>No studio context found. Cannot manage studio price lists.</div>}
			{loading && <div>Loading...</div>}
			{error && <div style={{ color: 'red' }}>{error}</div>}

			<button onClick={() => setShowCreateForm(true)} disabled={!effectiveStudioId} className="btn btn-primary" style={{ marginBottom: 16 }}>+ Create Price List</button>

			{showCreateForm && (
				<form onSubmit={handleCreatePriceList} style={{ marginBottom: 24 }}>
					<input
						type="text"
						value={newListName}
						onChange={e => setNewListName(e.target.value)}
						placeholder="Name"
						required
						style={{ marginRight: 8 }}
					/>
					<input
						type="text"
						value={newListDesc}
						onChange={e => setNewListDesc(e.target.value)}
						placeholder="Description"
						style={{ marginRight: 8 }}
					/>
					<select
						value={selectedSuperListId}
						onChange={e => setSelectedSuperListId(e.target.value ? Number(e.target.value) : '')}
						required
						style={{ marginRight: 8 }}
					>
						<option value="">Select super-admin price list...</option>
						{superLists.map((s: any) => (
							<option key={s.id} value={s.id}>{s.name}</option>
						))}
					</select>
					<button type="submit" className="btn btn-success">Create</button>
					<button type="button" className="btn btn-secondary" onClick={() => setShowCreateForm(false)} style={{ marginLeft: 8 }}>Cancel</button>
				</form>
			)}

			<ul>
				{priceLists.map(list => (
					<li key={list.id} style={{ marginBottom: 8 }}>
						<button onClick={() => handleSelectList(list)} className="btn btn-link">{list.name}</button>
						{list.super_price_list_name && <span style={{ marginLeft: 8, color: '#aaa' }}>from {list.super_price_list_name}</span>}
						{list.description && <span style={{ marginLeft: 8, color: '#888' }}>{list.description}</span>}
					</li>
				))}
			</ul>

			{selectedPriceList && (
				<div style={{ marginTop: 20 }}>
					<h3>Items for {selectedPriceList.name}</h3>
					<div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
						<button
							className="btn btn-secondary btn-sm"
							onClick={() => handleToggleOfferedBulk(items.map((i: any) => i.id), true)}
						>
							Offer All
						</button>
						<button
							className="btn btn-secondary btn-sm"
							onClick={() => handleToggleOfferedBulk(items.map((i: any) => i.id), false)}
						>
							Unoffer All
						</button>
						<button className="btn btn-secondary btn-sm" onClick={handleExpandAll}>Expand All</button>
						<button className="btn btn-secondary btn-sm" onClick={handleContractAll}>Contract All</button>
						<label style={{ color: '#aaa' }}>Markup % for all offered:</label>
						<input
							type="number"
							min={0}
							step={1}
							value={markupPercent}
							onChange={e => setMarkupPercent(e.target.value)}
							style={{ width: 100 }}
						/>
						<button className="btn btn-primary btn-sm" onClick={handleApplyMarkup} disabled={applyingMarkup || markupPercent === ''}>
							{applyingMarkup ? 'Applying...' : 'Apply'}
						</button>
					</div>
					<div>
						{Object.keys(groupedItems).length === 0 && (
							<div style={{ color: '#999' }}>No active items available from selected super-admin list.</div>
						)}
						{Object.keys(groupedItems).map((cat) => (
							<div key={cat} style={{ border: '1px solid #2c2c3a', borderRadius: 8, marginBottom: 6, overflow: 'hidden' }}>
								{(() => {
									const firstProduct = Object.keys(groupedItems[cat] || {})[0];
									const firstItem = firstProduct ? groupedItems[cat][firstProduct]?.[0] : null;
									const categoryImageUrl = firstItem?.category_image_url;
									return (
								<div
									style={{ background: '#1f1b35', padding: '6px 10px', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}
									onClick={() => setCatCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }))}
								>
									<span>{catCollapsed[cat] ? '▶' : '▼'}</span>
									{categoryImageUrl ? (
										<img
											src={categoryImageUrl}
											alt={cat}
											style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover', border: '1px solid #444' }}
										/>
									) : (
										<span style={{ fontSize: 14, opacity: 0.7 }}>🖼</span>
									)}
									<span>{cat}</span>
									<label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
										<input
											type="checkbox"
											checked={isAllOffered(getCategoryItemIds(cat))}
											onChange={e => handleToggleOfferedBulk(getCategoryItemIds(cat), e.target.checked)}
										/>
										<span style={{ fontSize: 12 }}>Offer Category</span>
									</label>
								</div>
									);
								})()}
								{!catCollapsed[cat] && (
									<div style={{ padding: '4px 6px' }}>
										{Object.keys(groupedItems[cat]).map((product) => {
											const productKey = `${cat}||${product}`;
											return (
												<div key={productKey} style={{ border: '1px solid #2a2740', borderRadius: 6, marginBottom: 6, overflow: 'hidden' }}>
													<div
														style={{ background: '#171428', padding: '5px 8px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}
														onClick={() => setProdCollapsed(prev => ({ ...prev, [productKey]: !prev[productKey] }))}
													>
														<span>{prodCollapsed[productKey] ? '▶' : '▼'}</span>
														<span>{product}</span>
														<label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
															<input
																type="checkbox"
																checked={isAllOffered(getProductItemIds(cat, product))}
																onChange={e => handleToggleOfferedBulk(getProductItemIds(cat, product), e.target.checked)}
															/>
															<span style={{ fontSize: 12 }}>Offer Product</span>
														</label>
													</div>
													{!prodCollapsed[productKey] && (
														<div>
															{groupedItems[cat][product].map((item: any) => (
																<div key={item.id} style={{ display: 'grid', gridTemplateColumns: '74px 1fr 100px 120px', gap: 6, alignItems: 'center', padding: '4px 8px', borderTop: '1px solid #232036' }}>
																	<label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
																		<input
																			type="checkbox"
																			checked={!!item.is_offered}
																			onChange={e => handleToggleOffered(item, e.target.checked)}
																		/>
																		<span style={{ fontSize: 12 }}>Offer</span>
																	</label>
																	<div>{item._sizeLabel || item.size_name || '—'}</div>
																	<div>${Number(item.base_cost || 0).toFixed(2)}</div>
																	<input
																		type="number"
																		min={0}
																		step="0.01"
																		value={draftPrices[item.id] ?? ''}
																		onChange={e => setDraftPrices(prev => ({ ...prev, [item.id]: e.target.value }))}
																		onBlur={() => handleSavePrice(item)}
																		disabled={!item.is_offered}
																		style={{ width: 120 }}
																	/>
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
						))}
					</div>

					<h3 style={{ marginTop: 32 }}>Packages</h3>
					<div style={{ marginBottom: 10 }}>
						<button className="btn btn-primary btn-sm" onClick={() => setShowPackageForm(v => !v)}>
							{showPackageForm ? 'Cancel Package' : '+ Add Package'}
						</button>
					</div>

					{showPackageForm && (
						<div style={{ border: '1px solid #2c2c3a', borderRadius: 8, padding: 10, marginBottom: 12 }}>
							<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 140px auto', gap: 8, marginBottom: 10 }}>
								<input
									type="text"
									placeholder="Package name"
									value={newPackageName}
									onChange={e => setNewPackageName(e.target.value)}
								/>
								<input
									type="text"
									placeholder="Description (optional)"
									value={newPackageDescription}
									onChange={e => setNewPackageDescription(e.target.value)}
								/>
								<input
									type="number"
									min={0}
									step="0.01"
									placeholder="Package price"
									value={newPackagePrice}
									onChange={e => setNewPackagePrice(e.target.value)}
								/>
								<button className="btn btn-success btn-sm" onClick={handleCreatePackage} disabled={savingPackage}>
									{savingPackage ? 'Saving...' : 'Save Package'}
								</button>
							</div>

							<div style={{ maxHeight: 250, overflow: 'auto', border: '1px solid #2a2740', borderRadius: 6 }}>
								{offeredItems.map((item: any) => {
									const checked = Number(packageSelections[item.id] || 0) > 0;
									const qty = Number(packageSelections[item.id] || 1);
									const base = Number(item.base_cost || 0);
									return (
										<div key={item.id} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 130px 72px 130px', gap: 8, alignItems: 'center', padding: '6px 8px', borderTop: '1px solid #232036' }}>
											<input type="checkbox" checked={checked} onChange={e => togglePackageItem(item.id, e.target.checked)} />
											<div>{item.product_name} - {item._sizeLabel || item.size_name || '—'}</div>
											<div>Base: ${base.toFixed(2)}</div>
											<input
												type="number"
												min={1}
												step={1}
												disabled={!checked}
												value={qty}
												onChange={e => setPackageQty(item.id, Number(e.target.value))}
											/>
											<div>Total: ${(base * qty).toFixed(2)}</div>
										</div>
									);
								})}
								{offeredItems.length === 0 && (
									<div style={{ color: '#999', padding: 8 }}>No offered products/sizes available. Offer items first.</div>
								)}
							</div>

							<div style={{ marginTop: 10, display: 'flex', gap: 20 }}>
								<div><strong>Total Base Cost:</strong> ${packageBaseCostTotal.toFixed(2)}</div>
								<div style={{ color: packageProfit >= 0 ? '#79d279' : '#ff9a9a' }}><strong>Profit:</strong> ${packageProfit.toFixed(2)}</div>
							</div>
						</div>
					)}

					{packagesLoading ? (
						<div>Loading packages...</div>
					) : (
						<ul>
							{packages.map(pkg => {
								const packagePrice = Number(pkg.packagePrice || 0);
								const totalBase = (pkg.items || []).reduce((sum: number, item: any) => {
									const match = items.find((i: any) => Number(i.product_size_id) === Number(item.productSizeId));
									return sum + (Number(match?.base_cost || 0) * Number(item.quantity || 0));
								}, 0);
								const profit = packagePrice - totalBase;
								return (
									<li key={pkg.id}>
										{pkg.name} - ${packagePrice.toFixed(2)}
										<span style={{ marginLeft: 8, color: '#aaa' }}>base ${totalBase.toFixed(2)}</span>
										<span style={{ marginLeft: 8, color: profit >= 0 ? '#79d279' : '#ff9a9a' }}>profit ${profit.toFixed(2)}</span>
									</li>
								);
							})}
							{packages.length === 0 && <li style={{ color: '#999' }}>No packages yet.</li>}
						</ul>
					)}
				</div>
			)}
		</div>
	);
};

export default AdminPriceLists;
