
// ...existing code...


import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import CropperModal from '../components/CropperModal';
import Modal from '../components/Modal/Modal';
import { formatDateInStudioTimezone } from '../utils/studioDateTime';
import 'cropperjs/dist/cropper.css';
import './Cart.css';
import { useCart } from '../contexts/CartContext';
import CartItem from '../components/CartItem';
import StripePaymentForm from '../components/StripePaymentForm';
import { orderService } from '../services/orderService';
import { shippingService } from '../services/shippingService';
import { stripeService } from '../services/stripeService';
import { productService } from '../services/productService';
import { downloadService } from '../services/downloadService';
import { discountCodeService } from '../services/discountCodeService';
import { taxService } from '../services/taxService';
import { whccEditorService } from '../services/whccEditorService';
import { ShippingConfig, Product, ShippingAddress, CartItem as CartItemType, PaymentIntent, ShippingQuote } from '../types';
import { useAuth } from '../contexts/AuthContext';


const Cart: React.FC = () => {
        // ...existing code...
        // ...
        // ...existing code...
    const { items, getTotalPrice, getTotalItems, clearCart } = useCart();
    const navigate = useNavigate();

    // Debug log: show cart items and their attributeUIDs/productOptions on every render
    // ...
    const { user } = useAuth();

    // Always load products when cart items change
    useEffect(() => {
      loadProducts();
    }, [items]);

    // Stripe config state must be defined before using in useMemo
    const [stripeConfig, setStripeConfig] = useState<any>(null);
    // Memoized Stripe promise instance
    const stripePromise = useMemo(() => {
      if (stripeConfig && stripeConfig.publishableKey) {
        return loadStripe(stripeConfig.publishableKey);
      }
      return null;
    }, [stripeConfig]);
    // Ensure shipping config is loaded on mount
    useEffect(() => {
      loadShippingConfig();
    }, []);

    // Functions that depend on 'items' and 'products' must be declared after both are initialized

    // Stripe payment intent state
    const [activePaymentIntent, setActivePaymentIntent] = useState<PaymentIntent | null>(null);
    const [shippingQuote, setShippingQuote] = useState<ShippingQuote | null>(null);
    const [products, setProducts] = useState<Product[]>([]);
    const [appliedDiscount, setAppliedDiscount] = useState<any>(null);
    const [editingItem, setEditingItem] = useState<CartItemType | null>(null);
    const [editingDrawnSize, setEditingDrawnSize] = useState<{ width: number; height: number } | null>(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const autoLaunchEditorRef = useRef<boolean>(false);
    // State for product images
    const [productImages] = useState<Record<string, string>>({});
    // State for category images (fix ReferenceError)
    const [categoryImages] = useState<Record<string, string>>({});
    // TODO: Load category images from API if needed and setCategoryImages
    // State for best discount search loading
    const [bestDiscountSearchLoading, setBestDiscountSearchLoading] = useState(false);
    const [discountCode, setDiscountCode] = useState<string>('');
    const [discountValidation, setDiscountValidation] = useState<any>(null);
    const [studioFees, setStudioFees] = useState<any>(null);
    // Place this after all state/hooks
    useEffect(() => {
      if (!stripeConfig) {
        loadStripeConfig();
      }
    }, [stripeConfig]);

    // Ensure Stripe config is loaded if missing
    useEffect(() => {
      if (!stripeConfig) {
        loadStripeConfig();
      }
    }, [stripeConfig]);
    const [error, setError] = useState<string | null>(null);
    // State for discount error
    const [discountError, setDiscountError] = useState<string | null>(null);
    // State for discount info
    const [discountInfo, setDiscountInfo] = useState<string>('');
    // State for payment processing
    const [processingPayment, setProcessingPayment] = useState(false);
    // State for generic loading
    const [loading, setLoading] = useState(false);
    // Returns true if any product in the cart is non-digital (eligible for direct shipping)
    const hasDirectShipProducts = () => {
      return items.some(item => {
        const product = products.find(p => p.id === item.productId);
        return product && product.isDigital === false;
      });
    };
  const [shippingConfig, setShippingConfig] = useState<ShippingConfig | null>(null);
  const [albumDetailsById, setAlbumDetailsById] = useState<{ [albumId: number]: any }>({});
  const [shippingOption, setShippingOption] = useState<any>('direct');
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>({
    fullName: '',
    email: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'US',
    phone: '',
  });

  useEffect(() => {
    // Update email in shipping address when user changes
    if (user?.email) {
      setShippingAddress(prev => ({ ...prev, email: user.email }));
    }
    void loadStudioFees();
  }, [user]);

  useEffect(() => {
    const albumIds = Array.from(
      new Set(
        items
          .map((item) => Number(item.albumId || item.photo?.albumId || 0))
          .filter((id) => Number.isInteger(id) && id > 0)
      )
    );

    const missingIds = albumIds.filter((id) => !albumDetailsById[id]);
    if (!missingIds.length) return;

    let cancelled = false;
    const loadAlbumDetails = async () => {
      const results = await Promise.all(
        missingIds.map(async (albumId) => {
          try {
            const res = await api.get(`/albums/${albumId}`);
            return { albumId, data: res.data };
          } catch {
            return null;
          }
        })
      );

      if (cancelled) return;
      setAlbumDetailsById((prev) => {
        const next = { ...prev };
        results.forEach((row) => {
          if (!row) return;
          next[row.albumId] = {
            name: String(row.data?.name || '').trim() || undefined,
            coverImageUrl: String(row.data?.coverImageUrl || '').trim() || undefined,
          };
        });
        return next;
      });
    };

    void loadAlbumDetails();
    return () => {
      cancelled = true;
    };
  }, [items, albumDetailsById]);

  useEffect(() => {
    const shouldQuote = hasPhysicalProducts();
    if (!shouldQuote) {
      setShippingQuote(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const quote = await shippingService.quote({
          shippingOption,
          shippingAddress,
          items,
        });
        if (!cancelled) {
          setShippingQuote(quote);
        }
      } catch (err) {
        if (!cancelled) {
          setShippingQuote(null);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [shippingOption, shippingAddress, items]);

  const loadStudioFees = async () => {
    try {
      // If user is a customer with studio_id, fetch the studio fees
      if (user?.studioId) {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/studios/${user.studioId}/fees`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setStudioFees(data);
        }
      }
    } catch (error) {
      console.error('Failed to load studio fees:', error);
    }
  };

  const loadProducts = async () => {
    try {
      const albumIds = Array.from(
        new Set(
          items
            .map((item) => Number(item.photo?.albumId || 0))
            .filter((id) => Number.isInteger(id) && id > 0)
        )
      );

      // ...existing code...

      if (albumIds.length === 0) {
        const data = await productService.getActiveProducts();
        // ...existing code...
        setProducts(Array.isArray(data) ? data : []);
        // ...existing code...
        return;
      }

      const productsByAlbum = await Promise.all(
        albumIds.map((albumId) => productService.getActiveProducts(albumId))
      );
      // ...existing code...

      const merged = new Map<number, Product>();
      productsByAlbum.flat().forEach((product) => {
        const existing = merged.get(Number(product.id));
        if (!existing) {
          merged.set(Number(product.id), product);
          return;
        }

        const sizeMap = new Map<number, any>();
        [...(existing.sizes || []), ...(product.sizes || [])].forEach((size) => {
          sizeMap.set(Number(size.id), size);
        });
        existing.sizes = Array.from(sizeMap.values());
      });

      const mergedProducts = Array.from(merged.values());
      // ...existing code...
      setProducts(mergedProducts);
    } catch (error) {
      console.error('Failed to load products:', error);
    }
  };

  const loadStripeConfig = async () => {
    try {
      const config = await stripeService.getConfig();
      if (config.publishableKey?.startsWith('sk_')) {
        setError('Stripe is misconfigured: a secret key was supplied to the browser. Please set a valid publishable key (pk_...).');
        setStripeConfig({
          ...config,
          publishableKey: '',
          isActive: false,
        });
        return;
      }

      if (config.reason === 'live_mode_requires_https') {
        setError('Stripe live mode requires HTTPS. Use test keys locally, or run the app over HTTPS for live payments.');
        setStripeConfig({
          ...config,
          isActive: false,
        });
        return;
      }

      setStripeConfig(config);
    } catch (error) {
      console.error('Failed to load Stripe config:', error);
    }
  };

  const loadShippingConfig = async () => {
    try {
      const config = await shippingService.getConfig();
      setShippingConfig(config);
      
      // If batch deadline passed or not active, default to direct
      if (!config.isActive || new Date(config.batchDeadline) < new Date()) {
        setShippingOption('direct');
      }
    } catch (error) {
      console.error('Failed to load shipping config:', error);
    }
  };

  const isBatchAvailable = () => {
    if (!shippingConfig || !shippingConfig.isActive) return false;
    const deadline = new Date(shippingConfig.batchDeadline);
    if (Number.isNaN(deadline.getTime())) return true;
    return deadline > new Date();
  };

  const getBatchDeadlineDate = () => {
    if (!shippingConfig?.batchDeadline) return null;
    const deadline = new Date(shippingConfig.batchDeadline);
    return Number.isNaN(deadline.getTime()) ? null : deadline;
  };

  const hasOnlyDigitalProducts = () => {
    // Check if cart only contains digital products
    return items.every(item => {
      const product = products.find(p => p.id === item.productId);
      return product?.isDigital === true;
    });
  };

  const hasPhysicalProducts = () => {
    return items.some(item => {
      const product = products.find(p => p.id === item.productId);
      return product?.isDigital === false;
    });
  };

  // Returns the shipping cost for the given option ('batch' or 'direct')
  const getShippingCostFor = (option: 'batch' | 'direct') => {
    if (hasOnlyDigitalProducts()) return 0;
    if (shippingQuote && shippingQuote.shippingOption === option) {
      return Number(shippingQuote.customerShippingCost || 0);
    }
    if (option === 'direct') {
      // Prefer directFlatFee (studio-configured flat fee), then directShippingCharge (legacy), never fall back to an arbitrary hardcoded amount
      return shippingConfig?.directFlatFee || shippingConfig?.directShippingCharge || 9.95;
    }
    return 0;
  };

  // For backward compatibility in other usages
  const getShippingCost = () => getShippingCostFor(shippingOption);

  const cartSubtotal = getTotalPrice();
  const currentShippingCost = getShippingCost();

  const runDiscountValidation = async (codeValue: string) => {
    const validation = await discountCodeService.validate(codeValue.trim(), {
      items,
      subtotal: cartSubtotal,
      shippingCost: currentShippingCost,
    });

    if (!validation.valid || !validation.code) {
      setAppliedDiscount(null);
      setDiscountValidation(null);
      setDiscountError(validation.reason || 'Invalid discount code');
      setDiscountInfo('');
      return null;
    }

    setAppliedDiscount(validation.code);
    setDiscountValidation(validation);
    setDiscountError('');
    setDiscountInfo('');
    return validation;
  };

  const findAndApplyBestDiscount = async (origin: 'auto' | 'manual') => {
    if (items.length === 0) return;

    if (origin === 'manual') {
      setDiscountError('');
      setDiscountInfo('');
    }

    setBestDiscountSearchLoading(true);
    try {
      const result = await discountCodeService.findBest({
        items,
        subtotal: cartSubtotal,
        shippingCost: currentShippingCost,
        studioId: user?.studioId,
      });

      if (!result.valid || !result.code) {
        if (origin === 'manual') {
          setDiscountInfo('No eligible discount found for this cart.');
        }
        return;
      }

      setAppliedDiscount(result.code);
      setDiscountValidation(result);
      setDiscountCode('');
      setDiscountError('');
      setDiscountInfo(origin === 'auto'
        ? `Best available discount applied: ${result.code.code}`
        : `Applied best available discount: ${result.code.code}`);
    } catch {
      if (origin === 'manual') {
        setDiscountError('Failed to find best discount code.');
      }
    } finally {
      setBestDiscountSearchLoading(false);
    }
  };

  const handleApplyDiscount = async () => {
    if (!discountCode.trim()) return;

    setDiscountError('');
    setDiscountInfo('');
    try {
      await runDiscountValidation(discountCode.trim());
    } catch (error) {
      setDiscountError('Failed to validate discount code');
    }
  };

  const handleRemoveDiscount = () => {
    setAppliedDiscount(null);
    setDiscountValidation(null);
    setDiscountCode('');
    setDiscountError('');
    setDiscountInfo('');
  };

  const getDiscountAmount = () => {
    return discountValidation?.discountAmount || 0;
  };

  const getDiscountSummaryText = () => {
    if (!appliedDiscount) return '';

    if (appliedDiscount.discountType === 'bundle-price') {
      const matchingProducts = (appliedDiscount.applicableProductIds || [])
        .map((productId: number | string) => products.find((product) => Number(product.id) === Number(productId))?.name)
        .filter(Boolean) as string[];

      const productLabel = matchingProducts.length === 1
        ? matchingProducts[0]
        : matchingProducts.length > 1
        ? 'selected products'
        : 'eligible items';

      return `Bundle applied: ${appliedDiscount.bundleQuantity || 0} for $${Number(appliedDiscount.bundlePrice || 0).toFixed(2)} on ${productLabel}`;
    }

    return discountValidation?.summary || appliedDiscount.description || '';
  };

  const [taxAmount, setTaxAmount] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [taxLoading, setTaxLoading] = useState(false);
  const [, setTaxError] = useState('');

  const calculateTaxAmount = async () => {
    setTaxLoading(true);
    setTaxError('');
    const subtotal = getTotalPrice();
    const shipping = getShippingCost();
    const discount = getDiscountAmount();
    let fees = 0;
    if (studioFees && studioFees.feeValue > 0) {
      if (studioFees.feeType === 'percentage') {
        fees = (subtotal * studioFees.feeValue) / 100;
      } else if (studioFees.feeType === 'fixed') {
        fees = studioFees.feeValue * items.reduce((count, item) => count + item.quantity, 0);
      }
    }
    const subtotalAfterDiscount = subtotal + fees + shipping - discount;

    // Use Stripe Tax if Stripe is active and address is complete
    let usedStripeTax = false;
    if (stripeConfig?.isActive) {
      // Only call Stripe Tax if all required address fields are present and country is a 2-letter code
      const addr = shippingAddress;
      const addressComplete =
        addr &&
        addr.addressLine1 &&
        addr.city &&
        addr.state &&
        addr.zipCode &&
        addr.country &&
        typeof addr.country === 'string' &&
        addr.country.length === 2;
      if (addressComplete) {
        try {
          const { stripeTaxService } = await import('../services/stripeTaxService');
          const result = await stripeTaxService.calculateTax({
            items,
            shippingAddress: { ...shippingAddress, country: addr.country.toUpperCase() },
            currency: 'usd',
          });
          setTaxAmount(result.taxAmount);
          setTaxRate(result.taxRate);
          setTaxLoading(false);
          usedStripeTax = true;
          return;
        } catch (err) {
          setTaxError('Stripe Tax unavailable. Using fallback tax calculation.');
        }
      }
    }
    if (!usedStripeTax) {
      // Always fallback to manual taxService if Stripe fails or is not available
      const { taxAmount, taxRate } = taxService.calculateTax(subtotalAfterDiscount, shippingAddress);
      setTaxAmount(taxAmount);
      setTaxRate(taxRate);
      setTaxLoading(false);
    }
  };

  useEffect(() => {
    if (discountCode.trim()) {
      return;
    }
    if (appliedDiscount) {
      return;
    }
    if (items.length === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      findAndApplyBestDiscount('auto');
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [items, cartSubtotal, currentShippingCost, user?.studioId, appliedDiscount, discountCode]);

  useEffect(() => {
    if (!appliedDiscount?.code) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const validation = await discountCodeService.validate(appliedDiscount.code, {
          items,
          subtotal: cartSubtotal,
          shippingCost: currentShippingCost,
        });

        if (cancelled) return;

        if (!validation.valid || !validation.code) {
          setAppliedDiscount(null);
          setDiscountValidation(null);
          setDiscountCode('');
          setDiscountError(validation.reason || 'This discount no longer applies to your cart.');
          return;
        }

        setAppliedDiscount(validation.code);
        setDiscountValidation(validation);
        setDiscountError('');
      } catch {
        if (!cancelled) {
          setDiscountError('Failed to refresh discount details.');
        }
      }
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [appliedDiscount?.code, items, cartSubtotal, currentShippingCost]);

  useEffect(() => {
    calculateTaxAmount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, shippingOption, shippingAddress, appliedDiscount, discountValidation?.discountAmount, studioFees, stripeConfig]);

  const getFinalTotal = () => {
    const subtotal = getTotalPrice();
    const shipping = hasPhysicalProducts() ? getShippingCost() : 0;
    const discount = getDiscountAmount();
    let fees = 0;
    if (studioFees && studioFees.feeValue > 0) {
      if (studioFees.feeType === 'percentage') {
        fees = (subtotal * studioFees.feeValue) / 100;
      } else if (studioFees.feeType === 'fixed') {
        fees = studioFees.feeValue * items.reduce((count, item) => count + item.quantity, 0);
      }
    }
    const subtotalWithFees = subtotal + fees + shipping - discount;
    return Math.max(0, subtotalWithFees + taxAmount);
  };

  const getStudioFeeAmount = () => {
    const subtotal = getTotalPrice();
    if (!studioFees || studioFees.feeValue <= 0) return 0;
    if (studioFees.feeType === 'percentage') {
      return (subtotal * studioFees.feeValue) / 100;
    }
    if (studioFees.feeType === 'fixed') {
      return studioFees.feeValue * items.reduce((count, item) => count + item.quantity, 0);
    }
    return 0;
  };

  const getDaysUntilDeadline = () => {
    if (!shippingConfig) return 0;
    const days = Math.ceil((new Date(shippingConfig.batchDeadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  };

  const getResolvedCartItem = (item: CartItemType): any => {
    const itemProductId = Number(item.productId || 0);
    const itemSizeId = Number(item.productSizeId || 0);

    const productById = item.productId
      ? products.find((p) => Number(p.id) === itemProductId)
      : undefined;

    const fallbackProduct = !productById && itemSizeId
      ? products.find((p) => p.sizes?.some((s) => Number(s.id) === itemSizeId))
      : undefined;

    const resolvedProduct = productById || fallbackProduct;
    const resolvedSize = itemSizeId
      ? resolvedProduct?.sizes?.find((s) => Number(s.id) === itemSizeId)
      : undefined;

    // Prefer direct image URLs from item, fallback to mapping
    let productImageUrl = item.product_image_url || (item.productId ? productImages[item.productId] : undefined);
    let categoryImageUrl = item.category_image_url || (resolvedProduct?.category ? categoryImages[resolvedProduct.category] : undefined);
    const effectiveAlbumId = Number(item.albumId || item.photo?.albumId || 0) || undefined;
    const albumDetails = effectiveAlbumId ? albumDetailsById[effectiveAlbumId] : undefined;
    const isDigital = !!(resolvedProduct?.isDigital || item.isDigital || item.digitalDownloadScope);
    const editorProvider = String((resolvedProduct as any)?.editorProvider || (item as any)?.editorProvider || '').trim().toLowerCase() || null;
    const requiresWhccEditor = Boolean((resolvedProduct as any)?.requiresWhccEditor || (item as any)?.requiresWhccEditor || editorProvider === 'whcc');
    const whccEditorProductId = String((item as any)?.whccEditorProductId || (resolvedProduct as any)?.whccEditorProductId || '').trim() || null;
    const whccEditorDesignId = String((item as any)?.whccEditorDesignId || (resolvedProduct as any)?.whccEditorDesignId || '').trim() || null;

    return {
      ...item,
      productName: item.productName || resolvedProduct?.name || (item.productId ? `Product #${item.productId}` : 'Product'),
      productSizeName: item.productSizeName || resolvedSize?.name || (item.productSizeId ? `Size #${item.productSizeId}` : 'Size'),
      productSize: resolvedSize || item.productSize || undefined,
      albumId: effectiveAlbumId,
      albumName: item.albumName || albumDetails?.name,
      albumCoverImageUrl: item.albumCoverImageUrl || albumDetails?.coverImageUrl,
      isDigital,
      editorProvider,
      requiresWhccEditor,
      whccEditorProductId,
      whccEditorDesignId,
      productImageUrl,
      categoryImageUrl,
    };
  };

  // Removed unused isMultiImageItem function

  const handleOpenWhccEditor = async (item: CartItemType) => {
    try {
      setError('');
      const photoIds = Array.isArray(item.photoIds) && item.photoIds.length
        ? item.photoIds
        : item.photoId
        ? [item.photoId]
        : [];

      if (!item.productId) {
        setError('This cart item is missing a product ID and cannot open the WHCC editor.');
        return;
      }

      const session = await whccEditorService.createSession({
        productId: Number(item.productId),
        quantity: Number(item.quantity) || 1,
        photoIds,
        overrideEditorProductId: String((item as any)?.whccEditorProductId || '').trim() || undefined,
        overrideEditorDesignId: String((item as any)?.whccEditorDesignId || '').trim() || undefined,
      });

      if (!session?.url) {
        setError('WHCC editor did not return a launch URL.');
        return;
      }

      window.location.assign(session.url);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.details || err?.message || 'Failed to open WHCC editor.');
    } finally {
    }
  };

  useEffect(() => {
    if (autoLaunchEditorRef.current) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get('launchWhccEditor') !== '1') return;

    const requestedProductId = Number(params.get('productId') || 0);
    const requestedSizeId = Number(params.get('productSizeId') || 0);
    const requestedPhotoId = Number(params.get('photoId') || 0);

    const resolvedItems = items.map((item) => getResolvedCartItem(item));
    const target = resolvedItems.find((item: any) => {
      if (!item?.requiresWhccEditor) return false;
      if (requestedProductId > 0 && Number(item.productId || 0) !== requestedProductId) return false;
      if (requestedSizeId > 0 && Number(item.productSizeId || 0) !== requestedSizeId) return false;
      if (requestedPhotoId > 0 && Number(item.photoId || 0) !== requestedPhotoId) return false;
      return true;
    });

    if (!target) return;

    autoLaunchEditorRef.current = true;
    void handleOpenWhccEditor(target as CartItemType);

    params.delete('launchWhccEditor');
    params.delete('productId');
    params.delete('productSizeId');
    params.delete('photoId');
    const nextQuery = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`);
  }, [items, products]);

  const finalizeSuccessfulCheckout = async (paymentIntentId: string) => {
    if (shippingOption === 'batch' && !isBatchAvailable()) {
      throw new Error('Batch shipping deadline has passed. Please contact support to update shipping for this paid checkout.');
    }

    const digitalItems = items.filter(item => {
      const product = products.find(p => p.id === item.productId);
      return product?.isDigital === true;
    });

    let downloadUrls;
    if (digitalItems.length > 0) {
      downloadUrls = downloadService.generateDownloadUrls(digitalItems);

      if (user?.email) {
        await downloadService.sendDownloadEmail(
          user.email,
          downloadUrls,
          `ORD-${Date.now()}`
        );
      }
    }

    // Create the order and get the result (should include orderId)
    // Defensive: ensure every item has the latest cropData from cart state
    const itemsWithCrop = items.map(item => {
      const latest = items.find(
        ci => ci.photoId === item.photoId && ci.productId === item.productId && ci.productSizeId === item.productSizeId
      );
      return latest ? { ...item, cropData: latest.cropData } : item;
    });
    const orderResult = await orderService.createOrder(
      itemsWithCrop,
      shippingAddress,
      shippingOption,
      getShippingCost(),
      appliedDiscount?.code,
      studioFees?.feeType,
      studioFees?.feeValue,
      paymentIntentId,
      {
        taxAmount,
        taxRate,
        total: getFinalTotal(),
        subtotalBeforeDiscount: cartSubtotal + getStudioFeeAmount() + currentShippingCost,
      }
    );

    // If we have an order id and paymentIntentId, update the Stripe fee
    if (orderResult?.id && paymentIntentId) {
      try {
        const { updateStripeFee } = await import('../services/stripeFeeService');
        await updateStripeFee(String(orderResult.id));
      } catch (err) {
        console.error('Failed to update Stripe fee:', err);
      }
    }

    // Removed debug logs

    clearCart();
    setShowPaymentModal(false);
    setActivePaymentIntent(null);

    let successMessage = 'Payment successful! Your order has been placed. A receipt has been sent to ' + shippingAddress.email + '.';

    if (hasOnlyDigitalProducts()) {
      successMessage += ' Download links have been sent to your email.';
    } else if (digitalItems.length > 0) {
      successMessage += ` Download links for digital items have been sent to your email. Physical items will ${
        shippingOption === 'batch'
          ? `ship on ${formatDateInStudioTimezone(shippingConfig?.batchDeadline)}.`
          : 'ship within 2-3 business days.'
      }`;
    } else {
      successMessage += ` ${
        shippingOption === 'batch'
          ? `It will ship on ${formatDateInStudioTimezone(shippingConfig?.batchDeadline)}.`
          : 'It will ship within 2-3 business days.'
      }`;
    }

    navigate('/orders', { state: { message: successMessage } });
  };

  const handleCheckout = async () => {
    // Removed debug log
    if (items.length === 0) {
      // Removed debug log
      setError('No items in cart.');
      return;
    }

    if (!stripeConfig?.isActive) {
      // Removed debug log
      setError('Payment processing is currently unavailable. Please try again later.');
      return;
    }

    // Validate shipping address
    if (!shippingAddress.fullName || !shippingAddress.addressLine1 || 
        !shippingAddress.city || !shippingAddress.state || !shippingAddress.zipCode || !shippingAddress.email) {
      // Removed debug log
      setError('Please complete all required shipping address fields.');
      return;
    }

    if (shippingOption === 'batch' && !isBatchAvailable()) {
      setShippingOption('direct');
      setError('Batch shipping is no longer available because the deadline has passed. Shipping was switched to direct. Please review totals and continue checkout.');
      // Removed debug log
      return;
    }

    setLoading(true);
    setError('');
    // Removed debug log

    try {
      // Create payment intent with final total
      const paymentIntent = await stripeService.createPaymentIntent(
        items,
        shippingOption,
        getShippingCost(),
        getDiscountAmount(),
        taxAmount,
        getStudioFeeAmount()
      );

      if (!paymentIntent.clientSecret) {
        setError('Payment initialization failed. Please try again.');
        console.error('[Stripe Checkout] No clientSecret in paymentIntent', paymentIntent);
        return;
      }

      const publishableIsLive = !!stripeConfig?.publishableKey?.startsWith('pk_live_');
      if (typeof paymentIntent.livemode === 'boolean' && paymentIntent.livemode !== publishableIsLive) {
        setError('Stripe configuration mismatch: publishable key mode does not match payment intent mode. Please verify Stripe keys.');
        console.error('[Stripe Checkout] Publishable/live mode mismatch', { paymentIntent, stripeConfig });
        return;
      }

      setActivePaymentIntent(paymentIntent);
      setShowPaymentModal(true);
      // Removed debug log
    } catch (err: any) {
      // Show detailed Stripe error if present
      const data = err?.response?.data;
      if (data) {
        let details = data.error || data.message || 'Payment failed.';
        if (data.type || data.code || data.raw) {
          details += '\n';
          if (data.type) details += `Type: ${data.type}\n`;
          if (data.code) details += `Code: ${data.code}\n`;
          if (data.raw) details += `Raw: ${typeof data.raw === 'string' ? data.raw : JSON.stringify(data.raw)}`;
        }
        setError(details);
        console.error('[Stripe Checkout] Stripe error', details);
      } else {
        setError(err.message || 'Payment failed. Please try again.');
        console.error('[Stripe Checkout] Unknown error', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTestOrder = async () => {
    if (items.length === 0) {
      setError('No items in cart.');
      return;
    }

    if (!shippingAddress.fullName || !shippingAddress.addressLine1 ||
        !shippingAddress.city || !shippingAddress.state || !shippingAddress.zipCode || !shippingAddress.email) {
      setError('Please complete all required shipping address fields.');
      return;
    }

    if (shippingOption === 'batch' && !isBatchAvailable()) {
      setShippingOption('direct');
      setError('Batch shipping is no longer available because the deadline has passed. Shipping was switched to direct. Please review totals and submit again.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const itemsWithCrop = items.map(item => {
        const latest = items.find(
          ci => ci.photoId === item.photoId && ci.productId === item.productId && ci.productSizeId === item.productSizeId
        );
        return latest ? { ...item, cropData: latest.cropData } : item;
      });

      await orderService.createOrder(
        itemsWithCrop,
        shippingAddress,
        shippingOption,
        getShippingCost(),
        appliedDiscount?.code,
        studioFees?.feeType,
        studioFees?.feeValue,
        undefined,
        {
          taxAmount,
          taxRate,
          total: getFinalTotal(),
          subtotalBeforeDiscount: cartSubtotal + getStudioFeeAmount() + currentShippingCost,
        },
        true
      );

      clearCart();
      setShowPaymentModal(false);
      setActivePaymentIntent(null);

      const successMessage = hasOnlyDigitalProducts()
        ? 'Test order placed (no payment). Customer emails were suppressed for this test order.'
        : `Test order placed (no payment). Shipping mode: ${shippingOption === 'batch' ? 'batch' : 'direct'}. Customer emails were suppressed for this test order.`;

      navigate('/orders', { state: { message: successMessage } });
    } catch (err: any) {
      setError(
        err?.response?.data?.error ||
        err?.response?.data?.details ||
        err?.message ||
        'Failed to place test order.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="main-content dark-bg cart-page">
        <div className="page-header">
          <h1 className="gradient-text">Shopping Cart</h1>
          <p style={{ color: '#bdbdbd', fontSize: '1.05rem' }}>Your cart is empty</p>
        </div>
        <div className="cart-empty-card">
          <p>Browse albums and add products to start checkout.</p>
          <button onClick={() => navigate('/albums')} className="btn btn-primary">
            Browse Albums
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="main-content dark-bg cart-page">
      <div className="page-header">
        <h1 className="gradient-text">Shopping Cart</h1>
        <p style={{ color: '#bdbdbd' }}>{getTotalItems()} {getTotalItems() === 1 ? 'item' : 'items'}</p>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="cart-content cart-layout">
        <div className="cart-items">
          {items.map((item) => {
            const resolvedItem = getResolvedCartItem(item);
            const photo = item.photo || item;
            // Add cropData hash to key to force re-render on crop change
            const cropKey = item.cropData ? `${item.cropData.x}-${item.cropData.y}-${item.cropData.width}-${item.cropData.height}` : 'nocrop';
            return (
              <CartItem
                key={item.photoId + '-' + (item.productId || '') + '-' + (item.productSizeId || '') + '-' + cropKey}
                item={resolvedItem}
                photo={photo}
                onEditCrop={(editItem, _editPhoto, drawnSize) => {
                  // Merge latest cropData from raw cart state into the enriched resolved item
                  // so CropperModal has both fresh cropData and productSize dimensions.
                  const latest = items.find(
                    (i) => i.photoId === editItem.photoId && i.productId === editItem.productId && i.productSizeId === editItem.productSizeId
                  );
                  setEditingItem(latest ? { ...editItem, cropData: latest.cropData } : editItem);
                  setEditingDrawnSize(drawnSize || null);
                }}
                onOpenWhccEditor={handleOpenWhccEditor}
                showWhccEditorButton={!!resolvedItem?.requiresWhccEditor}
                studioId={user?.studioId}
              />
            );
          })}
        </div>

          {/* Package Cost/Profit Display - moved here as requested */}

        <div className="cart-summary cart-summary-panel">
          <h2>Order Summary</h2>
          <div className="summary-row cart-summary-row">
            <span>Subtotal</span>
            <span>${getTotalPrice().toFixed(2)}</span>
          </div>

          {hasOnlyDigitalProducts() && (
            <div className="cart-note">
              💾 <strong>Digital Downloads Only</strong>
              <p>
                Download links will be emailed to you immediately after payment
              </p>
            </div>
          )}

          {/* Shipping Address Form */}
          <div className="cart-section-card">
            <h3>Shipping Address</h3>
            
            <div className="cart-form-grid">
              <div>
                <label className="cart-label">
                  Full Name <span style={{ color: '#d32f2f' }}>*</span>
                </label>
                <input
                  type="text"
                  value={shippingAddress.fullName}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, fullName: e.target.value })}
                  placeholder="John Doe"
                  required
                  className="cart-input"
                />
              </div>

              <div>
                <label className="cart-label">
                  Email <span style={{ color: '#d32f2f' }}>*</span>
                </label>
                <input
                  type="email"
                  value={shippingAddress.email}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, email: e.target.value })}
                  placeholder="john@example.com"
                  required
                  className="cart-input"
                />
              </div>

              <div>
                <label className="cart-label">
                  Address Line 1 <span style={{ color: '#d32f2f' }}>*</span>
                </label>
                <input
                  type="text"
                  value={shippingAddress.addressLine1}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, addressLine1: e.target.value })}
                  placeholder="123 Main St"
                  required
                  className="cart-input"
                />
              </div>

              <div>
                <label className="cart-label">
                  Address Line 2
                </label>
                <input
                  type="text"
                  value={shippingAddress.addressLine2}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, addressLine2: e.target.value })}
                  placeholder="Apt 4B (optional)"
                  className="cart-input"
                />
              </div>

              <div className="cart-form-grid-two-col">
                <div>
                  <label className="cart-label">
                    City <span style={{ color: '#d32f2f' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={shippingAddress.city}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
                    placeholder="New York"
                    required
                    className="cart-input"
                  />
                </div>

                <div>
                  <label className="cart-label">
                    State <span style={{ color: '#d32f2f' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={shippingAddress.state}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, state: e.target.value })}
                    placeholder="NY"
                    required
                    className="cart-input"
                  />
                </div>
              </div>

              <div className="cart-form-grid-two-col">
                <div>
                  <label className="cart-label">
                    ZIP Code <span style={{ color: '#d32f2f' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={shippingAddress.zipCode}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, zipCode: e.target.value })}
                    placeholder="10001"
                    required
                    className="cart-input"
                  />
                </div>

                <div>
                  <label className="cart-label">
                    Phone (optional)
                  </label>
                  <input
                    type="tel"
                    value={shippingAddress.phone}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, phone: e.target.value })}
                    placeholder="(555) 123-4567"
                    className="cart-input"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ...existing code... */}
          {/* Shipping Options Section - only show if physical products */}
          {shippingConfig && hasPhysicalProducts() && (
            <div className="cart-section-card">
              <h3>Shipping Options</h3>
              {/* Show batch shipping if active and before deadline */}
              {isBatchAvailable() && (
                <label className={`cart-shipping-option ${shippingOption === 'batch' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="shipping"
                    value="batch"
                    checked={shippingOption === 'batch'}
                    onChange={() => setShippingOption('batch')}
                  />
                  <strong>Batch Shipping - FREE</strong>
                  {getBatchDeadlineDate() ? (
                    <p>
                      Ships in {getDaysUntilDeadline()} days (by {formatDateInStudioTimezone(getBatchDeadlineDate())})
                    </p>
                  ) : (
                    <p>
                      Included with the next available batch shipment.
                    </p>
                  )}
                  {shippingOption === 'batch' && shippingConfig?.batchShippingNote && (
                    <div style={{ marginTop: 8, background: '#232336', color: '#bdbdbd', borderRadius: 6, padding: '8px 12px', fontSize: '0.98em' }}>
                      {shippingConfig.batchShippingNote}
                    </div>
                  )}
                </label>
              )}
              {/* Show direct shipping if any non-digital product is present */}
              {hasDirectShipProducts() && (
                <label className={`cart-shipping-option ${shippingOption === 'direct' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="shipping"
                    value="direct"
                    checked={shippingOption === 'direct'}
                    onChange={() => setShippingOption('direct')}
                  />
                  <span style={{ fontWeight: 600, fontSize: '1.1em', color: '#fff' }}>
                    Direct Shipping - ${getShippingCostFor('direct').toFixed(2)}
                  </span>
                  <p style={{ color: '#bdbdbd', margin: 0 }}>
                    Ships immediately (2-3 business days)
                  </p>
                </label>
              )}
              {!isBatchAvailable() && shippingOption === 'batch' && (
                <p className="cart-deadline-warning">
                  Batch shipping deadline has passed
                </p>
              )}
            </div>
          )}

          {/* Removed duplicate always-visible Shipping Options section. Only render above if !hasOnlyDigitalProducts() */}

          {/* Discount Code Section */}
          <div className="cart-section-card section-spacing">
            <h3>Discount Code</h3>
            
            {!appliedDiscount ? (
              <div>
                <div className="cart-discount-entry">
                  <input
                    type="text"
                    value={discountCode}
                    onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                    placeholder="Enter code"
                    className="cart-input cart-discount-input"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleApplyDiscount();
                      }
                    }}
                  />
                  <div className="cart-discount-actions">
                    <button
                      onClick={handleApplyDiscount}
                      disabled={!discountCode.trim()}
                      className="btn btn-secondary"
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      Apply Code
                    </button>
                    <button
                      onClick={() => findAndApplyBestDiscount('manual')}
                      disabled={bestDiscountSearchLoading}
                      className="btn btn-secondary"
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {bestDiscountSearchLoading ? 'Checking…' : 'Best Code'}
                    </button>
                  </div>
                </div>
                {discountError && (
                  <p className="cart-discount-error">
                    {discountError}
                  </p>
                )}
                {!discountError && discountInfo && (
                  <p className="cart-discount-applied" style={{ marginTop: 8 }}>
                    {discountInfo}
                  </p>
                )}
              </div>
            ) : (
              <div>
                <div className="cart-discount-applied">
                  <div>
                    <strong className="cart-discount-code">
                      {appliedDiscount.code}
                    </strong>
                    <p className="cart-discount-description">
                      {getDiscountSummaryText()}
                    </p>
                  </div>
                  <button
                    onClick={handleRemoveDiscount}
                    className="btn-icon"
                    style={{ fontSize: '1.2rem' }}
                    title="Remove discount"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>

          {hasPhysicalProducts() && (
            <div className="summary-row cart-summary-row">
              <span>Shipping</span>
              <span>${getShippingCost().toFixed(2)}</span>
            </div>
          )}
          
          {appliedDiscount && (
            <>
              <div className="summary-row cart-summary-row discount">
                <span>Discount ({appliedDiscount.code})</span>
                <span>-${getDiscountAmount().toFixed(2)}</span>
              </div>
              <div className="cart-discount-description" style={{ marginTop: -4, marginBottom: 10 }}>
                {getDiscountSummaryText()}
              </div>
            </>
          )}
          
          {shippingAddress.state && (
            <div className="summary-row cart-summary-row">
              <span>Tax ({shippingAddress.state.toUpperCase()})</span>
              {taxLoading ? (
                <span>Calculating...</span>
              ) : (
                <span>${taxAmount.toFixed(2)}</span>
              )}
            </div>
          )}
          
          <div className="summary-row cart-summary-row total">
            <span>Total</span>
            <span>${getFinalTotal().toFixed(2)}</span>
          </div>

          {stripeConfig && !stripeConfig.isActive && (
            <div className="cart-alert">
              ⚠️ Payments are currently unavailable
            </div>
          )}

          {stripeConfig && stripeConfig.isActive && !stripeConfig.isLiveMode && (
            <div className="cart-test-mode">
              🧪 Test Mode - Use card 4242 4242 4242 4242
            </div>
          )}

          {processingPayment && (
            <div className="cart-processing">
              🔒 Processing secure payment...
            </div>
          )}

          {error && (
            <div className="cart-alert" style={{ color: 'red', marginBottom: 12 }}>
              {error}
            </div>
          )}
          {/* Debug panel removed */}
          <div className="cart-actions">
            <button
              onClick={handleCheckout}
              className="btn btn-primary btn-checkout cart-action-button"
              disabled={loading || !stripeConfig?.publishableKey || stripeConfig.publishableKey.startsWith('sk_')}
            >
              {loading ? 'Processing Payment...' : '🔒 Pay with Stripe'}
            </button>
            <button
              onClick={handleTestOrder}
              className="btn btn-secondary cart-action-button"
              disabled={loading}
              style={{ marginLeft: 8 }}
            >
              🧪 Test Order (No Payment)
            </button>
            <button
              onClick={() => navigate('/albums')}
              className="btn btn-secondary cart-action-button"
            >
              Continue Shopping
            </button>
          </div>


        </div>
      </div>

      {editingItem && (
        <Modal isOpen={true} onClose={() => { setEditingItem(null); setEditingDrawnSize(null); }} contentClassName="cart-crop-modal">
          <CropperModal
            key={
              editingItem.photoId + '-' +
              (editingItem.productId || '') + '-' +
              (editingItem.productSizeId || '') + '-' +
              (editingItem.cropData ? `${editingItem.cropData.x}-${editingItem.cropData.y}-${editingItem.cropData.width}-${editingItem.cropData.height}` : 'nocrop') +
              '-' + (editingDrawnSize ? `${editingDrawnSize.width}x${editingDrawnSize.height}` : 'noSize')
            }
            item={editingItem}
            displayWidth={editingDrawnSize?.width}
            displayHeight={editingDrawnSize?.height}
            onClose={() => { setEditingItem(null); setEditingDrawnSize(null); }}
          />
        </Modal>
      )}

      {typeof activePaymentIntent !== 'undefined' && showPaymentModal && activePaymentIntent?.clientSecret && stripePromise && (
        <div className="cart-crop-modal-overlay">
          <div className="cart-payment-modal">
            <h3>Complete Payment</h3>
            <p className="cart-payment-subtitle">
              Total charge: ${getFinalTotal().toFixed(2)}
            </p>
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret: activePaymentIntent.clientSecret,
                appearance: {
                  theme: 'night',
                  variables: {
                    colorPrimary: '#a78bfa',
                    colorBackground: '#171726',
                    colorText: '#f3f4f6',
                    colorDanger: '#ff8a8a',
                    borderRadius: '10px',
                  },
                },
              }}
            >
              <StripePaymentForm
                shippingAddress={shippingAddress}
                onSuccess={async (paymentIntentId) => {
                  setProcessingPayment(true);
                  try {
                    await finalizeSuccessfulCheckout(paymentIntentId);
                  } finally {
                    setProcessingPayment(false);
                  }
                }}
                onCancel={() => {
                  setShowPaymentModal(false);
                  setActivePaymentIntent(null);
                }}
              />
            </Elements>
          </div>
        </div>
      )}


    </div>
  );
};

export default Cart;
