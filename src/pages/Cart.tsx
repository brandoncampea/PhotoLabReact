import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import CartItem from '../components/CartItem';
import CropperModal from '../components/CropperModal';
import { orderService } from '../services/orderService';
import { shippingService } from '../services/shippingService';
import { stripeService } from '../services/stripeService';
import { productService } from '../services/productService';
import { downloadService } from '../services/downloadService';
import { discountCodeService } from '../services/discountCodeService';
import { taxService } from '../services/taxService';
import { ShippingConfig, StripeConfig, Product, DiscountCode, ShippingAddress, CartItem as CartItemType } from '../types';
import { useAuth } from '../contexts/AuthContext';

const Cart: React.FC = () => {
  const { items, getTotalPrice, getTotalItems, clearCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shippingConfig, setShippingConfig] = useState<ShippingConfig | null>(null);
  const [stripeConfig, setStripeConfig] = useState<StripeConfig | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [shippingOption, setShippingOption] = useState<'batch' | 'direct'>('batch');
  const [processingPayment, setProcessingPayment] = useState(false);
  const [discountCode, setDiscountCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<DiscountCode | null>(null);
  const [discountError, setDiscountError] = useState('');
  const [editingItem, setEditingItem] = useState<CartItemType | null>(null);
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

  useEffect(() => {
    loadShippingConfig();
    loadStripeConfig();
    loadProducts();
  }, []);

  useEffect(() => {
    // Update email in shipping address when user changes
    if (user?.email) {
      setShippingAddress(prev => ({ ...prev, email: user.email }));
    }
  }, [user]);

  const loadProducts = async () => {
    try {
      const data = await productService.getActiveProducts();
      setProducts(data);
    } catch (error) {
      console.error('Failed to load products:', error);
    }
  };

  const loadStripeConfig = async () => {
    try {
      const config = await stripeService.getConfig();
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
    return new Date(shippingConfig.batchDeadline) > new Date();
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

  const getShippingCost = () => {
    if (hasOnlyDigitalProducts()) return 0; // No shipping for digital-only orders
    if (shippingOption === 'direct') {
      return shippingConfig?.directShippingCharge || 15.00;
    }
    return 0; // Batch shipping is free
  };

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

  const getTaxAmount = () => {
    const subtotal = getTotalPrice();
    const shipping = getShippingCost();
    const discount = getDiscountAmount();
    const subtotalAfterDiscount = subtotal + shipping - discount;
    
    const { taxAmount } = taxService.calculateTax(subtotalAfterDiscount, shippingAddress);
    return taxAmount;
  };

  const getFinalTotal = () => {
    const subtotal = getTotalPrice();
    const shipping = getShippingCost();
    const discount = getDiscountAmount();
    const tax = getTaxAmount();
    return Math.max(0, subtotal + shipping - discount + tax);
  };

  const getDaysUntilDeadline = () => {
    if (!shippingConfig) return 0;
    const days = Math.ceil((new Date(shippingConfig.batchDeadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
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
    setProcessingPayment(true);
    setError('');

    try {
      // Increment discount usage if applied
      if (appliedDiscount) {
        await discountCodeService.incrementUsage(appliedDiscount.id);
      }

      // Create payment intent with final total
      const paymentIntent = await stripeService.createPaymentIntent(
        items,
        shippingOption,
        getShippingCost(),
        getDiscountAmount()
      );

      // In a real implementation with Stripe Elements:
      // 1. Load Stripe.js
      // 2. Create payment form with card elements
      // 3. Confirm payment with clientSecret
      
      // For mock/demo purposes, simulate payment
      const result = await stripeService.confirmPayment(paymentIntent.id);
      
      if (result.success) {
        // Generate download URLs for digital products
        const digitalItems = items.filter(item => {
          const product = products.find(p => p.id === item.productId);
          return product?.isDigital === true;
        });

        let downloadUrls;
        if (digitalItems.length > 0) {
          downloadUrls = downloadService.generateDownloadUrls(digitalItems);
          
          // Send download email
          if (user?.email) {
            await downloadService.sendDownloadEmail(
              user.email,
              downloadUrls,
              `ORD-${Date.now()}`
            );
          }
        }

        // Create order after successful payment
        const orderNumber = `ORD-${Date.now()}`;
        await orderService.createOrder(items, shippingAddress, shippingOption, getShippingCost(), appliedDiscount?.code);
        
        // Send email receipt (in production, would call email service)
        console.log('📧 Email receipt sent to:', shippingAddress.email);
        console.log('Order Number:', orderNumber);
        console.log('Total Amount:', getFinalTotal());
        
        clearCart();
        
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
      } else {
        setError('Payment failed. Please try again.');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Payment failed. Please try again.');
    } finally {
      setLoading(false);
      setProcessingPayment(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1>Shopping Cart</h1>
        </div>
        <div className="empty-cart">
          <p>Your cart is empty</p>
          <button onClick={() => navigate('/albums')} className="btn btn-primary">
            Browse Albums
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Shopping Cart</h1>
        <p>{getTotalItems()} {getTotalItems() === 1 ? 'item' : 'items'}</p>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="cart-content">
        <div className="cart-items">
          {items.map((item) => (
            <CartItem 
              key={item.photoId} 
              item={item} 
              onEditCrop={(item) => setEditingItem(item)}
            />
          ))}
        </div>

        <div className="cart-summary">
          <h2>Order Summary</h2>
          <div className="summary-row">
            <span>Subtotal</span>
            <span>${getTotalPrice().toFixed(2)}</span>
          </div>

          {hasOnlyDigitalProducts() && (
            <div style={{
              padding: '0.75rem',
              backgroundColor: '#e3f2fd',
              border: '1px solid #4169E1',
              borderRadius: '6px',
              margin: '1rem 0',
              fontSize: '0.9rem',
              color: '#1565c0'
            }}>
              💾 <strong>Digital Downloads Only</strong>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem' }}>
                Download links will be emailed to you immediately after payment
              </p>
            </div>
          )}

          {/* Shipping Address Form */}
          <div style={{ margin: '1rem 0', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem' }}>Shipping Address</h3>
            
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: 500 }}>
                  Full Name <span style={{ color: '#d32f2f' }}>*</span>
                </label>
                <input
                  type="text"
                  value={shippingAddress.fullName}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, fullName: e.target.value })}
                  placeholder="John Doe"
                  required
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: 500 }}>
                  Email <span style={{ color: '#d32f2f' }}>*</span>
                </label>
                <input
                  type="email"
                  value={shippingAddress.email}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, email: e.target.value })}
                  placeholder="john@example.com"
                  required
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: 500 }}>
                  Address Line 1 <span style={{ color: '#d32f2f' }}>*</span>
                </label>
                <input
                  type="text"
                  value={shippingAddress.addressLine1}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, addressLine1: e.target.value })}
                  placeholder="123 Main St"
                  required
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: 500 }}>
                  Address Line 2
                </label>
                <input
                  type="text"
                  value={shippingAddress.addressLine2}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, addressLine2: e.target.value })}
                  placeholder="Apt 4B (optional)"
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: 500 }}>
                    City <span style={{ color: '#d32f2f' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={shippingAddress.city}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
                    placeholder="New York"
                    required
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: 500 }}>
                    State <span style={{ color: '#d32f2f' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={shippingAddress.state}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, state: e.target.value })}
                    placeholder="NY"
                    required
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: 500 }}>
                    ZIP Code <span style={{ color: '#d32f2f' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={shippingAddress.zipCode}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, zipCode: e.target.value })}
                    placeholder="10001"
                    required
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: 500 }}>
                    Phone (optional)
                  </label>
                  <input
                    type="tel"
                    value={shippingAddress.phone}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, phone: e.target.value })}
                    placeholder="(555) 123-4567"
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {shippingConfig && hasPhysicalProducts() && (
            <div style={{ margin: '1rem 0', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem' }}>Shipping Options</h3>
              
              {isBatchAvailable() && (
                <label style={{ 
                  display: 'block', 
                  marginBottom: '0.75rem', 
                  padding: '0.75rem',
                  backgroundColor: shippingOption === 'batch' ? '#e3f2fd' : '#fff',
                  border: `2px solid ${shippingOption === 'batch' ? '#4169E1' : '#ddd'}`,
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}>
                  <input
                    type="radio"
                    name="shipping"
                    value="batch"
                    checked={shippingOption === 'batch'}
                    onChange={() => setShippingOption('batch')}
                    style={{ marginRight: '0.5rem' }}
                  />
                  <strong>Batch Shipping - FREE</strong>
                  <p style={{ margin: '0.25rem 0 0 1.5rem', fontSize: '0.85rem', color: '#666' }}>
                    Ships in {getDaysUntilDeadline()} days (by {new Date(shippingConfig.batchDeadline).toLocaleDateString()})
                  </p>
                </label>
              )}

              <label style={{ 
                display: 'block', 
                padding: '0.75rem',
                backgroundColor: shippingOption === 'direct' ? '#e3f2fd' : '#fff',
                border: `2px solid ${shippingOption === 'direct' ? '#4169E1' : '#ddd'}`,
                borderRadius: '6px',
                cursor: 'pointer'
              }}>
                <input
                  type="radio"
                  name="shipping"
                  value="direct"
                  checked={shippingOption === 'direct'}
                  onChange={() => setShippingOption('direct')}
                  style={{ marginRight: '0.5rem' }}
                />
                <strong>Direct Shipping - ${shippingConfig.directShippingCharge.toFixed(2)}</strong>
                <p style={{ margin: '0.25rem 0 0 1.5rem', fontSize: '0.85rem', color: '#666' }}>
                  Ships immediately (2-3 business days)
                </p>
              </label>

              {!isBatchAvailable() && (
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: '#d32f2f' }}>
                  Batch shipping deadline has passed
                </p>
              )}
            </div>
          )}

          {/* Discount Code Section */}
          <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f5f5f5', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>Discount Code</h3>
            
            {!appliedDiscount ? (
              <div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    value={discountCode}
                    onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                    placeholder="Enter code"
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      textTransform: 'uppercase'
                    }}
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
                  <p style={{ color: '#d32f2f', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                    {discountError}
                  </p>
                )}
              </div>
            ) : (
              <div>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '0.75rem',
                  background: '#e8f5e9',
                  borderRadius: '4px',
                  border: '1px solid #4caf50'
                }}>
                  <div>
                    <strong style={{ fontFamily: 'monospace', color: '#2e7d32' }}>
                      {appliedDiscount.code}
                    </strong>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#666' }}>
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

          <div className="summary-row">
            <span>Shipping</span>
            <span>${getShippingCost().toFixed(2)}</span>
          </div>
          
          {appliedDiscount && (
            <div className="summary-row" style={{ color: '#4caf50' }}>
              <span>Discount ({appliedDiscount.code})</span>
              <span>-${getDiscountAmount().toFixed(2)}</span>
            </div>
          )}
          
          {shippingAddress.state && (
            <div className="summary-row">
              <span>Tax ({shippingAddress.state.toUpperCase()})</span>
              <span>${getTaxAmount().toFixed(2)}</span>
            </div>
          )}
          
          <div className="summary-row total">
            <span>Total</span>
            <span>${getFinalTotal().toFixed(2)}</span>
          </div>

          {stripeConfig && !stripeConfig.isActive && (
            <div style={{
              padding: '0.75rem',
              backgroundColor: '#fff3cd',
              border: '1px solid #ffc107',
              borderRadius: '6px',
              marginBottom: '1rem',
              fontSize: '0.9rem',
              color: '#856404'
            }}>
              ⚠️ Payments are currently unavailable
            </div>
          )}

          {stripeConfig && stripeConfig.isActive && !stripeConfig.isLiveMode && (
            <div style={{
              padding: '0.5rem',
              backgroundColor: '#e3f2fd',
              border: '1px solid #90caf9',
              borderRadius: '6px',
              marginBottom: '1rem',
              fontSize: '0.85rem',
              color: '#1565c0',
              textAlign: 'center'
            }}>
              🧪 Test Mode - Use card 4242 4242 4242 4242
            </div>
          )}

          {processingPayment && (
            <div style={{
              padding: '0.75rem',
              backgroundColor: '#e3f2fd',
              border: '1px solid #4169E1',
              borderRadius: '6px',
              marginBottom: '1rem',
              fontSize: '0.9rem',
              color: '#1565c0',
              textAlign: 'center'
            }}>
              🔒 Processing secure payment...
            </div>
          )}

          <button
            onClick={handleCheckout}
            className="btn btn-primary btn-checkout"
            disabled={loading || !stripeConfig?.isActive}
          >
            {loading ? 'Processing Payment...' : '🔒 Pay with Stripe'}
          </button>
          <button
            onClick={() => navigate('/albums')}
            className="btn btn-secondary"
          >
            Continue Shopping
          </button>
        </div>
      </div>

      {editingItem && (
        <CropperModal
          photo={editingItem.photo}
          onClose={() => setEditingItem(null)}
          editMode={true}
          existingCropData={editingItem.cropData}
          existingQuantity={editingItem.quantity}
          existingProductId={editingItem.productId}
          existingProductSizeId={editingItem.productSizeId}
        />
      )}
    </div>
  );
};

export default Cart;
