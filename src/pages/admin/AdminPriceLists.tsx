
import React, { useState, useEffect, useMemo } from 'react';

import { studioPriceListService } from '../../services/studioPriceListService';
import { superPriceListService } from '../../services/superPriceListService';
import { useAuth } from '../../contexts/AuthContext';
import './AdminPriceLists.css';

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

const computedDisplayCost = (item: any, draftPrice: unknown) => {
	const pricingMode = String(item?.digital_pricing_mode || '').trim().toLowerCase();
	const pct = Number(item?.super_admin_percentage);
	if (pricingMode === 'percentage' && Number.isFinite(pct)) {
		const priceSource = draftPrice === '' || draftPrice === null || draftPrice === undefined
			? item?.price
			: draftPrice;
		const studioPrice = Number(priceSource);
		if (Number.isFinite(studioPrice)) {
			return Number((studioPrice * (pct / 100)).toFixed(2));
		}
	}

	const superMarkupPercent = Number(item?.super_markup_percent);
	const whccCost = Number(item?.base_cost || 0);
	if (Number.isFinite(superMarkupPercent) && Number.isFinite(whccCost)) {
		return Number((whccCost + (whccCost * (superMarkupPercent / 100))).toFixed(2));
	}

	return Number(item?.base_cost || 0);
};

type StudioVariantDraft = {
	key: string;
	id: number | null;
	label: string;
	whccProductUID: number;
	whccItemAttributeUIDs: number[];
	superCost: number | null;
	studioPrice: string;
	isDefault: boolean;
	isActive: boolean;
};

const toMoneyInput = (value: unknown) => {
	if (value === null || value === undefined || value === '') return '';
	const num = Number(value);
	return Number.isFinite(num) ? num.toFixed(2) : '';
};

const variantKey = (variant: any) => {
	const id = Number(variant?.id || 0);
	if (Number.isInteger(id) && id > 0) return `id:${id}`;
	const uid = Number(variant?.whccProductUID || 0);
	const attrs = Array.isArray(variant?.whccItemAttributeUIDs)
		? variant.whccItemAttributeUIDs.map(Number).filter((v: number) => Number.isInteger(v) && v > 0)
		: [];
	const label = String(variant?.displayName || '').trim().toLowerCase();
	return `uid:${uid}|attrs:${attrs.join('-')}|label:${label}`;
};

const getVariantLabelsForItem = (item: any): string[] => {
	const sourceVariants = Array.isArray(item?.studioWhccVariants) && item.studioWhccVariants.length
		? item.studioWhccVariants
		: (Array.isArray(item?.whccVariants) ? item.whccVariants : []);
	if (!Array.isArray(sourceVariants)) return [];
	return sourceVariants
		.filter((variant: any) => variant?.isActive !== false)
		.map((variant: any) => String(variant?.displayName || '').trim())
		.filter((name: string) => name.length > 0);
};

const buildProductGroupKey = (item: any) => baseProductName(item?.product_name || 'Unknown Product');
const makeGroupUiKey = (category: string, groupKey: string) => `${category}||${groupKey}`;
const itemHasVariantPricing = (item: any): boolean => {
	if (Array.isArray(item?.studioWhccVariants) && item.studioWhccVariants.length > 0) return true;
	if (Array.isArray(item?.whccVariants) && item.whccVariants.length > 0) return true;
	if (Array.isArray(item?.whccAttributeCategories) && item.whccAttributeCategories.length > 0) return true;
	if (getVariantLabelsForItem(item).length > 0) return true;
	return false;
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
const [, setProductOrderDrafts] = useState<Record<string, string>>({});
const [draggingProductKey, setDraggingProductKey] = useState<string | null>(null);
const [draggingRecommendedProductId, setDraggingRecommendedProductId] = useState<number | null>(null);
const [markupPercent, setMarkupPercent] = useState('');
const [applyingMarkup, setApplyingMarkup] = useState(false);
const [openVariantItemIds, setOpenVariantItemIds] = useState<Record<number, boolean>>({});
const [variantDraftsByItem, setVariantDraftsByItem] = useState<Record<number, StudioVariantDraft[]>>({});
const [savingVariantItemId, setSavingVariantItemId] = useState<number | null>(null);
const [savingProductKey, setSavingProductKey] = useState<string | null>(null);


	const [catCollapsed, setCatCollapsed] = useState<Record<string, boolean>>({});
	const [prodCollapsed, setProdCollapsed] = useState<Record<string, boolean>>({});
	const [itemFilterText, setItemFilterText] = useState('');

	const buildVariantDrafts = (item: any): StudioVariantDraft[] => {
		const sourceVariants = Array.isArray(item?.studioWhccVariants) && item.studioWhccVariants.length
			? item.studioWhccVariants
			: (Array.isArray(item?.whccVariants) ? item.whccVariants : []);

		return sourceVariants
			.map((variant: any, index: number) => {
				const uid = Number(variant?.whccProductUID || 0);
				if (!Number.isInteger(uid) || uid <= 0) return null;
				const attrs = Array.isArray(variant?.whccItemAttributeUIDs)
					? variant.whccItemAttributeUIDs.map(Number).filter((v: number) => Number.isInteger(v) && v > 0)
					: [];
				const superPrice = Number(variant?.price);
				const superCost = Number.isFinite(superPrice)
					? Number(superPrice.toFixed(2))
					: Number.isFinite(Number(item?.base_cost)) && Number.isFinite(Number(item?.super_markup_percent))
						? Number((Number(item.base_cost) + (Number(item.base_cost) * (Number(item.super_markup_percent) / 100))).toFixed(2))
						: null;
				const studioPrice = Number.isFinite(Number(variant?.studioPrice))
					? toMoneyInput(variant?.studioPrice)
					: toMoneyInput(item?.price);
				return {
					key: variantKey({ ...variant, displayName: String(variant?.displayName || ''), whccItemAttributeUIDs: attrs }) || `row-${index}`,
					id: Number(variant?.id || 0) || null,
					label: String(variant?.displayName || '').trim() || (attrs.length ? `Attribute UID${attrs.length === 1 ? '' : 's'} ${attrs.join(', ')}` : `Variant ${index + 1}`),
					whccProductUID: uid,
					whccItemAttributeUIDs: attrs,
					superCost,
					studioPrice,
					isDefault: Boolean(variant?.isDefault),
					isActive: variant?.isActive !== false,
				} as StudioVariantDraft;
			})
			.filter(Boolean) as StudioVariantDraft[];
	};

	const openVariantEditor = (item: any) => {
		const itemId = Number(item?.id || 0);
		if (!Number.isInteger(itemId) || itemId <= 0) return;
		setVariantDraftsByItem((prev) => ({ ...prev, [itemId]: buildVariantDrafts(item) }));
		setOpenVariantItemIds((prev) => ({ ...prev, [itemId]: true }));
	};

	const closeVariantEditor = (itemId: number, clearDraft = true) => {
		setOpenVariantItemIds((prev) => {
			if (!prev[itemId]) return prev;
			const next = { ...prev };
			delete next[itemId];
			return next;
		});
		if (clearDraft) {
			setVariantDraftsByItem((prev) => {
				if (!prev[itemId]) return prev;
				const next = { ...prev };
				delete next[itemId];
				return next;
			});
		}
	};

	const setProductVariantEditors = (productItems: any[], expand: boolean) => {
		const validItems = (productItems || []).filter((row: any) => {
			const itemId = Number(row?.id || 0);
			return Number.isInteger(itemId) && itemId > 0;
		});
		if (!validItems.length) return;

		if (expand) {
			setVariantDraftsByItem((prev) => {
				const next = { ...prev };
				validItems.forEach((row: any) => {
					const itemId = Number(row.id);
					next[itemId] = buildVariantDrafts(row);
				});
				return next;
			});
			setOpenVariantItemIds((prev) => {
				const next = { ...prev };
				validItems.forEach((row: any) => {
					next[Number(row.id)] = true;
				});
				return next;
			});
			return;
		}

		setOpenVariantItemIds((prev) => {
			const next = { ...prev };
			validItems.forEach((row: any) => {
				delete next[Number(row.id)];
			});
			return next;
		});
		setVariantDraftsByItem((prev) => {
			const next = { ...prev };
			validItems.forEach((row: any) => {
				delete next[Number(row.id)];
			});
			return next;
		});
	};

	const updateVariantStudioPrice = (itemId: number, key: string, value: string) => {
		setVariantDraftsByItem((prev) => ({
			...prev,
			[itemId]: (prev[itemId] || []).map((row) => row.key === key ? { ...row, studioPrice: value } : row),
		}));
	};

	const buildVariantUpdatePayload = (rows: StudioVariantDraft[]) => {
		const payloadVariants = rows.map((row) => {
			const priceNum = Number(row.studioPrice);
			const superCost = Number(row.superCost);
			const markupPercent = Number.isFinite(priceNum) && Number.isFinite(superCost) && superCost > 0
				? Number((((priceNum - superCost) / superCost) * 100).toFixed(2))
				: null;
			return {
				id: row.id,
				displayName: row.label,
				whccProductUID: row.whccProductUID,
				whccItemAttributeUIDs: row.whccItemAttributeUIDs,
				studioPrice: Number.isFinite(priceNum) ? Number(priceNum.toFixed(2)) : null,
				studioMarkupPercent: markupPercent,
			};
		});

		const defaultRow = rows.find((row) => row.isDefault && row.isActive)
			|| rows.find((row) => row.isActive)
			|| rows[0];
		const defaultPrice = Number(defaultRow?.studioPrice);
		return {
			payloadVariants,
			defaultPrice: Number.isFinite(defaultPrice) ? Number(defaultPrice.toFixed(2)) : null,
		};
	};

	const hasPendingProductPriceChanges = (productItems: any[]): boolean => {
		return (productItems || []).some((item: any) => {
			const itemId = Number(item?.id || 0);
			if (!Number.isInteger(itemId) || itemId <= 0) return false;

			if (itemHasVariantPricing(item)) {
				const draftRows = variantDraftsByItem[itemId];
				if (!Array.isArray(draftRows) || !draftRows.length) return false;
				const sourceRows = buildVariantDrafts(item);
				const draftSig = JSON.stringify(draftRows.map((row) => ({ key: row.key, studioPrice: String(row.studioPrice || ''), isActive: !!row.isActive, isDefault: !!row.isDefault })));
				const sourceSig = JSON.stringify(sourceRows.map((row) => ({ key: row.key, studioPrice: String(row.studioPrice || ''), isActive: !!row.isActive, isDefault: !!row.isDefault })));
				return draftSig !== sourceSig;
			}

			const draftValue = draftPrices[itemId];
			if (draftValue === undefined) return false;
			const normalizedDraft = draftValue === '' ? '' : toCurrencyInput(draftValue);
			const normalizedCurrent = toCurrencyInput(item?.price);
			return normalizedDraft !== normalizedCurrent;
		});
	};

	const saveProductPricing = async (category: string, product: string, productItems: any[]) => {
		if (!selectedPriceList) return;
		const productKey = `${category}||${product}`;
		setSavingProductKey(productKey);
		try {
			const updates: Array<Promise<any>> = [];

			(productItems || []).forEach((item: any) => {
				const itemId = Number(item?.id || 0);
				if (!Number.isInteger(itemId) || itemId <= 0) return;

				if (itemHasVariantPricing(item)) {
					const rows = variantDraftsByItem[itemId];
					if (!Array.isArray(rows) || !rows.length) return;
					const sourceRows = buildVariantDrafts(item);
					const draftSig = JSON.stringify(rows.map((row) => ({ key: row.key, studioPrice: String(row.studioPrice || ''), isActive: !!row.isActive, isDefault: !!row.isDefault })));
					const sourceSig = JSON.stringify(sourceRows.map((row) => ({ key: row.key, studioPrice: String(row.studioPrice || ''), isActive: !!row.isActive, isDefault: !!row.isDefault })));
					if (draftSig === sourceSig) return;
					const { payloadVariants, defaultPrice } = buildVariantUpdatePayload(rows);
					updates.push(studioPriceListService.updateItem(selectedPriceList.id, itemId, {
						whccVariants: payloadVariants,
						price: defaultPrice,
					}));
					return;
				}

				const value = draftPrices[itemId];
				if (value === undefined) return;
				const normalizedValue = value === '' ? '' : toCurrencyInput(value);
				const currentValue = toCurrencyInput(item?.price);
				if (normalizedValue === currentValue) return;
				updates.push(studioPriceListService.updateItem(selectedPriceList.id, itemId, {
					price: value === '' ? null : Number(value),
				}));
			});

			if (!updates.length) return;
			await Promise.all(updates);
			await refreshSelectedItems();
		} catch {
			setError('Failed to save product pricing updates');
		} finally {
			setSavingProductKey(null);
		}
	};

	const saveVariantStudioPricing = async (item: any) => {
		if (!selectedPriceList) return;
		const itemId = Number(item?.id || 0);
		if (!Number.isInteger(itemId) || itemId <= 0) return;
		const rows = variantDraftsByItem[itemId] || [];
		if (!rows.length) {
			setError('No variant rows available to save.');
			return;
		}

		const payloadVariants = rows.map((row) => {
			const priceNum = Number(row.studioPrice);
			const superCost = Number(row.superCost);
			const markupPercent = Number.isFinite(priceNum) && Number.isFinite(superCost) && superCost > 0
				? Number((((priceNum - superCost) / superCost) * 100).toFixed(2))
				: null;
			return {
				id: row.id,
				displayName: row.label,
				whccProductUID: row.whccProductUID,
				whccItemAttributeUIDs: row.whccItemAttributeUIDs,
				studioPrice: Number.isFinite(priceNum) ? Number(priceNum.toFixed(2)) : null,
				studioMarkupPercent: markupPercent,
			};
		});

		const defaultRow = rows.find((row) => row.isDefault && row.isActive)
			|| rows.find((row) => row.isActive)
			|| rows[0];
		const defaultPrice = Number(defaultRow?.studioPrice);

		setSavingVariantItemId(itemId);
		try {
			await studioPriceListService.updateItem(selectedPriceList.id, itemId, {
				whccVariants: payloadVariants,
				price: Number.isFinite(defaultPrice) ? Number(defaultPrice.toFixed(2)) : null,
			});
			await refreshSelectedItems();
			closeVariantEditor(itemId, false);
		} catch {
			setError('Failed to save attribute/variant pricing');
		} finally {
			setSavingVariantItemId(null);
		}
	};

	const groupedItems = useMemo(() => {
		const grouped: Record<string, Record<string, any[]>> = {};
		(items || []).forEach((item: any) => {
			const cat = item.product_category || 'Uncategorized';
			const product = buildProductGroupKey(item);
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

	const filteredAlbumPurchaseItemIds = useMemo(
		() => Object.values(filteredGroupedItems).flatMap((productsByName: any) =>
			Object.values(productsByName || {}).flatMap((rows: any) =>
				(rows || [])
					.filter((item: any) => String(item?.digital_download_scope || '').trim().toLowerCase() === 'album')
					.map((item: any) => Number(item.id))
					.filter((id: number) => Number.isInteger(id))
			)
		),
		[filteredGroupedItems]
	);

	const recommendedProductsForOrdering = useMemo(() => {
		const map = new Map<string, any>();
		(items || []).forEach((item: any) => {
			if (!Number(item?.is_recommended)) return;
			const productId = Number(item?.product_id || 0);
			if (!Number.isInteger(productId) || productId <= 0) return;
			const category = String(item?.product_category || 'Uncategorized');
			const productName = baseProductName(item?.product_name || 'Unknown Product');
			const groupKey = makeGroupUiKey(category, productName);
			if (!map.has(groupKey)) {
				map.set(groupKey, {
					groupKey,
					productIds: [productId],
					productName,
					category,
					imageUrl: item?.product_image_url || item?.category_image_url || '',
					displayOrder: item?.display_order === null || item?.display_order === undefined ? null : Number(item.display_order),
				});
			} else {
				const existing = map.get(groupKey);
				if (!existing.productIds.includes(productId)) existing.productIds.push(productId);
				const currentOrder = Number(existing.displayOrder);
				const nextOrder = Number(item?.display_order);
				if (Number.isFinite(nextOrder) && (!Number.isFinite(currentOrder) || nextOrder < currentOrder)) {
					existing.displayOrder = nextOrder;
				}
			}
		});

		return Array.from(map.values()).sort((a, b) => {
			const aHas = Number.isFinite(Number(a.displayOrder));
			const bHas = Number.isFinite(Number(b.displayOrder));
			if (aHas && bHas && Number(a.displayOrder) !== Number(b.displayOrder)) {
				return Number(a.displayOrder) - Number(b.displayOrder);
			}
			if (aHas !== bHas) return aHas ? -1 : 1;
			return String(a.productName || '').localeCompare(String(b.productName || ''));
		});
	}, [items]);

	useEffect(() => {
		if (!effectiveStudioId) return;
		setLoading(true);
		Promise.all([
			studioPriceListService.getLists(effectiveStudioId),
			superPriceListService.getLists(),
		])
			.then(([studioLists, supers]) => {
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


	const handleSelectList = async (list: any) => {
		setSelectedPriceList(list);
		setItemFilterText('');
		setOpenVariantItemIds({});
		setVariantDraftsByItem({});
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
			const nextProductOrders: Record<string, string> = {};
			(items || []).forEach((it: any) => {
				nextDrafts[it.id] = toCurrencyInput(it.price);
				const cat = it.product_category || 'Uncategorized';
				const productGroup = buildProductGroupKey(it);
				const groupUiKey = makeGroupUiKey(cat, productGroup);
				if (nextProductOrders[groupUiKey] === undefined) {
					const orderValue = it?.display_order;
					nextProductOrders[groupUiKey] = orderValue === null || orderValue === undefined ? '' : String(orderValue);
				}
			});
			setDraftPrices(nextDrafts);
			setProductOrderDrafts(nextProductOrders);
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
		setOpenVariantItemIds({});
		setVariantDraftsByItem({});
		const nextDrafts: Record<number, string> = {};
		const nextProductOrders: Record<string, string> = {};
		(refreshed || []).forEach((it: any) => {
			nextDrafts[it.id] = toCurrencyInput(it.price);
			const cat = it.product_category || 'Uncategorized';
			const productGroup = buildProductGroupKey(it);
			const groupUiKey = makeGroupUiKey(cat, productGroup);
			if (nextProductOrders[groupUiKey] === undefined) {
				const orderValue = it?.display_order;
				nextProductOrders[groupUiKey] = orderValue === null || orderValue === undefined ? '' : String(orderValue);
			}
		});
		setDraftPrices(nextDrafts);
		setProductOrderDrafts(nextProductOrders);
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

	const getProductItemIds = (category: string, productGroupKey: string) => {
		return (filteredGroupedItems[category]?.[productGroupKey] || []).map((i: any) => i.id as number);
	};

	const getGroupRows = (category: string, productGroupKey: string) => (groupedItems[category]?.[productGroupKey] || []);

	const getProductPrefsFromGroup = (category: string, productGroupKey: string) => {
		const rows = getGroupRows(category, productGroupKey);
		const first = rows[0] || null;
		const productIds = Array.from(new Set(rows.map((row: any) => Number(row?.product_id || 0)).filter((id: number) => Number.isInteger(id) && id > 0)));
		const finiteOrders = rows.map((row: any) => Number(row?.display_order)).filter((n: number) => Number.isFinite(n));
		return {
			productIds,
			isRecommended: rows.some((row: any) => !!row?.is_recommended),
			displayOrder: finiteOrders.length ? Math.min(...finiteOrders) : (first?.display_order === null || first?.display_order === undefined ? null : Number(first.display_order)),
		};
	};

	const handleUpdateProductPreferences = async (category: string, productGroupKey: string, patch: { is_recommended?: boolean; display_order?: number | null }) => {
		if (!selectedPriceList) return;
		const prefs = getProductPrefsFromGroup(category, productGroupKey);
		if (!prefs.productIds.length) return;
		try {
			await Promise.all(
				prefs.productIds.map((productId: number) =>
					studioPriceListService.updateProductPreferences(selectedPriceList.id, productId, patch)
				)
			);
			setItems(prev => prev.map((row: any) => {
				const pid = Number(row?.product_id || 0);
				if (!prefs.productIds.includes(pid)) return row;
				return {
					...row,
					...(patch.is_recommended !== undefined ? { is_recommended: patch.is_recommended ? 1 : 0 } : {}),
					...(Object.prototype.hasOwnProperty.call(patch, 'display_order') ? { display_order: patch.display_order } : {}),
				};
			}));
		} catch {
			setError('Failed to update product preferences');
		}
	};

	const isAllOffered = (ids: number[]) => ids.length > 0 && ids.every(id => !!items.find((i: any) => i.id === id)?.is_offered);

	const saveProductOrderForCategory = async (category: string, reorderedKeys: string[]) => {
		if (!selectedPriceList || reorderedKeys.length === 0) return;
		const categoryNames = Object.keys(filteredGroupedItems).sort((a, b) => a.localeCompare(b));
		const categoryIndex = Math.max(0, categoryNames.indexOf(category));
		const base = (categoryIndex + 1) * 1000;
		const payload = reorderedKeys
			.flatMap((groupKey, idx) => {
				const groupRows = getGroupRows(category, groupKey);
				const groupProductIds = Array.from(new Set(groupRows.map((row: any) => Number(row?.product_id || 0)).filter((id: number) => Number.isInteger(id) && id > 0)));
				return groupProductIds.map((productId: number) => ({ product_id: productId, display_order: base + idx }));
			})
			.filter((row) => Number.isInteger(row.product_id) && row.product_id > 0) as Array<{ product_id: number; display_order: number }>;

		if (!payload.length) return;

		await studioPriceListService.bulkUpdateProductDisplayOrder(selectedPriceList.id, payload);

		setItems(prev => prev.map((row: any) => {
			const pid = Number(row?.product_id || 0);
			const matched = payload.find((p) => p.product_id === pid);
			return matched ? { ...row, display_order: matched.display_order } : row;
		}));
		setProductOrderDrafts(prev => {
			const next = { ...prev };
			reorderedKeys.forEach((groupKey, idx) => {
				next[makeGroupUiKey(category, groupKey)] = String(base + idx);
			});
			return next;
		});
	};

	const saveRecommendedProductOrder = async (reorderedGroupKeys: string[]) => {
		if (!selectedPriceList || reorderedGroupKeys.length === 0) return;
		const recommendedMap = new Map(recommendedProductsForOrdering.map((p: any) => [String(p.groupKey), p]));
		const payload = reorderedGroupKeys
			.flatMap((groupKey, idx) => {
				const entry = recommendedMap.get(String(groupKey));
				const groupProductIds = Array.isArray(entry?.productIds) ? entry.productIds : [];
				return groupProductIds.map((productId: number) => ({ product_id: Number(productId), display_order: idx + 1 }));
			})
			.filter((row) => Number.isInteger(row.product_id) && row.product_id > 0);
		if (!payload.length) return;

		await studioPriceListService.bulkUpdateProductDisplayOrder(selectedPriceList.id, payload);

		setItems(prev => prev.map((row: any) => {
			const pid = Number(row?.product_id || 0);
			const matched = payload.find((p) => p.product_id === pid);
			return matched ? { ...row, display_order: matched.display_order } : row;
		}));
		setProductOrderDrafts(prev => {
			const next = { ...prev };
			reorderedGroupKeys.forEach((groupKey, idx) => {
				next[groupKey] = String(idx + 1);
			});
			return next;
		});
	};

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
		setOpenVariantItemIds({});
		setVariantDraftsByItem({});
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
		setOpenVariantItemIds({});
		setVariantDraftsByItem({});
	};

	const isTreeExpanded = useMemo(() => {
		const categories = Object.keys(filteredGroupedItems);
		if (!categories.length) return false;
		return categories.every((cat) => {
			if (catCollapsed[cat]) return false;
			return Object.keys(filteredGroupedItems[cat] || {}).every((product) => !prodCollapsed[`${cat}||${product}`]);
		});
	}, [filteredGroupedItems, catCollapsed, prodCollapsed]);

	const handleToggleExpandAll = () => {
		if (isTreeExpanded) {
			handleContractAll();
			return;
		}
		handleExpandAll();
	};

	const PRICE_MOVE_DRAG_MIME = 'application/x-photolab-price-move';

	const parseDragPayload = (event: React.DragEvent): any | null => {
		const raw = event.dataTransfer.getData(PRICE_MOVE_DRAG_MIME) || event.dataTransfer.getData('text/plain');
		if (!raw) return null;
		try {
			return JSON.parse(raw);
		} catch {
			return null;
		}
	};

	const beginProductCategoryDrag = (event: React.DragEvent, item: any) => {
		const payload = {
			kind: 'product',
			productId: Number(item?.product_id || 0),
			productName: String(baseProductName(item?.product_name || 'Unknown Product')),
			sourceCategory: String(item?.product_category || ''),
		};
		const encoded = JSON.stringify(payload);
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData(PRICE_MOVE_DRAG_MIME, encoded);
		event.dataTransfer.setData('text/plain', encoded);
	};

	const beginSizeCategoryDrag = (event: React.DragEvent, item: any) => {
		const payload = {
			kind: 'size',
			itemId: Number(item?.id || 0),
			productName: String(baseProductName(item?.product_name || 'Unknown Product')),
			sourceCategory: String(item?.product_category || ''),
		};
		const encoded = JSON.stringify(payload);
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData(PRICE_MOVE_DRAG_MIME, encoded);
		event.dataTransfer.setData('text/plain', encoded);
	};

	const handleDropOnCategory = async (event: React.DragEvent, targetCategory: string) => {
		event.preventDefault();
		if (!selectedPriceList) return;
		const payload = parseDragPayload(event);
		if (!payload) return;

		try {
			if (payload.kind === 'product' && Number(payload.productId) > 0) {
				if (String(payload.sourceCategory || '') === targetCategory) return;
				await studioPriceListService.moveProductToCategory(selectedPriceList.id, Number(payload.productId), targetCategory);
			} else if (payload.kind === 'size' && Number(payload.itemId) > 0) {
				if (String(payload.sourceCategory || '') === targetCategory) return;
				await studioPriceListService.moveItemToCategory(
					selectedPriceList.id,
					Number(payload.itemId),
					targetCategory,
					String(payload.productName || '').trim() || undefined
				);
			} else {
				return;
			}
			await refreshSelectedItems();
		} catch (err: any) {
			setError(err?.response?.data?.error || err?.message || 'Failed to move item with drag and drop.');
		}
	};

	const handleDropOnProduct = async (event: React.DragEvent, targetCategory: string, targetProductName: string) => {
		event.preventDefault();
		if (!selectedPriceList) return;
		const payload = parseDragPayload(event);
		if (!payload) return;

		try {
			if (payload.kind === 'size' && Number(payload.itemId) > 0) {
				await studioPriceListService.moveItemToCategory(
					selectedPriceList.id,
					Number(payload.itemId),
					targetCategory,
					targetProductName || undefined
				);
			} else if (payload.kind === 'product' && Number(payload.productId) > 0) {
				if (String(payload.sourceCategory || '') === targetCategory) return;
				await studioPriceListService.moveProductToCategory(selectedPriceList.id, Number(payload.productId), targetCategory);
			} else {
				return;
			}
			await refreshSelectedItems();
		} catch (err: any) {
			setError(err?.response?.data?.error || err?.message || 'Failed to drop item on product.');
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
					{recommendedProductsForOrdering.length > 0 && (
						<div style={{ marginBottom: 14, border: '1px solid #2b2550', borderRadius: 8, padding: 10, background: '#171428' }}>
							<div style={{ marginBottom: 8, color: '#c5bcff', fontWeight: 700 }}>Recommended Product Order</div>
							<div style={{ fontSize: 12, color: '#9d97bf', marginBottom: 8 }}>Drag cards to set customer-facing order for recommended products.</div>
							<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
								{recommendedProductsForOrdering.map((product, index, arr) => (
									<div
										key={product.groupKey}
										draggable
										onDragStart={() => setDraggingRecommendedProductId(index)}
										onDragOver={(e) => e.preventDefault()}
										onDrop={async (e) => {
											e.preventDefault();
											if (draggingRecommendedProductId === null || draggingRecommendedProductId === index) return;
											try {
												const groupKeys = arr.map((p) => String(p.groupKey));
												const fromIndex = Number(draggingRecommendedProductId);
												const toIndex = index;
												if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
												const next = [...groupKeys];
												const [moved] = next.splice(fromIndex, 1);
												next.splice(toIndex, 0, moved);
												await saveRecommendedProductOrder(next);
											} catch {
												setError('Failed to reorder recommended products');
											} finally {
												setDraggingRecommendedProductId(null);
											}
										}}
										onDragEnd={() => setDraggingRecommendedProductId(null)}
										style={{
											border: '1px solid #332c62',
											borderRadius: 8,
											padding: 8,
											background: draggingRecommendedProductId === index ? '#2a2550' : '#1f1b35',
											cursor: 'grab',
										}}
									>
										<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
											<span style={{ opacity: 0.8 }}>⋮⋮</span>
											{product.imageUrl ? (
												<img src={product.imageUrl} alt={product.productName} style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover', border: '1px solid #47406f' }} />
											) : null}
											<div style={{ minWidth: 0 }}>
												<div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{product.productName}</div>
												<div style={{ fontSize: 11, color: '#a7a2c4' }}>{product.category}</div>
											</div>
											<span style={{ marginLeft: 'auto', fontSize: 12, color: '#cfc7ff' }}>#{index + 1}</span>
										</div>
									</div>
								))}
							</div>
						</div>
					)}
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
						<button
							className="btn btn-secondary btn-sm"
							onClick={() => handleToggleOfferedBulk(filteredAlbumPurchaseItemIds, true)}
							disabled={filteredAlbumPurchaseItemIds.length === 0}
						>
							Offer Full Album Products
						</button>
						<button className="btn btn-secondary btn-sm" onClick={handleToggleExpandAll}>{isTreeExpanded ? 'Contract All' : 'Expand All'}</button>
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
					<div className="spl-body spl-compact-body">
						{Object.keys(filteredGroupedItems).length === 0 && (
							<div style={{ color: '#999' }}>No items match the current filters.</div>
						)}
						{Object.keys(filteredGroupedItems).map((cat) => (
							<div key={cat} className="spl-category-block">
								{(() => {
									const firstProduct = Object.keys(filteredGroupedItems[cat] || {})[0];
									const firstItem = firstProduct ? filteredGroupedItems[cat][firstProduct]?.[0] : null;
									const categoryImageUrl = firstItem?.category_image_url;
									return (
								<div
									className="spl-category-header"
									onDragOver={(e) => e.preventDefault()}
									onDrop={(e) => { e.stopPropagation(); void handleDropOnCategory(e, cat); }}
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
									<div className="spl-category-body">
										{Object.keys(filteredGroupedItems[cat])
											.sort((a, b) => {
												const aPrefs = getProductPrefsFromGroup(cat, a);
												const bPrefs = getProductPrefsFromGroup(cat, b);
												const aHasOrder = Number.isFinite(Number(aPrefs.displayOrder));
												const bHasOrder = Number.isFinite(Number(bPrefs.displayOrder));
												if (aHasOrder && bHasOrder && Number(aPrefs.displayOrder) !== Number(bPrefs.displayOrder)) {
													return Number(aPrefs.displayOrder) - Number(bPrefs.displayOrder);
												}
												if (aHasOrder !== bHasOrder) return aHasOrder ? -1 : 1;
												return String(a || '').localeCompare(String(b || ''));
											})
											.map((product, productIndex, sortedProducts) => {
											const productKey = `${cat}||${product}`;
											const prefs = getProductPrefsFromGroup(cat, product);
											// Find the first item for this product group to get image info
											const firstItem = filteredGroupedItems[cat][product][0];
															const productItems = filteredGroupedItems[cat][product] || [];
															const productVariantItemIds = productItems
																.map((row: any) => Number(row?.id || 0))
																.filter((id: number) => Number.isInteger(id) && id > 0);
															const areAllAttrsExpanded = productVariantItemIds.length > 0
																&& productVariantItemIds.every((id: number) => !!openVariantItemIds[id]);
															const hasPendingProductChanges = hasPendingProductPriceChanges(productItems);
															const isSavingProduct = savingProductKey === productKey;
											// Prefer product image, fallback to category image, else nothing
											const productImageUrl = firstItem?.product_image_url;
											const categoryImageUrl = firstItem?.category_image_url;
											return (
												<div key={productKey} className="spl-product-block">
													<div
														className="spl-product-header"
														draggable
														onDragStart={() => setDraggingProductKey(product)}
														onDragOver={(e) => e.preventDefault()}
														onDrop={async (e) => {
															e.preventDefault();
															const payload = parseDragPayload(e);
															if (payload) {
																e.stopPropagation();
																await handleDropOnProduct(e, cat, product);
																return;
															}
															if (!draggingProductKey || draggingProductKey === product) return;
															try {
																const fromIndex = sortedProducts.indexOf(draggingProductKey);
																const toIndex = productIndex;
																if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
																const next = [...sortedProducts];
																const [moved] = next.splice(fromIndex, 1);
																next.splice(toIndex, 0, moved);
																await saveProductOrderForCategory(cat, next);
															} catch {
																setError('Failed to reorder products');
															} finally {
																setDraggingProductKey(null);
															}
														}}
														onDragEnd={() => setDraggingProductKey(null)}
														onClick={() => setProdCollapsed(prev => ({ ...prev, [productKey]: !prev[productKey] }))}
													>
														<span style={{ opacity: 0.8 }}>⋮⋮</span>
														<span>{prodCollapsed[productKey] ? '▶' : '▼'}</span>
														{/* Show product image if available, else category image, else nothing */}
														{productImageUrl ? (
															<img
																src={productImageUrl}
																alt={product}
																style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover', border: '1px solid #444' }}
															/>
														) : categoryImageUrl ? (
															<img
																src={categoryImageUrl}
																alt={cat}
																style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover', border: '1px solid #444', opacity: 0.5 }}
															/>
														) : null}
														{firstItem && Number(firstItem?.product_id || 0) > 0 && (
															<span
																draggable
																onDragStart={(e) => { e.stopPropagation(); beginProductCategoryDrag(e, firstItem); }}
																onClick={(e) => e.stopPropagation()}
																title="Drag to another category"
																style={{ cursor: 'grab', fontSize: 12, opacity: 0.9 }}
															>
																🗂
															</span>
														)}
														<span className="studio-product-title">{product}</span>
														<div className="studio-product-actions" onClick={e => e.stopPropagation()}>
															<button
																className="btn btn-secondary btn-sm spl-inline-action-btn"
																	onClick={() => setProductVariantEditors(productItems, !areAllAttrsExpanded)}
															>
																	{areAllAttrsExpanded ? 'Contract attrs' : 'Expand attrs'}
															</button>
															</div>
															<button
																type="button"
																className="btn btn-primary btn-sm spl-inline-action-btn"
																onClick={(e) => {
																	e.stopPropagation();
																	void saveProductPricing(cat, product, productItems);
																}}
																disabled={isSavingProduct || !hasPendingProductChanges}
																title={!hasPendingProductChanges ? 'No unsaved price changes for this product' : 'Save all edited prices for this product'}
															>
																{isSavingProduct ? 'Saving…' : 'Save product'}
															</button>
														<button
															type="button"
															className={`studio-recommended-star${prefs.isRecommended ? ' is-active' : ''}`}
															onClick={(e) => {
																e.stopPropagation();
																handleUpdateProductPreferences(cat, product, { is_recommended: !prefs.isRecommended });
															}}
															title={prefs.isRecommended ? 'Recommended' : 'Mark as recommended'}
															aria-label={prefs.isRecommended ? 'Recommended product' : 'Mark product as recommended'}
														>
															{prefs.isRecommended ? '★' : '☆'}
														</button>
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
														<div className="spl-size-list">
															{filteredGroupedItems[cat][product].map((item: any) => (
																<React.Fragment key={item.id}>
																{(() => {
																	const hasVariantPricing = itemHasVariantPricing(item);
																	return (
																<div className={`spl-size-row ${hasVariantPricing ? 'studio-size-grid-variant' : 'studio-size-grid'}`}>
																	<span
																		draggable
																		onDragStart={(e) => beginSizeCategoryDrag(e, item)}
																		title="Drag size to another category/product"
																		style={{ cursor: 'grab', opacity: 0.85 }}
																	>
																		⋮⋮
																	</span>
																	<label className="studio-offer-toggle">
																		<input
																			type="checkbox"
																			checked={!!item.is_offered}
																			onChange={e => handleToggleOffered(item, e.target.checked)}
																		/>
																		<span className="studio-offer-toggle-label">Offer</span>
																	</label>
																	<div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
																		<span>{item._sizeLabel || item.size_name || '—'}</span>
																		{String(item?.digital_download_scope || '').trim().toLowerCase() === 'album' && (
																			<span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 999, background: '#2f5dff', color: '#e8efff' }}>
																				Full Album Purchase
																			</span>
																		)}
																		{(() => {
																			const variantLabels = getVariantLabelsForItem(item);
																			return (
																				<div className="studio-meta-line">
																					{itemHasVariantPricing(item) && <span>Variant pricing enabled</span>}
																					{variantLabels.length > 0 && (
																						<span style={{ color: '#b9c8e7' }}>variants: {variantLabels.slice(0, 3).join(', ')}{variantLabels.length > 3 ? ` +${variantLabels.length - 3}` : ''}</span>
																					)}
																				</div>
																			);
																		})()}
																	</div>
																		{!hasVariantPricing && (
																			<>
																				<div title="Super admin markup amount">{toCurrency(computedDisplayCost(item, draftPrices[item.id]))}</div>
																				<input
																					className="studio-size-price-input"
																					type="number"
																					min={0}
																					step="0.01"
																					value={draftPrices[item.id] ?? ''}
																					onChange={e => setDraftPrices(prev => ({ ...prev, [item.id]: e.target.value }))}
																					disabled={!item.is_offered}
																					placeholder="Studio price"
																				/>
																			</>
																		)}
																	{(() => {
																		const itemId = Number(item.id);
																		const isVariantEditorOpen = !!openVariantItemIds[itemId];
																		return (
																	<button
																		className="btn btn-secondary btn-sm spl-inline-action-btn studio-attrs-toggle-btn"
																		onClick={() => {
																				if (isVariantEditorOpen) {
																					closeVariantEditor(itemId);
																			} else {
																				openVariantEditor(item);
																			}
																		}}
																	>
																			{isVariantEditorOpen ? 'Close attrs' : 'Edit attrs'}
																	</button>
																		);
																	})()}
																		{!hasVariantPricing && (
																			<div className="studio-profit-estimate">
																				{(() => {
																					const cost = computedDisplayCost(item, draftPrices[item.id]);
																					const profit = estimateProfit(cost, draftPrices[item.id]);
																					const color = profit >= 0 ? '#79d279' : '#ff9a9a';
																					return <span style={{ color }}>Est. Profit {toCurrency(profit)}</span>;
																				})()}
																			</div>
																		)}
																</div>
																		);
																	})()}
																{!!openVariantItemIds[Number(item.id)] && (
																	<div className="spl-variant-editor studio-variant-editor">
																		<div className="spl-variant-editor-toolbar">
																			<div>
																				<strong>Size attribute pricing</strong>
																				<span className="spl-variant-editor-subtitle">Studio cost below comes from the active Super Admin variant pricing.</span>
																			</div>
																			<button
																				className="btn btn-primary btn-sm studio-variant-save-btn"
																				onClick={() => saveVariantStudioPricing(item)}
																				disabled={savingVariantItemId === Number(item.id)}
																			>
																				{savingVariantItemId === Number(item.id) ? 'Saving...' : 'Save'}
																			</button>
																		</div>
																		<div className="spl-variant-grid spl-variant-grid-header">
																			<span>Attribute</span>
																			<span>Studio Cost</span>
																			<span>Studio Price</span>
																		</div>
																		{(variantDraftsByItem[Number(item.id)] || []).filter((row) => row.isActive).length === 0 ? (
																			<div className="spl-variant-empty">No active variants available for this size.</div>
																		) : (
																			(variantDraftsByItem[Number(item.id)] || [])
																				.filter((row) => row.isActive)
																				.map((row) => (
																					<div key={row.key} className="spl-variant-grid spl-variant-grid-row">
																						<div style={{ color: '#c7c1ed', fontSize: 13 }}>{row.label}</div>
																						<div style={{ color: '#b5b0d6', fontSize: 12 }}>Cost {toCurrency(row.superCost || 0)}</div>
																						<input
																							className="spl-variant-input"
																							type="number"
																							min={0}
																							step="0.01"
																							value={row.studioPrice}
																							onChange={(e) => updateVariantStudioPrice(Number(item.id), row.key, e.target.value)}
																							placeholder="Studio price"
																						/>
																					</div>
																				))
																		)}
																	</div>
																)}
																</React.Fragment>
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


					{/* Packages and suggestions UI removed */}
				</div>
			)}
		</div>
	);
};

export default AdminPriceLists;
