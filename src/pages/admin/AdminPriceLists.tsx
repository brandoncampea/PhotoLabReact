
import React, { useState, useEffect, useMemo } from 'react';
import { studioPriceListService } from '../../services/studioPriceListService';
import { packageService } from '../../services/packageService';
import { superPriceListService } from '../../services/superPriceListService';
import { useAuth } from '../../contexts/AuthContext';
import './AdminPriceLists.css';
import ProductPriceSuggestionIcon from '../../components/ProductPriceSuggestionIcon';

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

const toCurrency = (value: unknown) => `$${Number(value || 0).toFixed(2)}`;
const toCurrencyInput = (value: unknown) => {
	if (value === null || value === undefined || value === '') return '';
	const num = Number(value);
	if (!Number.isFinite(num)) return '';
	return num.toFixed(2);
};

const estimateProfit = (baseCost: unknown, priceInput: unknown) => {
	const base = Number(baseCost || 0);
	if (priceInput === '' || priceInput === null || priceInput === undefined) return 0;
	const price = Number(priceInput);
	if (!Number.isFinite(price)) return 0;
	return price - base;
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
	const [showSuggestions, setShowSuggestions] = useState(false);


	const offeredItems = useMemo(() => (items || []).filter((i: any) => !!i.is_offered), [items]);
	// Suggest common packages based on offered items
	const suggestedPackages = useMemo(() => {
		// Helper to find a product/size by name/label
		const findProduct = (keywords: string[], sizeKeywords: string[]) => {
			return offeredItems.find((oi: any) => {
				const name = (oi.product_name || '').toLowerCase();
				const size = (oi._sizeLabel || oi.size_name || '').toLowerCase();
				return keywords.some(k => name.includes(k)) && sizeKeywords.some(sk => size.includes(sk));
			});
		};

		// Find product/size combos
		const photoPrint_8x10 = findProduct(['photo'], ['8x10']);
		const photoPrint_5x7 = findProduct(['photo'], ['5x7']);
		const photoPrint_4x5 = findProduct(['photo'], ['4x5']);
		const wallets = findProduct(['wallet'], ['wallet']);
		const button = findProduct(['button'], ['button']);
		const magnet = findProduct(['magnet'], ['magnet']);
		const keychain = findProduct(['keychain'], ['keychain']);

		// Build package suggestions
		const pkgs = [
			{
				name: 'Photo Print Starter',
				price: 19.99,
				items: [
					photoPrint_8x10 && { productId: photoPrint_8x10.product_id, productSizeId: photoPrint_8x10.product_size_id, quantity: 1 },
					photoPrint_5x7 && { productId: photoPrint_5x7.product_id, productSizeId: photoPrint_5x7.product_size_id, quantity: 2 },
				].filter(Boolean),
			},
			{
				name: 'Family Photo Value',
				price: 34.99,
				items: [
					photoPrint_8x10 && { productId: photoPrint_8x10.product_id, productSizeId: photoPrint_8x10.product_size_id, quantity: 2 },
					photoPrint_5x7 && { productId: photoPrint_5x7.product_id, productSizeId: photoPrint_5x7.product_size_id, quantity: 4 },
					photoPrint_4x5 && { productId: photoPrint_4x5.product_id, productSizeId: photoPrint_4x5.product_size_id, quantity: 4 },
				].filter(Boolean),
			},
			{
				name: 'Wallets & Magnets',
				price: 24.99,
				items: [
					wallets && { productId: wallets.product_id, productSizeId: wallets.product_size_id, quantity: 8 },
					magnet && { productId: magnet.product_id, productSizeId: magnet.product_size_id, quantity: 2 },
				].filter(Boolean),
			},
			{
				name: 'Keepsake Combo',
				price: 29.99,
				items: [
					button && { productId: button.product_id, productSizeId: button.product_size_id, quantity: 2 },
					keychain && { productId: keychain.product_id, productSizeId: keychain.product_size_id, quantity: 2 },
					magnet && { productId: magnet.product_id, productSizeId: magnet.product_size_id, quantity: 2 },
				].filter(Boolean),
			},
		];

		// Only include packages with all items present and non-negative profit
		return pkgs.filter(pkg => {
			if (!pkg.items.length) return false;
			// Calculate base cost
			let baseCost = 0;
			pkg.items.forEach((item: any) => {
				const match = offeredItems.find((oi: any) => Number(oi.product_id) === Number(item.productId) && Number(oi.product_size_id) === Number(item.productSizeId));
				if (match) baseCost += Number(match.base_cost || 0) * item.quantity;
			});
			return pkg.price - baseCost >= 0;
		});
	}, [offeredItems]);

	const handleAcceptSuggestedPackage = async (pkg: any) => {
		if (!selectedPriceList) return;
		setSavingPackage(true);
		setError(null);
		try {
			await packageService.create({
				priceListId: selectedPriceList.id,
				name: pkg.name,
				description: '',
				packagePrice: pkg.price,
				isActive: true,
				items: pkg.items,
			});
			const refreshed = await packageService.getAll(selectedPriceList.id);
			setPackages(refreshed || []);
			setShowSuggestions(false);
		} catch {
			setError('Failed to create package');
		} finally {
			setSavingPackage(false);
		}
	};

	const handleModifySuggestedPackage = (pkg: any) => {
		setShowPackageForm(true);
		setNewPackageName(pkg.name);
		setNewPackageDescription('');
		setNewPackagePrice(pkg.price.toString());
		// Set packageSelections for offeredItems
		const nextSelections: Record<number, number> = {};
		pkg.items.forEach((item: any) => {
			const match = offeredItems.find((oi: any) => Number(oi.product_id) === Number(item.productId) && Number(oi.product_size_id) === Number(item.productSizeId));
			if (match) nextSelections[match.id] = item.quantity;
		});
		setPackageSelections(nextSelections);
		setShowSuggestions(false);
	};

	const handleIgnoreSuggestions = () => setShowSuggestions(false);
	const [catCollapsed, setCatCollapsed] = useState<Record<string, boolean>>({});
	const [prodCollapsed, setProdCollapsed] = useState<Record<string, boolean>>({});
	const [itemFilterText, setItemFilterText] = useState('');

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

	const normalizedFilterText = useMemo(() => String(itemFilterText || '').trim().toLowerCase(), [itemFilterText]);

	const filteredGroupedItems = useMemo(() => {
		const next: Record<string, Record<string, any[]>> = {};
		Object.keys(groupedItems).forEach((cat) => {
			Object.keys(groupedItems[cat] || {}).forEach((product) => {
				const filteredSizes = (groupedItems[cat][product] || []).filter((item: any) => {
					if (!normalizedFilterText) return true;
					const sizeLabel = String(item._sizeLabel || item.size_name || '—');
					const searchable = `${cat} ${product} ${sizeLabel}`.toLowerCase();
					return searchable.includes(normalizedFilterText);
				});
				if (!filteredSizes.length) return;
				if (!next[cat]) next[cat] = {};
				next[cat][product] = filteredSizes;
			});
		});
		return next;
	}, [groupedItems, normalizedFilterText]);

	const filteredItemIds = useMemo(
		() => Object.values(filteredGroupedItems).flatMap((productsByName: any) =>
			Object.values(productsByName || {}).flatMap((rows: any) => rows.map((item: any) => Number(item.id)).filter((id: number) => Number.isInteger(id)))
		),
		[filteredGroupedItems]
	);

	useEffect(() => {
		if (!effectiveStudioId) return;
		setLoading(true);
		Promise.all([
			studioPriceListService.getLists(effectiveStudioId),
			superPriceListService.getLists(),
		])
			.then(([studioLists, supers]) => {
				// Debug log the raw responses
				// eslint-disable-next-line no-console
				console.log('studioLists:', studioLists, 'superLists:', supers);
				// Defensive fallback to arrays
				setPriceLists(Array.isArray(studioLists) ? studioLists : []);
				setSuperLists(Array.isArray(supers) ? supers.filter((s: any) => !!s.isActive) : []);
			})
			.catch((err) => {
				setError('Failed to load price lists');
				// eslint-disable-next-line no-console
				console.error('Error loading price lists:', err);
			})
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
		setItemFilterText('');
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
				nextDrafts[it.id] = toCurrencyInput(it.price);
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
			nextDrafts[it.id] = toCurrencyInput(it.price);
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
		return Object.values(filteredGroupedItems[category] || {}).flat().map((i: any) => i.id as number);
	};

	const getProductItemIds = (category: string, product: string) => {
		return (filteredGroupedItems[category]?.[product] || []).map((i: any) => i.id as number);
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
			const normalizedValue = value === '' ? '' : toCurrencyInput(value);
			await studioPriceListService.updateItem(selectedPriceList.id, item.id, {
				price: value === '' ? null : Number(value),
			});
			setItems(prev => prev.map((i: any) => i.id === item.id ? { ...i, price: value === '' ? null : Number(value) } : i));
			setDraftPrices(prev => ({ ...prev, [item.id]: normalizedValue }));
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
		Object.keys(filteredGroupedItems).forEach((cat) => {
			nextCats[cat] = false;
			Object.keys(filteredGroupedItems[cat] || {}).forEach((product) => {
				nextProds[`${cat}||${product}`] = false;
			});
		});
		setCatCollapsed(nextCats);
		setProdCollapsed(nextProds);
	};

	const handleContractAll = () => {
		const nextCats: Record<string, boolean> = {};
		const nextProds: Record<string, boolean> = {};
		Object.keys(filteredGroupedItems).forEach((cat) => {
			nextCats[cat] = true;
			Object.keys(filteredGroupedItems[cat] || {}).forEach((product) => {
				nextProds[`${cat}||${product}`] = true;
			});
		});
		setCatCollapsed(nextCats);
		setProdCollapsed(nextProds);
	};


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
		<div className="admin-orders-container admin-price-lists-page">
			<div className="admin-orders-header">
				<h1>Studio Price Lists</h1>
			</div>
			{!effectiveStudioId && <div className="admin-price-lists-alert">No studio context found. Cannot manage studio price lists.</div>}
			{loading && <div className="admin-price-lists-muted">Loading...</div>}
			{error && <div className="admin-price-lists-alert">{error}</div>}

			<div className="admin-price-lists-toolbar">
				<button onClick={() => setShowCreateForm(true)} disabled={!effectiveStudioId} className="btn btn-primary" style={{ marginBottom: 16 }}>+ Create Price List</button>
			</div>

			{showCreateForm && (
				<form onSubmit={handleCreatePriceList} className="admin-price-lists-create-form" style={{ marginBottom: 24 }}>
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

			<ul className="admin-price-lists-list">
				{priceLists.map(list => (
					<li key={list.id} className="admin-price-lists-list-item" style={{ marginBottom: 8 }}>
						<button onClick={() => handleSelectList(list)} className="btn btn-link">{list.name}</button>
						{list.super_price_list_name && <span style={{ marginLeft: 8, color: '#aaa' }}>from {list.super_price_list_name}</span>}
						{list.description && <span style={{ marginLeft: 8, color: '#888' }}>{list.description}</span>}
					</li>
				))}
			</ul>

			{selectedPriceList && (
				<div className="admin-orders-card" style={{ marginTop: 20 }}>
					<h3>Items for {selectedPriceList.name}</h3>
					<div className="admin-price-lists-filters-row" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
						<label style={{ color: '#aaa' }}>Filter:</label>
						<input
							type="text"
							value={itemFilterText}
							onChange={(e) => setItemFilterText(e.target.value)}
							placeholder="Type category, product, or size"
							style={{ minWidth: 280 }}
						/>
						<button
							className="btn btn-secondary btn-sm"
							onClick={() => setItemFilterText('')}
						>
							Clear Filters
						</button>
					</div>
					<div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
						<button
							className="btn btn-secondary btn-sm"
							onClick={() => handleToggleOfferedBulk(filteredItemIds, true)}
						>
							Offer All
						</button>
						<button
							className="btn btn-secondary btn-sm"
							onClick={() => handleToggleOfferedBulk(filteredItemIds, false)}
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
						{Object.keys(filteredGroupedItems).length === 0 && (
							<div style={{ color: '#999' }}>No items match the current filters.</div>
						)}
						{Object.keys(filteredGroupedItems).map((cat) => (
							<div key={cat} style={{ border: '1px solid #2c2c3a', borderRadius: 8, marginBottom: 6, overflow: 'hidden' }}>
								{(() => {
									const firstProduct = Object.keys(filteredGroupedItems[cat] || {})[0];
									const firstItem = firstProduct ? filteredGroupedItems[cat][firstProduct]?.[0] : null;
								const [uploadingCat, setUploadingCat] = useState<string | null>(null);
								const [catImagePreview, setCatImagePreview] = useState<{ [cat: string]: string }>({});
								async function handleCategoryImageUpload(e: React.ChangeEvent<HTMLInputElement>, cat: string) {
									const file = e.target.files?.[0];
									if (!file) return;
									setUploadingCat(cat);
									const reader = new FileReader();
									reader.onload = ev => {
										setCatImagePreview(prev => ({ ...prev, [cat]: ev.target?.result as string }));
									};
									reader.readAsDataURL(file);
									// Upload to backend
									const formData = new FormData();
									formData.append('image', file);
									formData.append('category_name', cat);
									// Find the super price list id (firstItem?.super_price_list_id or from selectedSuperListId)
									const superListId = firstItem?.super_price_list_id || selectedSuperListId;
									await fetch(`/api/super-price-lists/${superListId}/category-image`, {
										method: 'POST',
										body: formData,
										headers: user?.token ? { Authorization: `Bearer ${user.token}` } : undefined,
									})
										.then(res => res.json())
										.then(data => {
											if (data.image_url) {
												setCatImagePreview(prev => ({ ...prev, [cat]: data.image_url }));
											}
										})
										.finally(() => setUploadingCat(null));
								}
								return (
									<div
										style={{ background: '#1f1b35', padding: '6px 10px', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}
										onClick={() => setCatCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }))}
									>
										<span>{catCollapsed[cat] ? '▶' : '▼'}</span>
										{(catImagePreview[cat] || categoryImageUrl) ? (
											<img
												src={catImagePreview[cat] || categoryImageUrl}
												alt={cat}
												style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover', border: '1px solid #444' }}
											/>
										) : (
											<span style={{ fontSize: 14, opacity: 0.7 }}>🖼</span>
										)}
										<span>{cat}</span>
										<label style={{ marginLeft: 12, cursor: 'pointer', fontSize: 12, color: '#aaf', display: 'flex', alignItems: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>
											<input
												type="file"
												accept="image/*"
												style={{ display: 'none' }}
												onChange={e => handleCategoryImageUpload(e, cat)}
												disabled={uploadingCat === cat}
											/>
											<span style={{ border: '1px solid #444', borderRadius: 4, padding: '2px 8px', background: '#23223a' }}>
												{uploadingCat === cat ? 'Uploading...' : 'Upload Image'}
											</span>
										</label>
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
										{Object.keys(filteredGroupedItems[cat]).map((product) => {
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
															{filteredGroupedItems[cat][product].map((item: any) => (
																<div key={item.id} style={{ display: 'grid', gridTemplateColumns: '74px 1fr 100px 120px 90px', gap: 6, alignItems: 'center', padding: '4px 8px', borderTop: '1px solid #232036' }}>
																	<label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
																		<input
																			type="checkbox"
																			checked={!!item.is_offered}
																			onChange={e => handleToggleOffered(item, e.target.checked)}
																		/>
																		<span style={{ fontSize: 12 }}>Offer</span>
																	</label>
																	<div>
																		{item._sizeLabel || item.size_name || '—'}
																		<ProductPriceSuggestionIcon productName={item.product_name} sizeLabel={item._sizeLabel || item.size_name || ''} baseCost={item.base_cost} />
																	</div>
																	<div>{toCurrency(item.base_cost)}</div>
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
																	<div style={{ fontSize: 12, color: '#aaa', textAlign: 'right' }}>
																		{(() => {
																			const profit = estimateProfit(item.base_cost, draftPrices[item.id]);
																			const color = profit >= 0 ? '#79d279' : '#ff9a9a';
																			return <span style={{ color }}>Est. Profit {toCurrency(profit)}</span>;
																		})()}
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
						))}
					</div>


					<h3 style={{ marginTop: 32 }}>Packages</h3>
					<div style={{ marginBottom: 10, display: 'flex', gap: 12 }}>
						<button className="btn btn-primary btn-sm" onClick={() => setShowPackageForm(v => !v)}>
							{showPackageForm ? 'Cancel Package' : '+ Add Package'}
						</button>
						<button className="btn btn-secondary btn-sm" onClick={() => setShowSuggestions(true)}>
							Suggest Packages
						</button>
					</div>

					{showSuggestions && suggestedPackages.length > 0 && (
						<div style={{
							background: '#fff',
							border: '2px solid #7c3aed',
							boxShadow: '0 4px 24px 0 rgba(124,58,237,0.10)',
							padding: 28,
							borderRadius: 16,
							marginBottom: 32,
							maxWidth: 600,
							marginLeft: 'auto',
							marginRight: 'auto',
							color: '#18181b',
						}}>
							<h4 style={{ color: '#7c3aed', fontWeight: 700, marginBottom: 8, fontSize: 22, letterSpacing: 0.2 }}>Suggested Packages</h4>
							<p style={{ color: '#444', marginBottom: 18, fontSize: 16 }}>Here are some common packages offered by other photography studios. You can accept, modify, or ignore these suggestions.</p>
							<ul style={{ marginBottom: 18, paddingLeft: 0 }}>
								{suggestedPackages.map((pkg, idx) => {
									// Calculate base cost and retail value for this package
									let baseCost = 0;
									let retailValue = 0;
									pkg.items.forEach((item: any) => {
										const match = offeredItems.find((oi: any) => Number(oi.product_id) === Number(item.productId) && Number(oi.product_size_id) === Number(item.productSizeId));
										if (match) {
											baseCost += Number(match.base_cost || 0) * item.quantity;
											retailValue += Number(match.price || 0) * item.quantity;
										}
									});
									const profit = pkg.price - baseCost;
									const savings = retailValue > 0 ? retailValue - pkg.price : 0;
									return (
										<li key={pkg.name + idx} style={{
											marginBottom: 18,
											background: '#f3f0ff',
											border: '1px solid #e9d5ff',
											borderRadius: 10,
											padding: 16,
											listStyle: 'none',
											boxShadow: '0 2px 8px 0 rgba(124,58,237,0.04)',
										}}>
											<div style={{ fontWeight: 600, fontSize: 18, color: '#5b21b6', marginBottom: 4 }}>{pkg.name} <span style={{ color: '#7c3aed', fontWeight: 400, fontSize: 16 }}>— ${pkg.price.toFixed(2)}</span></div>
											<ul style={{ margin: '6px 0 12px 18px', color: '#444', fontSize: 15 }}>
												{pkg.items.map((item: any, i: number) => {
													const match = offeredItems.find((oi: any) => Number(oi.product_id) === Number(item.productId) && Number(oi.product_size_id) === Number(item.productSizeId));
													return (
														<li key={i} style={{ marginBottom: 2 }}>{match ? <span><span style={{ color: '#7c3aed', fontWeight: 500 }}>{match.product_name}</span> <span style={{ color: '#a78bfa' }}>- {match._sizeLabel || match.size_name || '—'}</span></span> : 'Product'} <span style={{ color: '#a1a1aa' }}>(x{item.quantity})</span></li>
													);
												})}
											</ul>
											<div style={{ display: 'flex', gap: 24, alignItems: 'center', marginBottom: 10 }}>
												<span style={{ color: profit >= 0 ? '#059669' : '#dc2626', fontWeight: 600, fontSize: 15 }}>Est. Profit: ${profit.toFixed(2)}</span>
												<span style={{ color: '#2563eb', fontWeight: 600, fontSize: 15 }}>Customer Savings: ${savings.toFixed(2)}</span>
											</div>
											<div style={{ display: 'flex', gap: 12 }}>
												<button style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 18px', fontWeight: 600, fontSize: 15, cursor: 'pointer', boxShadow: '0 1px 4px 0 #ede9fe' }} onClick={() => handleAcceptSuggestedPackage(pkg)}>Accept</button>
												<button style={{ background: '#ede9fe', color: '#5b21b6', border: 'none', borderRadius: 6, padding: '6px 18px', fontWeight: 600, fontSize: 15, cursor: 'pointer', boxShadow: '0 1px 4px 0 #ede9fe' }} onClick={() => handleModifySuggestedPackage(pkg)}>Modify</button>
											</div>
										</li>
									);
								})}
							</ul>
							<button style={{ background: '#ede9fe', color: '#7c3aed', border: 'none', borderRadius: 6, padding: '7px 22px', fontWeight: 600, fontSize: 15, cursor: 'pointer', marginTop: 6 }} onClick={handleIgnoreSuggestions}>Ignore Suggestions</button>
						</div>
					)}

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
