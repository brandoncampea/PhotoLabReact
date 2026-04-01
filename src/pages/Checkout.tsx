import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { ShippingAddress } from '../types';
import { processCheckout } from '../services/checkoutService';

const Checkout: React.FC = () => {
  const { user } = useAuth();
  const { items: cart, clearCart } = useCart();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [step, setStep] = useState<'review' | 'shipping' | 'payment' | 'confirmation'>('review');

  // Form state
  const [shippingInfo, setShippingInfo] = useState<ShippingAddress>({
    fullName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'US',
    email: user?.email || '',
    phone: '',
  });

  const [orderConfirmation, setOrderConfirmation] = useState<any>(null);

  // Calculate totals
  const subtotal = useMemo(() => {
    return cart.reduce((sum: number, item: any) => sum + item.price * item.quantity, 0);
  }, [cart]);

  const shippingCost = useMemo(() => {
    if (subtotal === 0) return 0;
    // Example: flat rate shipping
    return 10;
  }, [subtotal]);

  const tax = useMemo(() => {
    // Example: 8% tax
    return (subtotal + shippingCost) * 0.08;
  }, [subtotal, shippingCost]);

  const total = subtotal + shippingCost + tax;

  // Validation functions
  const isCartValid = useMemo(() => {
    return cart && cart.length > 0;
  }, [cart]);

  const isShippingValid = useMemo(() => {
    return (
      shippingInfo.fullName &&
      shippingInfo.addressLine1 &&
      shippingInfo.city &&
      shippingInfo.state &&
      shippingInfo.zipCode &&
      shippingInfo.email
    );
  }, [shippingInfo]);

  const handleShippingChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setShippingInfo((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmitOrder = async () => {
    if (!user) {
      setError('You must be logged in to place an order');
      return;
    }

    if (!isShippingValid) {
      setError('Please fill in all required shipping fields');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const checkoutRequest = {
        customer: {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: shippingInfo.phone,
          address: {
            addr1: shippingInfo.addressLine1,
            addr2: shippingInfo.addressLine2,
            city: shippingInfo.city,
            state: shippingInfo.state,
            zip: shippingInfo.zipCode,
            country: shippingInfo.country || 'US',
          },
        },
        cartItems: cart,
        shippingAddress: shippingInfo,
      };

      const result = await processCheckout(checkoutRequest);

      if (result.success) {
        setOrderConfirmation(result);
        setStep('confirmation');
        clearCart();
        setSuccessMessage('Order placed successfully!');
      } else {
        setError(result.message || 'Failed to place order');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place order');
      console.error('Checkout error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Redirect to cart if empty and not in confirmation
  if (!isCartValid && step !== 'confirmation') {
    return (
      <div className="main-content dark-bg albums-full-height">
        <div className="empty-state">
          <h2>Cart is empty</h2>
          <p>Add items to your cart before checking out.</p>
          <Link to="/albums" className="btn btn-primary">Back to Albums</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="main-content dark-bg albums-full-height" style={{ paddingBottom: 40 }}>
      <div className="page-header" style={{ marginBottom: 20 }}>
        <h1 className="gradient-text">Checkout</h1>
      </div>

      {error && (
        <div style={{ background: '#3d2a2a', border: '1px solid #8b4d4d', borderRadius: 8, padding: 12, marginBottom: 16, color: '#ff9a9a' }}>
          {error}
        </div>
      )}

      {successMessage && (
        <div style={{ background: '#2a3d2a', border: '1px solid #4d8b4d', borderRadius: 8, padding: 12, marginBottom: 16, color: '#79d279' }}>
          {successMessage}
        </div>
      )}

      {/* Step Indicator */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        {['review', 'shipping', 'payment', 'confirmation'].map((s, i) => (
          <div
            key={s}
            style={{
              flex: 1,
              height: 4,
              background: step === s || (i < ['review', 'shipping', 'payment', 'confirmation'].indexOf(step)) ? '#7b61ff' : '#2a2740',
              borderRadius: 2,
            }}
          />
        ))}
      </div>

      {/* Review Step */}
      {step === 'review' && (
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ marginTop: 0, marginBottom: 16 }}>Order Review</h2>

          {cart.length === 0 ? (
            <div style={{ color: '#999' }}>Your cart is empty</div>
          ) : (
            <>
              <div style={{ border: '1px solid #2a2740', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                {cart.map((item: any, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '100px 1fr auto',
                      gap: 12,
                      padding: 12,
                      borderBottom: idx < cart.length - 1 ? '1px solid #2a2740' : undefined,
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ background: '#0f0f16', borderRadius: 4, overflow: 'hidden', height: 100 }}>
                      <img
                        src={item.photo.thumbnailUrl || item.photo.fullImageUrl}
                        alt={item.photo.fileName}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{item.photo.fileName}</div>
                      <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
                        Qty: {item.quantity} × ${Number(item.price || 0).toFixed(2)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontWeight: 600, minWidth: 80 }}>
                      ${Number((item.price * item.quantity) || 0).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Order Summary */}
              <div style={{ border: '1px solid #2a2740', borderRadius: 8, padding: 16, marginBottom: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, marginBottom: 12 }}>
                  <div>Subtotal</div>
                  <div>${Number(subtotal).toFixed(2)}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, marginBottom: 12 }}>
                  <div>Shipping</div>
                  <div>${Number(shippingCost).toFixed(2)}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, marginBottom: 12, borderBottom: '1px solid #2a2740', paddingBottom: 12 }}>
                  <div>Tax (estimated)</div>
                  <div>${Number(tax).toFixed(2)}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, fontSize: 18, fontWeight: 700, color: '#7b61ff' }}>
                  <div>Total</div>
                  <div>${Number(total).toFixed(2)}</div>
                </div>
              </div>

              <button
                className="btn btn-primary"
                onClick={() => setStep('shipping')}
                style={{ width: '100%' }}
              >
                Continue to Shipping
              </button>
            </>
          )}
        </div>
      )}

      {/* Shipping Step */}
      {step === 'shipping' && (
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ marginTop: 0, marginBottom: 16 }}>Shipping Address</h2>

          <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#aaa' }}>Full Name *</label>
              <input
                type="text"
                name="fullName"
                value={shippingInfo.fullName}
                onChange={handleShippingChange}
                style={{
                  width: '100%',
                  padding: '10px 8px',
                  background: '#0f0f16',
                  border: '1px solid #2a2740',
                  borderRadius: 6,
                  color: '#fff',
                  boxSizing: 'border-box',
                }}
                placeholder="John Doe"
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#aaa' }}>Email *</label>
              <input
                type="email"
                name="email"
                value={shippingInfo.email}
                onChange={handleShippingChange}
                style={{
                  width: '100%',
                  padding: '10px 8px',
                  background: '#0f0f16',
                  border: '1px solid #2a2740',
                  borderRadius: 6,
                  color: '#fff',
                  boxSizing: 'border-box',
                }}
                placeholder="john@example.com"
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#aaa' }}>Phone</label>
              <input
                type="tel"
                name="phone"
                value={shippingInfo.phone}
                onChange={handleShippingChange}
                style={{
                  width: '100%',
                  padding: '10px 8px',
                  background: '#0f0f16',
                  border: '1px solid #2a2740',
                  borderRadius: 6,
                  color: '#fff',
                  boxSizing: 'border-box',
                }}
                placeholder="(555) 123-4567"
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#aaa' }}>Address Line 1 *</label>
              <input
                type="text"
                name="addressLine1"
                value={shippingInfo.addressLine1}
                onChange={handleShippingChange}
                style={{
                  width: '100%',
                  padding: '10px 8px',
                  background: '#0f0f16',
                  border: '1px solid #2a2740',
                  borderRadius: 6,
                  color: '#fff',
                  boxSizing: 'border-box',
                }}
                placeholder="123 Main St"
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#aaa' }}>Address Line 2</label>
              <input
                type="text"
                name="addressLine2"
                value={shippingInfo.addressLine2}
                onChange={handleShippingChange}
                style={{
                  width: '100%',
                  padding: '10px 8px',
                  background: '#0f0f16',
                  border: '1px solid #2a2740',
                  borderRadius: 6,
                  color: '#fff',
                  boxSizing: 'border-box',
                }}
                placeholder="Apt 4B"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#aaa' }}>City *</label>
                <input
                  type="text"
                  name="city"
                  value={shippingInfo.city}
                  onChange={handleShippingChange}
                  style={{
                    width: '100%',
                    padding: '10px 8px',
                    background: '#0f0f16',
                    border: '1px solid #2a2740',
                    borderRadius: 6,
                    color: '#fff',
                    boxSizing: 'border-box',
                  }}
                  placeholder="New York"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#aaa' }}>State *</label>
                <input
                  type="text"
                  name="state"
                  value={shippingInfo.state}
                  onChange={handleShippingChange}
                  style={{
                    width: '100%',
                    padding: '10px 8px',
                    background: '#0f0f16',
                    border: '1px solid #2a2740',
                    borderRadius: 6,
                    color: '#fff',
                    boxSizing: 'border-box',
                  }}
                  placeholder="NY"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#aaa' }}>ZIP Code *</label>
                <input
                  type="text"
                  name="zipCode"
                  value={shippingInfo.zipCode}
                  onChange={handleShippingChange}
                  style={{
                    width: '100%',
                    padding: '10px 8px',
                    background: '#0f0f16',
                    border: '1px solid #2a2740',
                    borderRadius: 6,
                    color: '#fff',
                    boxSizing: 'border-box',
                  }}
                  placeholder="10001"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#aaa' }}>Country *</label>
                <select
                  name="country"
                  value={shippingInfo.country}
                  onChange={handleShippingChange}
                  style={{
                    width: '100%',
                    padding: '10px 8px',
                    background: '#0f0f16',
                    border: '1px solid #2a2740',
                    borderRadius: 6,
                    color: '#fff',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="US">United States</option>
                  <option value="CA">Canada</option>
                  <option value="GB">United Kingdom</option>
                </select>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn btn-secondary"
              onClick={() => setStep('review')}
              style={{ flex: 1 }}
            >
              Back to Review
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setStep('payment')}
              disabled={!isShippingValid}
              style={{ flex: 1 }}
            >
              Continue to Payment
            </button>
          </div>
        </div>
      )}

      {/* Payment Step */}
      {step === 'payment' && (
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ marginTop: 0, marginBottom: 16 }}>Order Summary</h2>

          <div style={{ border: '1px solid #2a2740', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Shipping Address</div>
              <div style={{ fontSize: 12, color: '#aaa' }}>
                <div>{shippingInfo.fullName}</div>
                <div>{shippingInfo.addressLine1}</div>
                {shippingInfo.addressLine2 && <div>{shippingInfo.addressLine2}</div>}
                <div>{shippingInfo.city}, {shippingInfo.state} {shippingInfo.zipCode}</div>
                <div style={{ marginTop: 8 }}>{shippingInfo.email}</div>
              </div>
            </div>
          </div>

          <div style={{ border: '1px solid #2a2740', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, marginBottom: 12 }}>
              <div>Subtotal</div>
              <div>${Number(subtotal).toFixed(2)}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, marginBottom: 12 }}>
              <div>Shipping</div>
              <div>${Number(shippingCost).toFixed(2)}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, marginBottom: 12, borderBottom: '1px solid #2a2740', paddingBottom: 12 }}>
              <div>Tax</div>
              <div>${Number(tax).toFixed(2)}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, fontSize: 18, fontWeight: 700, color: '#7b61ff' }}>
              <div>Total</div>
              <div>${Number(total).toFixed(2)}</div>
            </div>
          </div>

          <div style={{ background: '#2a2740', border: '1px solid #3a3750', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: '#aaa' }}>
            Payment processing is handled by our integrated payment processor. Click "Place Order" to complete your purchase.
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn btn-secondary"
              onClick={() => setStep('shipping')}
              style={{ flex: 1 }}
            >
              Back
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSubmitOrder}
              disabled={loading}
              style={{ flex: 1 }}
            >
              {loading ? 'Processing...' : 'Place Order'}
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Step */}
      {step === 'confirmation' && orderConfirmation && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
            <h2 style={{ color: '#79d279', marginTop: 0 }}>Order Placed Successfully!</h2>
          </div>

          <div style={{ border: '1px solid #2a2740', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: '#aaa', marginBottom: 4 }}>Order ID</div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{orderConfirmation.orderId || orderConfirmation.confirmationId || 'N/A'}</div>
            </div>
            <div style={{ marginBottom: 12, borderTop: '1px solid #2a2740', paddingTop: 12 }}>
              <div style={{ fontSize: 12, color: '#aaa', marginBottom: 4 }}>Total Amount</div>
              <div style={{ fontWeight: 600, fontSize: 18, color: '#7b61ff' }}>${Number(orderConfirmation.total || total).toFixed(2)}</div>
            </div>
            {orderConfirmation.message && (
              <div style={{ marginTop: 12, fontSize: 12, color: '#aaa' }}>
                {orderConfirmation.message}
              </div>
            )}
          </div>

          <div style={{ background: '#2a3d2a', border: '1px solid #4d8b4d', borderRadius: 8, padding: 12, marginBottom: 16, color: '#79d279', fontSize: 12 }}>
            A confirmation email has been sent to {shippingInfo.email}. You can track your order status in your account.
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <Link to="/albums" className="btn btn-primary" style={{ flex: 1, textAlign: 'center' }}>
              Continue Shopping
            </Link>
            <Link to="/orders" className="btn btn-secondary" style={{ flex: 1, textAlign: 'center' }}>
              View Orders
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default Checkout;
