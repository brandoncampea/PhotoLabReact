import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import Cropper from 'react-cropper';
import { getPhotoAssetUrl } from '../utils/getPhotoAssetUrl';
import { getCropAspectRatioForPhotoAndProduct } from '../utils/getCropAspectRatio';
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
import { superPriceListService } from '../services/superPriceListService';
import { ShippingConfig, StripeConfig, Product, DiscountCode, ShippingAddress, CartItem as CartItemType, PaymentIntent, ShippingQuote } from '../types';
import { useAuth } from '../contexts/AuthContext';

const Cart: React.FC = () => {
  const { items, getTotalPrice, getTotalItems, clearCart, updateCropData } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shippingConfig, setShippingConfig] = useState<ShippingConfig | null>(null);
  const [shippingQuote, setShippingQuote] = useState<ShippingQuote | null>(null);
  const [stripeConfig, setStripeConfig] = useState<StripeConfig | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [shippingOption, setShippingOption] = useState<'batch' | 'direct'>('batch');
  const [processingPayment, setProcessingPayment] = useState(false);
  const [discountCode, setDiscountCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<DiscountCode | null>(null);
  const [discountError, setDiscountError] = useState('');
  const [editingItem, setEditingItem] = useState<CartItemType | null>(null);
  const [cropperRef, setCropperRef] = useState<any>(null);
  const [activePaymentIntent, setActivePaymentIntent] = useState<PaymentIntent | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const [studioFees, setStudioFees] = useState<{ feeType: string; feeValue: number } | null>(null);
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>({
    fullName: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'United States',
    email: user?.email || '',
    phone: ''
  });

  const stripePromise = useMemo(() => {
    if (!stripeConfig?.publishableKey) return null;
    if (stripeConfig.publishableKey.startsWith('sk_')) return null;
    return loadStripe(stripeConfig.publishableKey);
  }, [stripeConfig?.publishableKey]);

  const [productImages, setProductImages] = useState<Record<number, string>>({});
  const [categoryImages, setCategoryImages] = useState<Record<string, string>>({});

  useEffect(() => {
    loadShippingConfig();
    loadStripeConfig();
    loadStudioFees();
  }, []);

  useEffect(() => {
    loadProducts();
    // Fallback: try to get a super price list ID from the first product if available
    const priceListId = (products[0] as any)?.super_price_list_id;
    if (priceListId) {
      superPriceListService.getProductImages(priceListId).then((data) => {
        const map: Record<number, string> = {};
        (data || []).forEach((row: any) => {
          if (row.product_id && row.image_url) map[Number(row.product_id)] = row.image_url;
        });
        setProductImages(map);
      });
      superPriceListService.getCategoryImages(priceListId).then((data) => {
        const map: Record<string, string> = {};
        (data || []).forEach((row: any) => {
          if (row.category_name && row.image_url) map[String(row.category_name)] = row.image_url;
        });
        setCategoryImages(map);
      });
    }
  }, [items]);

  useEffect(() => {
    // Update email in shipping address when user changes
    if (user?.email) {
      setShippingAddress(prev => ({ ...prev, email: user.email }));
    }
  }, [user]);

  useEffect(() => {
    const shouldQuote = !!shippingConfig && hasPhysicalProducts();
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
  }, [shippingConfig, shippingOption, shippingAddress, items]);

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

      if (albumIds.length === 0) {
        const data = await productService.getActiveProducts();
        setProducts(Array.isArray(data) ? data : []);
        return;
      }

      const productsByAlbum = await Promise.all(
        albumIds.map((albumId) => productService.getActiveProducts(albumId))
      );

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

      setProducts(Array.from(merged.values()));
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
      return shippingConfig?.directShippingCharge || 15.00;
    }
    return 0;
  };

  // For backward compatibility in other usages
  const getShippingCost = () => getShippingCostFor(shippingOption);

  const handleApplyDiscount = async () => {
    if (!discountCode.trim()) return;
    
    setDiscountError('');
    try {
      const code = await discountCodeService.getByCode(discountCode.trim());
      
      if (!code) {
        setDiscountError('Invalid or expired discount code');
        return;
      }
      
      setAppliedDiscount(code);
      setDiscountError('');
    } catch (error) {
      setDiscountError('Failed to apply discount code');
    }
  };

  const handleRemoveDiscount = () => {
    setAppliedDiscount(null);
    setDiscountCode('');
    setDiscountError('');
  };

  const getDiscountAmount = () => {
    if (!appliedDiscount) return 0;
    
    const subtotal = getTotalPrice();
    
    if (appliedDiscount.applicationType === 'entire-order') {
      if (appliedDiscount.discountType === 'percentage') {
        return (subtotal * appliedDiscount.discountValue) / 100;
      } else {
        return Math.min(appliedDiscount.discountValue, subtotal);
      }
    } else {
      // Specific products
      let discountableTotal = 0;
      items.forEach(item => {
        if (item.productId && appliedDiscount.applicableProductIds.includes(item.productId)) {
          const product = products.find(p => p.id === item.productId);
          const size = product?.sizes.find(s => s.id === item.productSizeId);
          if (product && size) {
            const itemPrice = size.price;
            discountableTotal += itemPrice * item.quantity;
          }
        }
      });
      
      if (appliedDiscount.discountType === 'percentage') {
        return (discountableTotal * appliedDiscount.discountValue) / 100;
      } else {
        return Math.min(appliedDiscount.discountValue, discountableTotal);
      }
    }
  };

  const [taxAmount, setTaxAmount] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [taxLoading, setTaxLoading] = useState(false);
  const [taxError, setTaxError] = useState('');

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

    // Use Stripe Tax if Stripe is active
    if (stripeConfig?.isActive) {
      try {
        const { stripeTaxService } = await import('../services/stripeTaxService');
        const result = await stripeTaxService.calculateTax({
          items,
          shippingAddress,
          currency: 'usd',
        });
        setTaxAmount(result.taxAmount);
        setTaxRate(result.taxRate);
        setTaxLoading(false);
        return;
      } catch (err) {
        setTaxError('Failed to calculate tax with Stripe. Using fallback.');
      }
    }
    // Fallback to manual taxService
    const { taxAmount, taxRate } = taxService.calculateTax(subtotalAfterDiscount, shippingAddress);
    setTaxAmount(taxAmount);
    setTaxRate(taxRate);
    setTaxLoading(false);
  };

  useEffect(() => {
    calculateTaxAmount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, shippingOption, shippingAddress, appliedDiscount, studioFees, stripeConfig]);

  const getFinalTotal = () => {
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

  const getItemAspectRatio = (item: CartItemType | null): number => {
    if (!item || !item.productId || !item.productSizeId) return NaN;
    const product = products.find((p) => p.id === item.productId);
    const size = product?.sizes?.find((s) => s.id === item.productSizeId);
    const width = Number(size?.width || 0);
    const height = Number(size?.height || 0);
    if (width > 0 && height > 0) return width / height;
    return NaN;
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

    return {
      ...item,
      productName: item.productName || resolvedProduct?.name || (item.productId ? `Product #${item.productId}` : 'Product'),
      productSizeName: item.productSizeName || resolvedSize?.name || (item.productSizeId ? `Size #${item.productSizeId}` : 'Size'),
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


      // Add orientation/aspect ratio logic for WHCC editor
      const getOrientationAndAspect = (photo: any, productId: number, productSizeId: number) => {
        let aspectRatio = 1;
        let orientation = 'portrait';
        if (photo && Array.isArray(photo.products)) {
          const product = photo.products.find((p: any) => p.id === productId);
          const size = product?.sizes?.find((s: any) => s.id === productSizeId);
          if (size && size.width && size.height) {
            aspectRatio = Number(size.width) / Number(size.height);
            orientation = aspectRatio >= 1 ? 'landscape' : 'portrait';
          }
        } else if (photo?.width && photo?.height) {
          aspectRatio = Number(photo.width) / Number(photo.height);
          orientation = aspectRatio >= 1 ? 'landscape' : 'portrait';
        }
        return { aspectRatio, orientation };
      };

      const photos = Array.isArray(item.photos)
        ? item.photos.map((entry) => {
            const { aspectRatio, orientation } = getOrientationAndAspect(entry?.photo, item.productId, item.productSizeId);
            return {
              id: entry?.photo?.id,
              name: entry?.photo?.fileName,
              thumbnailUrl: entry?.photo?.thumbnailUrl,
              fullImageUrl: entry?.photo?.fullImageUrl,
              width: entry?.photo?.width || entry?.photo?.metadata?.width,
              height: entry?.photo?.height || entry?.photo?.metadata?.height,
              aspectRatio,
              orientation,
            };
          })
        : item.photo
        ? [{
            id: item.photo.id,
            name: item.photo.fileName,
            thumbnailUrl: item.photo.thumbnailUrl,
            fullImageUrl: item.photo.fullImageUrl,
            width: item.photo.width || item.photo.metadata?.width,
            height: item.photo.height || item.photo.metadata?.height,
            ...getOrientationAndAspect(item.photo, item.productId, item.productSizeId),
          }]
        : [];

      if (!item.productId) {
        setError('This cart item is missing a product ID and cannot open the WHCC editor.');
        return;
      }

      const session = await whccEditorService.createSession({
        productId: Number(item.productId),
        quantity: Number(item.quantity) || 1,
        photoIds,
        photos,
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

  const handleSaveCrop = () => {
    if (!editingItem) return;
    const cropper = cropperRef?.cropper || cropperRef;
    if (!cropper?.getData) return;
    const data = cropper.getData();
    updateCropData(editingItem.photoId, {
      x: Math.round(data.x),
      y: Math.round(data.y),
      width: Math.round(data.width),
      height: Math.round(data.height),
      rotate: 0,
      scaleX: 1,
      scaleY: 1,
    }, editingItem.productId, editingItem.productSizeId);
    setEditingItem(null);
    setCropperRef(null);
  };

  const finalizeSuccessfulCheckout = async (paymentIntentId: string) => {
    // Increment discount usage if applied
    if (appliedDiscount) {
      await discountCodeService.incrementUsage(appliedDiscount.id);
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
    const orderResult = await orderService.createOrder(
      items,
      shippingAddress,
      shippingOption,
      getShippingCost(),
      appliedDiscount?.code,
      studioFees?.feeType,
      studioFees?.feeValue,
      paymentIntentId
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

    console.log('📧 Email receipt sent to:', shippingAddress.email);
    console.log('Order Number:', orderResult?.id || 'N/A');
    console.log('Total Amount:', getFinalTotal());

    clearCart();
    setShowPaymentModal(false);
    setActivePaymentIntent(null);

    let successMessage = 'Payment successful! Your order has been placed. A receipt has been sent to ' + shippingAddress.email + '.';

    if (hasOnlyDigitalProducts()) {
      successMessage += ' Download links have been sent to your email.';
    } else if (digitalItems.length > 0) {
      successMessage += ` Download links for digital items have been sent to your email. Physical items will ${
        shippingOption === 'batch'
          ? `ship on ${new Date(shippingConfig?.batchDeadline || '').toLocaleDateString()}.`
          : 'ship within 2-3 business days.'
      }`;
    } else {
      successMessage += ` ${
        shippingOption === 'batch'
          ? `It will ship on ${new Date(shippingConfig?.batchDeadline || '').toLocaleDateString()}.`
          : 'It will ship within 2-3 business days.'
      }`;
    }

    navigate('/orders', { state: { message: successMessage } });
  };

  const handleCheckout = async () => {
    if (items.length === 0) return;

    if (!stripeConfig?.isActive) {
      setError('Payment processing is currently unavailable. Please try again later.');
      return;
    }

    // Validate shipping address
    if (!shippingAddress.fullName || !shippingAddress.addressLine1 || 
        !shippingAddress.city || !shippingAddress.state || !shippingAddress.zipCode || !shippingAddress.email) {
      setError('Please complete all required shipping address fields.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Create payment intent with final total
      const paymentIntent = await stripeService.createPaymentIntent(
        items,
        shippingOption,
        getShippingCost(),
        getDiscountAmount(),
        getTaxAmount(),
        getStudioFeeAmount()
      );

      if (!paymentIntent.clientSecret) {
        setError('Payment initialization failed. Please try again.');
        return;
      }

      const publishableIsLive = !!stripeConfig?.publishableKey?.startsWith('pk_live_');
      if (typeof paymentIntent.livemode === 'boolean' && paymentIntent.livemode !== publishableIsLive) {
        setError('Stripe configuration mismatch: publishable key mode does not match payment intent mode. Please verify Stripe keys.');
        return;
      }

      setActivePaymentIntent(paymentIntent);
      setShowPaymentModal(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Payment failed. Please try again.');
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
          {items.map((item) => (
            <CartItem
              key={item.photoId + '-' + (item.productId || '') + '-' + (item.productSizeId || '')}
              item={getResolvedCartItem(item)}
              onEditCrop={setEditingItem}
              onOpenWhccEditor={handleOpenWhccEditor}
              studioId={user?.studioId}
            />
          ))}
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

          {shippingConfig && hasPhysicalProducts() && (
            <div className="cart-section-card">
              <h3>Shipping Options</h3>
              
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
                      Ships in {getDaysUntilDeadline()} days (by {getBatchDeadlineDate()!.toLocaleDateString()})
                    </p>
                  ) : (
                    <p>
                      Included with the next available batch shipment.
                    </p>
                  )}
                  {/* Show batch shipping note if present and batch is selected */}
                  {shippingOption === 'batch' && shippingConfig?.batchShippingNote && (
                    <div style={{ marginTop: 8, background: '#232336', color: '#bdbdbd', borderRadius: 6, padding: '8px 12px', fontSize: '0.98em' }}>
                      {shippingConfig.batchShippingNote}
                    </div>
                  )}
                </label>
              )}

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

              {!isBatchAvailable() && shippingOption === 'batch' && (
                <p className="cart-deadline-warning">
                  Batch shipping deadline has passed
                </p>
              )}
            </div>
          )}

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
                  <button
                    onClick={handleApplyDiscount}
                    disabled={!discountCode.trim()}
                    className="btn btn-secondary"
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    Apply Code
                  </button>
                </div>
                {discountError && (
                  <p className="cart-discount-error">
                    {discountError}
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
                      {appliedDiscount.description}
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

          <div className="summary-row cart-summary-row">
            <span>Shipping</span>
            <span>${getShippingCost().toFixed(2)}</span>
          </div>
          
          {appliedDiscount && (
            <div className="summary-row cart-summary-row discount">
              <span>Discount ({appliedDiscount.code})</span>
              <span>-${getDiscountAmount().toFixed(2)}</span>
            </div>
          )}
          
          {shippingAddress.state && (
            <div className="summary-row cart-summary-row">
              <span>Tax ({shippingAddress.state.toUpperCase()})</span>
              {taxLoading ? (
                <span>Calculating...</span>
              ) : taxError ? (
                <span style={{ color: 'red' }}>{taxError}</span>
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

          <div className="cart-actions">
            <button
              onClick={handleCheckout}
              className="btn btn-primary btn-checkout cart-action-button"
              disabled={loading || !stripeConfig?.isActive}
            >
              {loading ? 'Processing Payment...' : '🔒 Pay with Stripe'}
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
        <div className="cart-crop-modal-overlay">
          <div className="cart-crop-modal">
            <h3>Edit Crop</h3>
            <div className="cart-crop-frame">
              <Cropper
                ref={setCropperRef}
                // Always use SAS-protected URL for Azure blobs
                src={getPhotoAssetUrl(editingItem.photo || editingItem)}
                crossOrigin="anonymous"
                style={{ maxHeight: 500, width: '100%' }}
                aspectRatio={(() => {
                  const photo = editingItem.photo || editingItem;
                  const product = products.find((p) => p.id === editingItem.productId);
                  const size = product?.sizes?.find((s) => s.id === editingItem.productSizeId);
                  if (photo && size) {
                    return getCropAspectRatioForPhotoAndProduct({
                      photoWidth: Number(photo.width || photo.metadata?.width || 0),
                      photoHeight: Number(photo.height || photo.metadata?.height || 0),
                      productWidth: Number(size.width || 0),
                      productHeight: Number(size.height || 0),
                    });
                  }
                  return NaN;
                })()}
                viewMode={1}
                guides={true}
                responsive={true}
                autoCropArea={1}
                minContainerHeight={200}
                minContainerWidth={200}
                onInitialized={(cropper) => {
                  setCropperRef(cropper);
                  if (editingItem.cropData) {
                    cropper.setData({
                      x: editingItem.cropData.x,
                      y: editingItem.cropData.y,
                      width: editingItem.cropData.width,
                      height: editingItem.cropData.height,
                    });
                  }
                }}
              />
            </div>
            <div className="cart-crop-actions">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  const cropper = cropperRef?.cropper || cropperRef;
                  if (cropper?.reset) cropper.reset();
                }}
              >
                Reset Crop
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setEditingItem(null);
                  setCropperRef(null);
                }}
              >
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveCrop}>Save Crop</button>
            </div>
          </div>
        </div>
      )}

      {showPaymentModal && activePaymentIntent?.clientSecret && stripePromise && (
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
