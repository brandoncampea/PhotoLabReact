import { useState } from 'react';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { processCheckout } from '../services/checkoutService';
import { roesService } from '../services/roesService';

/**
 * Example: How to integrate checkout with ROES
 * This shows how to use the checkout service in your Cart/Checkout page
 */
export function CheckoutWithRoesExample() {
  const { items: cart, clearCart } = useCart();
  const { user } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const roesEnabled = roesService.isEnabled();

  const handleCheckout = async () => {
    if (!user || !user.email) {
      setError('User not logged in');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const result = await processCheckout({
        customer: {
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          email: user.email,
          phone: (user as any).phone,
        },
        cartItems: cart,
        notes: 'Order from photo lab app',
      });

      setSuccess(true);
      console.log('Order submitted:', result);

      // Clear cart after successful submission
      clearCart();

      // Redirect or show success message
      // navigate('/orders', { state: { orderId: result.orderId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!cart || cart.length === 0) {
    return <div>Cart is empty</div>;
  }

  return (
    <div>
      <h2>Checkout</h2>
      {roesEnabled && (
        <div className="roes-enabled-notification">
          ✓ ROES is enabled — orders will be submitted to ROES backend
        </div>
      )}

      {error && (
        <div className="roes-error-notification">
          Error: {error}
        </div>
      )}

      {success && (
        <div className="roes-success-notification">
          ✓ Order submitted successfully!
        </div>
      )}

      <button
        onClick={handleCheckout}
        disabled={isProcessing || cart.length === 0}
        className={`roes-submit-btn${isProcessing ? ' disabled' : ''}`}
      >
        {isProcessing ? 'Processing...' : `Submit Order (${roesEnabled ? 'ROES' : 'Standard'})`}
      </button>
    </div>
  );
}

export default CheckoutWithRoesExample;
